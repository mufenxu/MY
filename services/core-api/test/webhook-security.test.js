const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'webhook-security-test-key';

const secretService = require('../services/secretService');
const verifyWebhookSignature = require('../middleware/webhookVerify');

function invoke(middleware, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ res: this, body, nextCalled: false }); }
        };
        middleware(req, res, (error) => resolve({ res, error, nextCalled: true }));
    });
}

test('webhook fails closed when verification secret is missing', async () => {
    const originalGetSecretSync = secretService.getSecretSync;
    const previousSecret = process.env.GH_WEBHOOK_SECRET;
    const previousEnabled = process.env.GH_WEBHOOK_ENABLED;
    secretService.getSecretSync = () => null;
    delete process.env.GH_WEBHOOK_SECRET;
    delete process.env.GH_WEBHOOK_ENABLED;

    try {
        const result = await invoke(verifyWebhookSignature(true), { headers: {}, body: {}, query: {} });
        assert.equal(result.res.statusCode, 503);
        assert.equal(result.body.code, 'WEBHOOK_NOT_CONFIGURED');
        assert.equal(result.nextCalled, false);
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
        if (previousSecret === undefined) delete process.env.GH_WEBHOOK_SECRET;
        else process.env.GH_WEBHOOK_SECRET = previousSecret;
        if (previousEnabled === undefined) delete process.env.GH_WEBHOOK_ENABLED;
        else process.env.GH_WEBHOOK_ENABLED = previousEnabled;
    }
});

test('webhook accepts only a valid HMAC when configured', async () => {
    const originalGetSecretSync = secretService.getSecretSync;
    const previousEnabled = process.env.GH_WEBHOOK_ENABLED;
    const body = JSON.stringify({ run_id: '123' });
    const secret = 'webhook-test-secret';
    secretService.getSecretSync = () => secret;
    delete process.env.GH_WEBHOOK_ENABLED;
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    try {
        const valid = await invoke(verifyWebhookSignature(true), {
            headers: { 'x-hub-signature-256': signature },
            rawBody: body,
            body: JSON.parse(body),
            query: {}
        });
        assert.equal(valid.nextCalled, true);

        const invalid = await invoke(verifyWebhookSignature(true), {
            headers: { 'x-hub-signature-256': 'sha256=invalid' },
            rawBody: body,
            body: JSON.parse(body),
            query: {}
        });
        assert.equal(invalid.res.statusCode, 401);
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
        if (previousEnabled === undefined) delete process.env.GH_WEBHOOK_ENABLED;
        else process.env.GH_WEBHOOK_ENABLED = previousEnabled;
    }
});

test('strict webhook mode rejects shared secrets supplied in payloads or query strings', async () => {
    const originalGetSecretSync = secretService.getSecretSync;
    const previousEnabled = process.env.GH_WEBHOOK_ENABLED;
    secretService.getSecretSync = () => 'configured-secret';
    delete process.env.GH_WEBHOOK_ENABLED;

    try {
        for (const req of [
            { headers: {}, body: { secret: 'configured-secret' }, query: {} },
            { headers: {}, body: {}, query: { token: 'configured-secret' } }
        ]) {
            const result = await invoke(verifyWebhookSignature(true), req);
            assert.equal(result.res.statusCode, 401);
            assert.equal(result.body.error, 'Missing signature');
            assert.equal(result.nextCalled, false);
        }

        const headerResult = await invoke(verifyWebhookSignature(true), {
            headers: { 'x-webhook-secret': 'configured-secret' },
            body: {},
            query: {}
        });
        assert.equal(headerResult.nextCalled, true);
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
        if (previousEnabled === undefined) delete process.env.GH_WEBHOOK_ENABLED;
        else process.env.GH_WEBHOOK_ENABLED = previousEnabled;
    }
});

test('explicitly disabled webhook endpoint remains closed', async () => {
    const originalGetSecretSync = secretService.getSecretSync;
    const previousEnabled = process.env.GH_WEBHOOK_ENABLED;
    secretService.getSecretSync = () => 'configured-secret';
    process.env.GH_WEBHOOK_ENABLED = 'false';

    try {
        const result = await invoke(verifyWebhookSignature(true), { headers: {}, body: {}, query: {} });
        assert.equal(result.res.statusCode, 503);
        assert.equal(result.body.code, 'WEBHOOK_DISABLED');
        assert.equal(result.nextCalled, false);
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
        if (previousEnabled === undefined) delete process.env.GH_WEBHOOK_ENABLED;
        else process.env.GH_WEBHOOK_ENABLED = previousEnabled;
    }
});
