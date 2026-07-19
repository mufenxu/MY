const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'sensitive-secret-security-test-key';

const AppClient = require('../models/AppClient');
const PlatformConfig = require('../models/PlatformConfig');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const appRouter = require('../routes/appRoutes');
const appClientController = require('../controllers/appClientController');
const platformConfigController = require('../controllers/platformConfigController');
const platformConfigRouter = require('../routes/platformConfigRoutes');
const secretRouter = require('../routes/secrets');
const secretController = require('../controllers/secretController');
const secretService = require('../services/secretService');
const { migrateField } = require('../services/sensitiveDataMigration');
const { decrypt, encrypt, isEncrypted } = require('../utils/crypto');

function routeStack(path) {
    const layer = appRouter.stack.find((item) => item.route?.path === path);
    assert.ok(layer, `route ${path} must exist`);
    return layer.route.stack.map((item) => item.handle);
}

function platformRouteStack(path) {
    const layer = platformConfigRouter.stack.find((item) => item.route?.path === path);
    assert.ok(layer, `platform route ${path} must exist`);
    return layer.route.stack.map((item) => item.handle);
}

function secretRouteStack(path) {
    const layer = secretRouter.stack.find((item) => item.route?.path === path);
    assert.ok(layer, `secret route ${path} must exist`);
    return layer.route.stack.map((item) => item.handle);
}

function invoke(middleware, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ status: this.statusCode, body, nextCalled: false }); },
        };
        middleware(req, res, (error) => resolve({ status: res.statusCode, error, nextCalled: true }));
    });
}

test('AppClient and PlatformConfig encrypt secrets on direct document assignment', () => {
    const app = new AppClient({ appId: 'security-app', appName: 'Security', secret: 'app-secret' });
    const platform = new PlatformConfig({ platformCode: 'secure', name: 'Secure', url: 'https://example.com', secretKey: 'platform-secret' });
    const storedAppSecret = app.get('secret', null, { getters: false });
    const storedPlatformSecret = platform.get('secretKey', null, { getters: false });

    assert.equal(isEncrypted(storedAppSecret), true);
    assert.equal(isEncrypted(storedPlatformSecret), true);
    assert.equal(app.secret, 'app-secret');
    assert.equal(platform.secretKey, 'platform-secret');
});

test('legacy plaintext migration is idempotent and uses compare-and-set updates', async () => {
    const updates = [];
    const Model = {
        collection: {
            find() {
                return (async function* documents() {
                    yield { _id: 'legacy', secret: 'legacy-secret' };
                    yield { _id: 'encrypted', secret: encrypt('already-encrypted') };
                }());
            },
            async updateOne(filter, update) {
                updates.push({ filter, update });
                return { modifiedCount: 1 };
            },
        },
    };

    assert.equal(await migrateField(Model, 'secret'), 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].filter.secret, 'legacy-secret');
    assert.equal(decrypt(updates[0].update.$set.secret), 'legacy-secret');
});

test('regular app and platform config reads return full masks only', async () => {
    const originalAppFind = AppClient.findById;
    const originalConfigFind = PlatformConfig.find;
    AppClient.findById = () => ({ select: async () => ({ secret: 'do-not-leak' }) });
    PlatformConfig.find = () => ({
        sort: () => ({ lean: async () => [{ platformCode: 'mx', secretKey: 'do-not-leak' }] }),
    });

    try {
        let appResponse;
        await appClientController.getSecretMetadata(
            { params: { id: 'app-1' } },
            { json: (body) => { appResponse = body; }, status() { return this; } },
        );
        assert.deepEqual(appResponse, { success: true, configured: true, secret: '********' });

        let configResponse;
        await platformConfigController.getAllConfigs(
            {},
            { json: (body) => { configResponse = body; }, status() { return this; } },
        );
        assert.equal(configResponse.data[0].secretKey, '********');
        assert.doesNotMatch(JSON.stringify({ appResponse, configResponse }), /do-not-leak/);
    } finally {
        AppClient.findById = originalAppFind;
        PlatformConfig.find = originalConfigFind;
    }
});

test('only admin-level reads get masked app secret metadata and reveal requires super_admin', async () => {
    const metadataAuthorize = routeStack('/:id/secret')[1];
    assert.equal((await invoke(metadataAuthorize, { user: { role: 'user' } })).status, 403);
    assert.equal((await invoke(metadataAuthorize, { user: { role: 'admin' } })).nextCalled, true);

    const revealStack = routeStack('/:id/secret/reveal');
    assert.equal((await invoke(revealStack[1], { user: { role: 'admin' } })).status, 403);
    assert.equal((await invoke(revealStack[1], { user: { role: 'super_admin' } })).nextCalled, true);
});

