const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyPlatformSso } = require('./platformSso');
const { resolvePlatformSsoUser } = require('../services/platformSsoAccountService');
const { intersectPlatformAccess, platformRoleAllowsRequest } = require('../utils/platformAccess');
const {
    hasValidCsrfToken,
    isTrustedWebAdminOrigin,
    isWebAdminRequest,
    readAccessCookie,
    readCsrfCookie
} = require('../utils/refreshCookie');

function normalizeTokenVersion(value) {
    const version = Number(value);
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

function sendJwtError(res, error) {
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token expired.',
            code: 'AUTH_TOKEN_EXPIRED',
            tokenExpired: true
        });
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid token.',
        code: 'AUTH_TOKEN_INVALID'
    });
}

exports.verifyToken = async (req, res, next) => {
    const platformIdentity = verifyPlatformSso(req);
    if (platformIdentity) {
        try {
            if (
                !platformRoleAllowsRequest(platformIdentity.role, req.method)
            ) {
                return res.status(403).json({
                    success: false,
                    error: 'The unified-platform viewer role is read-only.',
                    code: 'PLATFORM_READ_ONLY'
                });
            }
            const mappedUsername = process.env.PLATFORM_SSO_CORE_USERNAME || platformIdentity.sub;
            const user = await resolvePlatformSsoUser({ mappedUserId: mappedUsername });
            if (!user) {
                return res.status(403).json({
                    success: false,
                    error: '统一管理员未映射到综合平台管理员账号。',
                    code: 'PLATFORM_SSO_ACCOUNT_NOT_MAPPED'
                });
            }
            const effectiveAccess = intersectPlatformAccess(platformIdentity.role, user);
            if (!effectiveAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid unified-platform role mapping.',
                    code: 'PLATFORM_SSO_ROLE_INVALID'
                });
            }
            req.platformSso = platformIdentity;
            req.user = {
                id: user._id,
                _id: user._id,
                userId: user.userId,
                nickName: user.nickName,
                avatarUrl: user.avatarUrl,
                role: effectiveAccess.role,
                localRole: effectiveAccess.localRole,
                centralRole: effectiveAccess.centralRole,
                permissions: effectiveAccess.permissions,
                status: user.status || 'active'
            };
            return next();
        } catch (error) {
            return next(error);
        }
    }

    const authorization = req.header('Authorization') || '';
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const cookieToken = !bearerToken && isWebAdminRequest(req) ? readAccessCookie(req) : '';
    const token = bearerToken || cookieToken;

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.',
            code: 'AUTH_TOKEN_MISSING'
        });
    }

    if (cookieToken && !isTrustedWebAdminOrigin(req)) {
        return res.status(403).json({
            success: false,
            error: 'Web admin origin is not trusted.',
            code: 'AUTH_ORIGIN_INVALID'
        });
    }

    if (cookieToken && !hasValidCsrfToken(req)) {
        return res.status(403).json({
            success: false,
            error: 'CSRF validation failed. Refresh the page and try again.',
            code: 'AUTH_CSRF_INVALID'
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.CORE_JWT_SECRET || process.env.JWT_SECRET, {
            issuer: 'miniprogram-admin',
            audience: 'miniprogram-api'
        });
    } catch (error) {
        return sendJwtError(res, error);
    }

    try {
        const userId = decoded.id || decoded._id;
        const user = await User.findById(userId)
            .select('_id openid userId nickName avatarUrl role permissions status tokenVersion')
            .lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User no longer exists.',
                code: 'AUTH_USER_NOT_FOUND'
            });
        }

        const currentStatus = user.status || 'active';
        if (currentStatus !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Account is disabled.',
                code: 'AUTH_ACCOUNT_DISABLED'
            });
        }

        // Tokens issued before tokenVersion was introduced are treated as version 0.
        if (normalizeTokenVersion(decoded.tokenVersion) !== normalizeTokenVersion(user.tokenVersion)) {
            return res.status(401).json({
                success: false,
                error: 'Token has been revoked.',
                code: 'AUTH_TOKEN_REVOKED'
            });
        }

        req.user = {
            id: user._id,
            _id: user._id,
            openid: user.openid,
            userId: user.userId,
            nickName: user.nickName,
            avatarUrl: user.avatarUrl,
            role: user.role,
            permissions: user.permissions || [],
            status: currentStatus,
            tokenVersion: normalizeTokenVersion(user.tokenVersion)
        };
        if (cookieToken) {
            res.setHeader('X-CSRF-Token', readCsrfCookie(req));
        }
        return next();
    } catch (error) {
        return next(error);
    }
};

// Maintain compatibility if other files require it directly (though verifyToken is preferred now)
module.exports = exports.verifyToken;
module.exports.verifyToken = exports.verifyToken;
