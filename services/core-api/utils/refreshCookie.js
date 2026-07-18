const REFRESH_COOKIE_NAME = 'core_admin_refresh';
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

function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS
    };
}

function isWebAdminRequest(req) {
    return String(req.get?.('X-Core-Admin-Client') || req.headers?.['x-core-admin-client'] || '') === 'web';
}

function readRefreshCookie(req) {
    return parseCookies(req.headers?.cookie)[REFRESH_COOKIE_NAME] || '';
}

function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions());
}

function clearRefreshCookie(res) {
    const { maxAge: _maxAge, ...options } = cookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, options);
}

module.exports = {
    REFRESH_COOKIE_NAME,
    clearRefreshCookie,
    isWebAdminRequest,
    parseCookies,
    readRefreshCookie,
    setRefreshCookie
};