test('platform secret configuration mutations require super_admin', async () => {
    for (const path of ['/save', '/:platformCode']) {
        const authorize = platformRouteStack(path)[1];
        assert.equal((await invoke(authorize, { user: { role: 'admin' } })).status, 403);
        assert.equal((await invoke(authorize, { user: { role: 'super_admin' } })).nextCalled, true);
    }
});

test('secret reveal reauthentication rejects central sessions and verifies local password', async () => {
    const reauthenticate = routeStack('/:id/secret/reveal')[2];
    const originalFind = User.findById;
    const originalAudit = AuditLog.create;
    const auditRecords = [];
    AuditLog.create = async (record) => { auditRecords.push(record); };
    const passwordHash = await bcrypt.hash('valid-password', 4);
    User.findById = () => ({ select: () => ({ lean: async () => ({ password: passwordHash }) }) });

    try {
        const central = await invoke(reauthenticate, {
            platformSso: { sub: 'root', role: 'super_admin', reauth_exp: 0 },
            user: { _id: 'root', role: 'super_admin' },
            params: { id: 'app-1' },
            body: { currentPassword: 'valid-password' },
            headers: {},
        });
        assert.equal(central.status, 403);

        const centralGranted = await invoke(reauthenticate, {
            platformSso: {
                sub: 'root',
                role: 'super_admin',
                reauth_exp: Math.floor(Date.now() / 1000) + 60,
            },
            user: { _id: 'root', role: 'super_admin' },
            params: { id: 'app-1' },
            body: {},
            headers: {},
        });
        assert.equal(centralGranted.nextCalled, true);

        const local = await invoke(reauthenticate, {
            user: { _id: 'root', role: 'super_admin' },
            params: { id: 'app-1' },
            body: { currentPassword: 'valid-password' },
            headers: {},
        });
        assert.equal(local.nextCalled, true);
        assert.equal(auditRecords[0].result, 'failure');
        assert.equal(auditRecords[0].payload.reason, 'central_reauthentication_required');
    } finally {
        User.findById = originalFind;
        AuditLog.create = originalAudit;
    }
});

test('secret cache mutations require server-side reauthentication', async () => {
    const originalAudit = AuditLog.create;
    AuditLog.create = async () => ({});
    try {
        for (const path of ['/update', '/:key']) {
            const stack = secretRouteStack(path);
            const authorize = stack[1];
            const reauthenticate = stack[2];
            assert.equal((await invoke(authorize, { user: { role: 'admin' } })).status, 403);
            assert.equal((await invoke(authorize, { user: { role: 'super_admin' } })).nextCalled, true);

            const result = await invoke(reauthenticate, {
                platformSso: { sub: 'root', role: 'super_admin', reauth_exp: 0 },
                user: { _id: 'root', role: 'super_admin' },
                params: path === '/:key' ? { key: 'TURNSTILE_SECRET_KEY' } : {},
                body: path === '/update' ? { key: 'TURNSTILE_SECRET_KEY' } : {},
                headers: {}
            });
            assert.equal(result.status, 403);
            assert.equal(result.body.code, 'REAUTHENTICATION_FAILED');
        }
    } finally {
        AuditLog.create = originalAudit;
    }
});

test('admin secret cache accepts only the visible allowlist and bounded string values', async () => {
    assert.equal(secretService.isAdminConfigurableSecret('TURNSTILE_SECRET_KEY'), true);
    assert.equal(secretService.isAdminConfigurableSecret('HIDDEN_INTERNAL_SECRET'), false);

    const invalidKey = await invoke(secretController.updateSecret, {
        user: { _id: 'root' },
        body: { key: 'HIDDEN_INTERNAL_SECRET', value: 'value' },
        params: {},
        headers: {}
    });
    assert.equal(invalidKey.status, 400);

    const oversized = await invoke(secretController.updateSecret, {
        user: { _id: 'root' },
        body: { key: 'TURNSTILE_SECRET_KEY', value: 'x'.repeat(16385) },
        params: {},
        headers: {}
    });
    assert.equal(oversized.status, 400);

    const invalidDelete = await invoke(secretController.deleteSecret, {
        user: { _id: 'root' },
        body: {},
        params: { key: 'HIDDEN_INTERNAL_SECRET' },
        headers: {}
    });
    assert.equal(invalidDelete.status, 400);
});
