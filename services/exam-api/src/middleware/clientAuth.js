/**
 * 客户端用户 JWT 认证中间件
 * 用于小程序端受保护接口
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { AuthError, ForbiddenError } = require('../utils/errors');

async function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        throw new AuthError('未登录或Token缺失');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new AuthError('Token已过期，请重新登录');
        }
        if (err.name === 'JsonWebTokenError') {
            throw new ForbiddenError('Token无效');
        }
        if (err instanceof AuthError || err instanceof ForbiddenError) {
            throw err;
        }
        throw new ForbiddenError('Token验证失败');
    }

    if (decoded.role !== 'user' || !decoded.openid) {
        throw new ForbiddenError('用户Token无效');
    }

    const user = await User.exists({ openid: decoded.openid });
    if (!user) {
        throw new AuthError('用户不存在，请重新登录');
    }

    req.user = decoded;
    next();
}

module.exports = authenticateUser;
