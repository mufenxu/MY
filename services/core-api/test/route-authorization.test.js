const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'route-security-test-secret';

const authScanRouter = require('../routes/authScanRoutes');
const resourceRouter = require('../routes/resources');
const statsRouter = require('../routes/statsRoutes');
const githubRouter = require('../routes/github');
const settingsRouter = require('../routes/settings');
const authScanController = require('../controllers/authScanController');

function routeMiddleware(router, path, index) {
    const layer = router.stack.find((item) => item.route && item.route.path === path);
    assert.ok(layer, `route ${path} must exist`);
    return layer.route.stack[index].handle;
}

function invoke(middleware, user) {
    return new Promise((resolve) => {
        const req = { user };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ res: this, body, nextCalled: false }); }
        };
        middleware(req, res, (error) => resolve({ res, error, nextCalled: true }));
    });
}

test('retired scan integration and global resource routes are absent', async () => {
    const scanPaths = authScanRouter.stack.map((item) => item.route?.path).filter(Boolean);
    const resourcePaths = resourceRouter.stack.map((item) => item.route?.path).filter(Boolean);

    for (const path of ['/qrcode/list', '/logs', '/token/exchange']) {
        assert.equal(scanPaths.includes(path), false);
    }
    assert.equal(resourcePaths.includes('/global'), false);

    let statusCode = 200;
    let responseBody;
    await authScanController.createQRCode(
        { body: { appId: 'retired-external-app' } },
        {
            status(code) { statusCode = code; return this; },
            json(body) { responseBody = body; return body; }
        }
    );
    assert.equal(statusCode, 404);
    assert.equal(responseBody.message, 'Scan login app not found');
});

test('dashboard statistics require an admin role', async () => {
    const authorizeLayer = statsRouter.stack[1];
    assert.ok(authorizeLayer && authorizeLayer.handle);

    const denied = await invoke(authorizeLayer.handle, { role: 'user' });
    assert.equal(denied.res.statusCode, 403);

    const accepted = await invoke(authorizeLayer.handle, { role: 'super_admin' });
    assert.equal(accepted.nextCalled, true);
});

test('CT8 secret cache requires super_admin or explicit manage_ct8 permission', async () => {
    const authorize = routeMiddleware(githubRouter, '/secret/cache', 1);
    const denied = await invoke(authorize, { role: 'admin', permissions: [], status: 'active' });
    assert.equal(denied.res.statusCode, 403);

    const accepted = await invoke(authorize, { role: 'user', permissions: ['manage_ct8'], status: 'active' });
    assert.equal(accepted.nextCalled, true);
});

test('global notification settings and manual reminders require super_admin', async () => {
    for (const path of ['/notify', '/test-notify', '/check-due']) {
        const authorize = routeMiddleware(settingsRouter, path, 1);
        const denied = await invoke(authorize, { role: 'admin' });
        assert.equal(denied.res.statusCode, 403);

        const accepted = await invoke(authorize, { role: 'super_admin' });
        assert.equal(accepted.nextCalled, true);
    }
});

test('Turnstile app config requires super_admin reauthentication while other app config remains delegated', async () => {
    const protectSensitiveAppConfig = routeMiddleware(settingsRouter, '/app-config', 2);
    const response = () => ({
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return body; }
    });

    let ordinaryNext = false;
    protectSensitiveAppConfig(
        { user: { role: 'admin' }, body: { key: 'feature_visibility' } },
        response(),
        () => { ordinaryNext = true; }
    );
    assert.equal(ordinaryNext, true);

    const deniedResponse = response();
    protectSensitiveAppConfig(
        { user: { role: 'admin' }, body: { key: 'turnstile_config' } },
        deniedResponse,
        () => assert.fail('admin must not pass the Turnstile guard')
    );
    assert.equal(deniedResponse.statusCode, 403);

    let superNext = false;
    protectSensitiveAppConfig(
        {
            user: { _id: 'root', role: 'super_admin' },
            platformSso: {
                role: 'super_admin',
                reauth_exp: Math.floor(Date.now() / 1000) + 60
            },
            body: { key: 'turnstile_config' },
            headers: {}
        },
        response(),
        () => { superNext = true; }
    );
    assert.equal(superNext, true);
});
