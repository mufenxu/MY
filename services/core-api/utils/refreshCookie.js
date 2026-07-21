const crypto = require('crypto');
const { isSafeHttpMethod } = require('@my-platform/platform-auth');

const ACCESS_COOKIE_NAME = 'core_admin_access';
const REFRESH_COOKIE_NAME = 'core_admin_refresh';
const CSRF_COOKIE_NAME = 'core_admin_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const ACCESS_COOKIE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header = '') {
    const cookies = {};
    for (const part of String(header).split(';')) {
        const separator = part.indexOf('=');
        if (separator < 1) continue;
        const name = part.slice(0, separator).trim();
        const rawValue = part.slice(separator + 1).trim();
        try {
            cookies[name] = decodeURIComponent(rawValue);
        } catch {
            cookies[name] = rawValue;
        }
    }
    return cookies;
}

function cookieOptions({ httpOnly = true, maxAge = REFRESH_COOKIE_MAX_AGE_MS } = {}) {
    return {
        httpOnly,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge
    };
}

function isWebAdminRequest(req) {
    return String(req.get?.('X-Core-Admin-Client') || req.headers?.['x-core-admin-client'] || '') === 'web';
}

function normalizeOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return '';
    }
}

function isTrustedWebAdminOrigin(req) {
    const rawOrigin = req.get?.('Origin') || req.headers?.origin || '';
    if (!rawOrigin) return true;
    const origin = normalizeOrigin(rawOrigin);
    if (!origin) return false;

    const requestHost = String(
        req.get?.('X-Forwarded-Host')
        || req.headers?.['x-forwarded-host']
        || req.get?.('Host')
        || req.headers?.host
        || ''
    ).split(',')[0].trim().toLowerCase();
    if (requestHost && new URL(origin).host.toLowerCase() === requestHost) return true;

    const trustedOrigins = [
        process.env.CORE_ADMIN_ORIGINS,
        process.env.PLATFORM_PUBLIC_ORIGIN,
        process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'
    ]
        .flatMap((value) => String(value || '').split(','))
        .map(normalizeOrigin)
        .filter(Boolean);
    return trustedOrigins.includes(origin);
}

function readRefreshCookie(req) {
    return parseCookies(req.headers?.cookie)[REFRESH_COOKIE_NAME] || '';
}

function readAccessCookie(req) {
    return parseCookies(req.headers?.cookie)[ACCESS_COOKIE_NAME] || '';
}

function readCsrfCookie(req) {
    return parseCookies(req.headers?.cookie)[CSRF_COOKIE_NAME] || '';
}

function timingSafeEqualString(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length > 0
        && leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidCsrfToken(req) {
    if (isSafeHttpMethod(req.method)) return true;
    const headerToken = req.get?.(CSRF_HEADER_NAME) || req.headers?.[CSRF_HEADER_NAME] || '';
    return timingSafeEqualString(readCsrfCookie(req), headerToken);
}

function requireWebCsrf(req, res, next) {
    if (!isWebAdminRequest(req)) return next();
    if (!isTrustedWebAdminOrigin(req)) {
        return res.status(403).json({
            success: false,
            error: 'Web admin origin is not trusted.',
            code: 'AUTH_ORIGIN_INVALID'
        });
    }
    if (hasValidCsrfToken(req)) return next();
    return res.status(403).json({
        success: false,
        error: 'CSRF validation failed. Refresh the page and try again.',
        code: 'AUTH_CSRF_INVALID'
    });
}

function setAccessCookie(res, token) {
    res.cookie(ACCESS_COOKIE_NAME, token, cookieOptions({ maxAge: ACCESS_COOKIE_MAX_AGE_MS }));
}

function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions());
}

function setCsrfCookie(res) {
    const token = crypto.randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE_NAME, token, cookieOptions({ httpOnly: false }));
    return token;
}

function setWebAdminCookies(res, { accessToken, refreshToken }) {
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    return setCsrfCookie(res);
}

function clearRefreshCookie(res) {
    const { maxAge: _maxAge, ...options } = cookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, options);
}

function clearWebAdminCookies(res) {
    const { maxAge: _accessMaxAge, ...accessOptions } = cookieOptions({ maxAge: ACCESS_COOKIE_MAX_AGE_MS });
    const { maxAge: _refreshMaxAge, ...refreshOptions } = cookieOptions();
    const { maxAge: _csrfMaxAge, ...csrfOptions } = cookieOptions({ httpOnly: false });
    res.clearCookie(ACCESS_COOKIE_NAME, accessOptions);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshOptions);
    res.clearCookie(CSRF_COOKIE_NAME, csrfOptions);
}

module.exports = {
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    REFRESH_COOKIE_NAME,
    clearRefreshCookie,
    clearWebAdminCookies,
    hasValidCsrfToken,
    isTrustedWebAdminOrigin,
    isWebAdminRequest,
    parseCookies,
    readAccessCookie,
    readCsrfCookie,
    readRefreshCookie,
    requireWebCsrf,
    setAccessCookie,
    setRefreshCookie,
    setWebAdminCookies
};
