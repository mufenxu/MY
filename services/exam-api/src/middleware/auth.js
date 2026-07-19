/**
 * 管理员 JWT 认证中间件。
 * 严格要求新版 admin token，并用 tokenVersion 支持改密后会话失效。
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');
const { AuthError, ForbiddenError } = require('../utils/errors');
const { ADMIN_AUTH_COOKIE, getAuthToken } = require('../utils/authCookies');
const { verifyPlatformSso } = require('./platformSso');
const { resolvePlatformSsoAdmin } = require('../services/platformSsoAccountService');
const { platformRoleAllowsRequest } = require('./platformRole');

async function authenticateAdmin(req, res, next) {
    const platformIdentity = verifyPlatformSso(req);
    if (platformIdentity) {
        if (!platformRoleAllowsRequest(platformIdentity.role, req.method, req.originalUrl || req.url)) {
            throw new ForbiddenError('The unified-platform role cannot perform this operation.');
        }
        const mappedUsername = process.env.PLATFORM_SSO_EXAM_USERNAME || platformIdentity.sub;
        const admin = await resolvePlatformSsoAdmin({ mappedUsername });
        if (!admin) {
            throw new ForbiddenError('统一管理员未映射到考试平台管理员账号');
        }
        req.platformSso = platformIdentity;
        req.user = {
            id: admin._id.toString(),
            username: admin.username,
            role: 'admin',
            centralRole: platformIdentity.role,
            tokenVersion: admin.tokenVersion || 0,
        };
        return next();
    }

    const token = getAuthToken(req, ADMIN_AUTH_COOKIE);

    if (!token) {
        throw new AuthError('未登录或 Token 缺失');
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (
            decoded.role !== 'admin'
            || !decoded.id
            || !decoded.username
            || typeof decoded.tokenVersion !== 'number'
        ) {
            throw new ForbiddenError('管理员 Token 无效');
        }

        const admin = await Admin.findById(decoded.id).select('tokenVersion').lean();
        if (!admin || (admin.tokenVersion || 0) !== decoded.tokenVersion) {
            throw new AuthError('Token 已失效，请重新登录');
        }

        req.user = decoded;
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

module.exports = authenticateAdmin;
