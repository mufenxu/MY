const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'core-cookie-test-secret';

const AppConfig = require('../models/AppConfig');
const AuditLog = require('../models/AuditLog');
const authService = require('../services/authService');
const authController = require('../controllers/authController');
const {
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    hasValidCsrfToken,
    isTrustedWebAdminOrigin,
    isWebAdminRequest,
    parseCookies,
    readAccessCookie,
    readRefreshCookie
} = require('../utils/refreshCookie');

function invoke(handler, req) {
    return new Promise((resolve) => {
        const response = { cookies: [], headers: {} };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            cookie(name, value, options) { response.cookies.push({ name, value, options }); },
            setHeader(name, value) { response.headers[String(name).toLowerCase()] = String(value); },
            json(body) { resolve({ response, body, res: this }); }
        };
        handler(req, res, (error) => resolve({ response, error, res }));
    });
}

test('web admin login stores access and refresh credentials only in HttpOnly cookies', async () => {
    const originalFindOne = AppConfig.findOne;
    const originalAdminLogin = authService.adminLogin;
    const originalAuditCreate = AuditLog.create;
    AppConfig.findOne = async () => null;
    AuditLog.create = async () => ({});
    authService.adminLogin = async () => ({
        token: 'access-token',
        refreshToken: 'refresh-secret',
        user: {
            _id: 'admin-1',
            userId: 'admin',
            nickName: 'Admin',
            role: 'super_admin',
            permissions: [],
            avatarUrl: ''
        }
    });

    try {
        const result = await invoke(authController.login, {
            body: { username: 'admin', password: 'password' },
            headers: { 'x-core-admin-client': 'web' },
            get(name) { return this.headers[String(name).toLowerCase()]; },
            ip: '127.0.0.1'
        });

        assert.equal(result.body.token, undefined);
        assert.equal(result.body.refreshToken, undefined);
        assert.equal(result.response.cookies.length, 3);
        const cookies = Object.fromEntries(result.response.cookies.map((cookie) => [cookie.name, cookie]));
        assert.equal(cookies[ACCESS_COOKIE_NAME].value, 'access-token');
        assert.equal(cookies[ACCESS_COOKIE_NAME].options.httpOnly, true);
        assert.equal(cookies[REFRESH_COOKIE_NAME].value, 'refresh-secret');
        assert.equal(cookies[REFRESH_COOKIE_NAME].options.httpOnly, true);
        assert.equal(cookies[CSRF_COOKIE_NAME].options.httpOnly, false);
        assert.equal(cookies[CSRF_COOKIE_NAME].options.sameSite, 'strict');
        assert.ok(cookies[CSRF_COOKIE_NAME].value.length >= 32);
        assert.equal(result.response.headers['x-csrf-token'], cookies[CSRF_COOKIE_NAME].value);
    } finally {
        AppConfig.findOne = originalFindOne;
        AuditLog.create = originalAuditCreate;
        authService.adminLogin = originalAdminLogin;
    }
});

test('refresh cookie parsing is exact and web mode requires an explicit client marker', () => {
    const req = {
        headers: { cookie: `${REFRESH_COOKIE_NAME}=encoded%20token; other=value` }
    };
    assert.equal(readRefreshCookie(req), 'encoded token');
    assert.equal(parseCookies('broken; valid=ok').valid, 'ok');
    assert.equal(isWebAdminRequest(req), false);
    req.headers['x-core-admin-client'] = 'web';
    assert.equal(isWebAdminRequest(req), true);
});

test('access cookie parsing is exact and unsafe cookie requests require matching CSRF tokens', () => {
    const req = {
        method: 'POST',
        headers: {
            cookie: `${ACCESS_COOKIE_NAME}=access%20token; ${CSRF_COOKIE_NAME}=csrf-value`,
            'x-csrf-token': 'csrf-value'
        },
        get(name) { return this.headers[String(name).toLowerCase()]; }
    };

    assert.equal(readAccessCookie(req), 'access token');
    assert.equal(hasValidCsrfToken(req), true);
    req.headers['x-csrf-token'] = 'wrong-value';
    assert.equal(hasValidCsrfToken(req), false);
    req.method = 'GET';
    assert.equal(hasValidCsrfToken(req), true);
});

test('cookie admin CSRF disclosure is limited to same-origin or configured admin frontends', () => {
    const previous = process.env.CORE_ADMIN_ORIGINS;
    process.env.CORE_ADMIN_ORIGINS = 'https://admin.example.com';
    const request = (origin, host = 'api.example.com') => ({
        headers: { origin, host },
        get(name) { return this.headers[String(name).toLowerCase()]; }
    });

    try {
        assert.equal(isTrustedWebAdminOrigin(request('https://api.example.com')), true);
        assert.equal(isTrustedWebAdminOrigin(request('https://admin.example.com')), true);
        assert.equal(isTrustedWebAdminOrigin(request('https://compromised.example.com')), false);
        assert.equal(isTrustedWebAdminOrigin(request('null')), false);
        assert.equal(isTrustedWebAdminOrigin(request(undefined)), true);
    } finally {
        if (previous === undefined) delete process.env.CORE_ADMIN_ORIGINS;
        else process.env.CORE_ADMIN_ORIGINS = previous;
    }
});
