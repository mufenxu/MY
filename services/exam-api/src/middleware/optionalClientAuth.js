const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { isAuthTokenRevoked } = require('../utils/authCookies');

async function optionalClientAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded.role === 'user' && decoded.openid && decoded.accountId && Number.isSafeInteger(decoded.tokenVersion)) {
            const [user, revoked] = await Promise.all([
                User.findOne({ _id: decoded.accountId, openid: decoded.openid }).select('tokenVersion').lean(),
                isAuthTokenRevoked(token),
            ]);
            if (user && !revoked && (user.tokenVersion || 0) === decoded.tokenVersion) {
                req.user = decoded;
            }
        }
    } catch (err) {
        // Public endpoints should keep working even when a stale mini-program token is present.
    }

    return next();
}

module.exports = optionalClientAuth;
