const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

async function optionalClientAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded.role === 'user' && decoded.openid) {
            const user = await User.exists({ openid: decoded.openid });
            if (user) {
                req.user = decoded;
            }
        }
    } catch (err) {
        // Public endpoints should keep working even when a stale mini-program token is present.
    }

    return next();
}

module.exports = optionalClientAuth;
