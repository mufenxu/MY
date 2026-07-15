const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
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
            return res.status(401).json({ success: false, error: 'Token expired.', tokenExpired: true });
        }
        res.status(401).json({ success: false, error: 'Invalid token.' });
    }
};

// Maintain compatibility if other files require it directly (though verifyToken is preferred now)
module.exports = exports.verifyToken;
module.exports.verifyToken = exports.verifyToken;
