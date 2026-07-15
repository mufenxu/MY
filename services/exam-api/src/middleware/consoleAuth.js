const jwt = require('jsonwebtoken');
const config = require('../config');
const ConsoleAccount = require('../models/ConsoleAccount');
const { AuthError, ForbiddenError } = require('../utils/errors');
const { CONSOLE_AUTH_COOKIE, getAuthToken } = require('../utils/authCookies');

async function authenticateConsole(req, res, next) {
    const token = getAuthToken(req, CONSOLE_AUTH_COOKIE);

    if (!token) {
        throw new AuthError('未登录或 Token 缺失');
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret);

        if (decoded.role !== 'console' || !decoded.openid || !decoded.consoleRole) {
            throw new ForbiddenError('个人题库后台 Token 无效');
        }

        const account = await ConsoleAccount.findOne({ openid: decoded.openid }).lean();
        if (!account) {
            throw new AuthError('个人题库后台账号不存在，请重新扫码登录');
        }

        if (account.status === 'disabled') {
            throw new ForbiddenError('个人题库后台账号已被禁用');
        }

        req.user = {
            ...decoded,
            consoleRole: account.role,
        };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new AuthError('Token 已过期，请重新登录');
        }
        if (err.name === 'JsonWebTokenError') {
            throw new ForbiddenError('Token 无效');
        }
        if (err instanceof AuthError || err instanceof ForbiddenError) {
            throw err;
        }
        throw new ForbiddenError('Token 验证失败');
    }
}

module.exports = authenticateConsole;
