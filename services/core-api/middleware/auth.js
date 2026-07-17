const jwt = require('jsonwebtoken');
const { verifyPlatformSso } = require('./platformSso');
const { resolvePlatformSsoUser } = require('../services/platformSsoAccountService');

exports.verifyToken = (req, res, next) => {
    const platformIdentity = verifyPlatformSso(req);
    if (platformIdentity) {
        const mappedUsername = process.env.PLATFORM_SSO_CORE_USERNAME || platformIdentity.sub;
        return resolvePlatformSsoUser({ mappedUserId: mappedUsername }).then((user) => {
            if (!user) {
                return res.status(403).json({
                    success: false,
                    error: '统一管理员未映射到综合平台管理员账号。',
                    code: 'PLATFORM_SSO_ACCOUNT_NOT_MAPPED'
                });
            }
            req.platformSso = platformIdentity;
            req.user = {
                id: user._id,
                _id: user._id,
                userId: user.userId,
                nickName: user.nickName,
                avatarUrl: user.avatarUrl,
                role: user.role,
                permissions: user.permissions || []
            };
            return next();
        }).catch(next);
    }

    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.',
            code: 'AUTH_TOKEN_MISSING'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.CORE_JWT_SECRET || process.env.JWT_SECRET, {
            issuer: 'miniprogram-admin',
            audience: 'miniprogram-api'
        });
        req.user = { ...decoded, _id: decoded.id || decoded._id };
        next();
    } catch (ex) {
        // 区分 token 过期和 token 无效，便于前端自动刷新
        if (ex.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired.',
                code: 'AUTH_TOKEN_EXPIRED',
                tokenExpired: true
            });
        }
        res.status(401).json({
            success: false,
            error: 'Invalid token.',
            code: 'AUTH_TOKEN_INVALID'
        });
    }
};

// Maintain compatibility if other files require it directly (though verifyToken is preferred now)
module.exports = exports.verifyToken;
module.exports.verifyToken = exports.verifyToken;
