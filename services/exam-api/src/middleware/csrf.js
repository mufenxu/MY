const crypto = require('crypto');
const { ForbiddenError } = require('../utils/errors');
const { CSRF_HEADER, getCsrfCookie, hasAuthCookie } = require('../utils/authCookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function timingSafeEqualString(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));

    if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireCsrfToken(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    if (!hasAuthCookie(req)) {
        return next();
    }

    const cookieToken = getCsrfCookie(req);
    const headerToken = req.get(CSRF_HEADER);

    if (!timingSafeEqualString(cookieToken, headerToken)) {
        throw new ForbiddenError('CSRF 校验失败，请刷新页面后重试');
    }

    return next();
}

module.exports = requireCsrfToken;
