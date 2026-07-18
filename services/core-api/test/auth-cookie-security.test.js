const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'core-cookie-test-secret';

const AppConfig = require('../models/AppConfig');
const AuditLog = require('../models/AuditLog');
const authService = require('../services/authService');
const authController = require('../controllers/authController');
const {
    REFRESH_COOKIE_NAME,
    isWebAdminRequest,
    parseCookies,
    readRefreshCookie
} = require('../utils/refreshCookie');

function invoke(handler, req) {
    return new Promise((resolve) => {
        const response = { cookies: [] };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            cookie(name, value, options) { response.cookies.push({ name, value, options }); },
            json(body) { resolve({ response, body, res: this }); }
        };
        handler(req, res, (error) => resolve({ response, error, res }));
    });
}

test('web admin login stores the refresh token only in an HttpOnly cookie', async () => {
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

        assert.equal(result.body.refreshToken, undefined);
        assert.equal(result.response.cookies.length, 1);
        assert.deepEqual(
            {
                name: result.response.cookies[0].name,
                value: result.response.cookies[0].value,
                httpOnly: result.response.cookies[0].options.httpOnly,
                sameSite: result.response.cookies[0].options.sameSite
            },
            {
                name: REFRESH_COOKIE_NAME,
                value: 'refresh-secret',
                httpOnly: true,
                sameSite: 'strict'
            }
        );
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
