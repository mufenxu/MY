const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'sensitive-secret-security-test-key';

const PlatformConfig = require('../models/PlatformConfig');
const AuditLog = require('../models/AuditLog');
const platformConfigController = require('../controllers/platformConfigController');
const platformConfigRouter = require('../routes/platformConfigRoutes');
const secretRouter = require('../routes/secrets');
const secretController = require('../controllers/secretController');
const secretService = require('../services/secretService');
const { migrateField } = require('../services/sensitiveDataMigration');
const { decrypt, encrypt, isEncrypted } = require('../utils/crypto');

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

test('PlatformConfig encrypts secrets on direct document assignment', () => {
    const platform = new PlatformConfig({ platformCode: 'secure', name: 'Secure', url: 'https://example.com', secretKey: 'platform-secret' });
    const storedPlatformSecret = platform.get('secretKey', null, { getters: false });

    assert.equal(isEncrypted(storedPlatformSecret), true);
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

test('regular platform config reads return full masks only', async () => {
    const originalConfigFind = PlatformConfig.find;
    PlatformConfig.find = () => ({
        sort: () => ({ lean: async () => [{ platformCode: 'mx', secretKey: 'do-not-leak' }] }),
    });

    try {
        let configResponse;
        await platformConfigController.getAllConfigs(
            {},
            { json: (body) => { configResponse = body; }, status() { return this; } },
        );
        assert.equal(configResponse.data[0].secretKey, '********');
        assert.doesNotMatch(JSON.stringify(configResponse), /do-not-leak/);
    } finally {
        PlatformConfig.find = originalConfigFind;
    }
});

test('platform secret configuration mutations require super_admin', async () => {
    for (const path of ['/save', '/:platformCode']) {
        const authorize = platformRouteStack(path)[1];
        assert.equal((await invoke(authorize, { user: { role: 'admin' } })).status, 403);
        assert.equal((await invoke(authorize, { user: { role: 'super_admin' } })).nextCalled, true);
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
