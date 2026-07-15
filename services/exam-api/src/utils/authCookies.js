const crypto = require('crypto');
const config = require('../config');

const ADMIN_AUTH_COOKIE = 'manage_admin_token';
const CONSOLE_AUTH_COOKIE = 'manage_console_token';
const CSRF_COOKIE = 'manage_csrf_token';
const CSRF_HEADER = 'x-csrf-token';

function parseDurationMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value * 1000;
    }

    const match = String(value || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
}

function getCookieOptions({ clear = false, httpOnly = true } = {}) {
    const options = {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.isProduction,
        path: '/',
    };

    options.httpOnly = httpOnly;

    if (!clear) {
        const maxAge = parseDurationMs(config.jwtExpiresIn);
        if (maxAge) options.maxAge = maxAge;
    }

    return options;
}

function parseCookies(req) {
    return String(req.headers.cookie || '')
        .split(';')
        .reduce((cookies, item) => {
            const index = item.indexOf('=');
            if (index <= 0) return cookies;

            const key = item.slice(0, index).trim();
            const value = item.slice(index + 1).trim();
            if (!key) return cookies;

            try {
                cookies[key] = decodeURIComponent(value);
            } catch {
                cookies[key] = value;
            }
            return cookies;
        }, {});
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme && /^Bearer$/i.test(scheme) && token) {
        return token;
    }
    return '';
}

function getAuthToken(req, cookieName) {
    const cookies = parseCookies(req);
    return cookies[cookieName] || getBearerToken(req);
}

function hasAuthCookie(req) {
    const cookies = parseCookies(req);
    return Boolean(cookies[ADMIN_AUTH_COOKIE] || cookies[CONSOLE_AUTH_COOKIE]);
}

function getCsrfCookie(req) {
    return parseCookies(req)[CSRF_COOKIE] || '';
}

function setCsrfCookie(res) {
    const token = crypto.randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, token, getCookieOptions({ httpOnly: false }));
    return token;
}

function setAdminAuthCookie(res, token) {
    res.cookie(ADMIN_AUTH_COOKIE, token, getCookieOptions());
    setCsrfCookie(res);
}

function setConsoleAuthCookie(res, token) {
    res.cookie(CONSOLE_AUTH_COOKIE, token, getCookieOptions());
    setCsrfCookie(res);
}

function clearAuthCookies(res) {
    const options = getCookieOptions({ clear: true });
    res.clearCookie(ADMIN_AUTH_COOKIE, options);
    res.clearCookie(CONSOLE_AUTH_COOKIE, options);
    res.clearCookie(CSRF_COOKIE, getCookieOptions({ clear: true, httpOnly: false }));
}

module.exports = {
    ADMIN_AUTH_COOKIE,
    CONSOLE_AUTH_COOKIE,
    CSRF_COOKIE,
    CSRF_HEADER,
    clearAuthCookies,
    getBearerToken,
    getAuthToken,
    getCsrfCookie,
    hasAuthCookie,
    parseCookies,
    setAdminAuthCookie,
    setConsoleAuthCookie,
};
