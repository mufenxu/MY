const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'github-secret-security-test-key';

const SecretCache = require('../models/SecretCache');
const githubService = require('../services/githubService');
const githubController = require('../controllers/githubController');
const secretService = require('../services/secretService');
const { decrypt, isEncrypted } = require('../utils/crypto');

test('CT8 secret cache rejects keys outside its fixed allowlist', async () => {
    await assert.rejects(
        githubService.manageSecretCache('get', 'GH_TOKEN'),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, 'CT8_SECRET_NOT_ALLOWED');
            return true;
        }
    );

    await assert.rejects(
        githubService.updateSecret('get', 'GH_WEBHOOK_SECRET'),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, 'CT8_SECRET_NOT_ALLOWED');
            return true;
        }
    );
});

test('CT8 secret cache read returns metadata and never plaintext', async () => {
    const originalFindOne = SecretCache.findOne;
    SecretCache.findOne = () => ({
        async lean() {
            return {
                secret_name: 'USERS_LIST',
                secret_value: 'sensitive-value',
                updated_at: new Date('2026-01-01T00:00:00Z'),
                updated_by: 'admin-1'
            };
        }
    });

    try {
        const result = await githubService.manageSecretCache('get', 'USERS_LIST');
        assert.equal(result.data.configured, true);
        assert.equal(result.data.display_value, '********');
        assert.equal(Object.hasOwn(result.data, 'value'), false);
        assert.doesNotMatch(JSON.stringify(result), /sensitive-value/);
    } finally {
        SecretCache.findOne = originalFindOne;
    }
});

test('secret cache audit identity always comes from the authenticated user', async () => {
    const originalManage = githubService.manageSecretCache;
    let call;
    githubService.manageSecretCache = async (...args) => {
        call = args;
        return { ok: true };
    };

    try {
        const req = {
            user: { _id: 'actor-id', userId: 'actor-name' },
            body: {
                action: 'set',
                secret_name: 'USERS_LIST',
                secret_value: 'new-value',
                updated_by: 'forged-actor'
            }
        };
        let response;
        await githubController.manageSecretCache(req, { json: (body) => { response = body; } }, () => {});
        assert.deepEqual(response, { ok: true });
        assert.deepEqual(call, ['set', 'USERS_LIST', 'new-value', 'actor-name']);
    } finally {
        githubService.manageSecretCache = originalManage;
    }
});

test('general recoverable secret listings use a full mask without prefix or suffix leakage', async () => {
    const originalFind = SecretCache.find;
    SecretCache.find = async () => [{
        secret_name: 'GH_TOKEN',
        secret_value: 'prefix-sensitive-suffix',
        updated_at: new Date('2026-01-01T00:00:00Z'),
        updated_by: 'root'
    }];

    try {
        const result = await secretService.getAllSecrets();
        const token = result.find((item) => item.key === 'GH_TOKEN');
        assert.equal(token.displayValue, '********');
        assert.doesNotMatch(JSON.stringify(token), /prefix|suffix/);
    } finally {
        SecretCache.find = originalFind;
    }
});

test('secret cache writes are encrypted at rest while the runtime cache keeps plaintext', async () => {
    const originalFindOneAndUpdate = SecretCache.findOneAndUpdate;
    let persisted;
    SecretCache.findOneAndUpdate = async (_filter, update) => {
        persisted = update.secret_value;
        return {
            create_time: new Date('2026-01-01T00:00:00Z'),
            updated_at: new Date('2026-01-01T00:00:00Z')
        };
    };

    try {
        const result = await githubService.manageSecretCache(
            'set',
            'USERS_LIST',
            'private-users-list',
            'root'
        );
        assert.equal(result.ok, true);
        assert.equal(isEncrypted(persisted), true);
        assert.equal(decrypt(persisted), 'private-users-list');
        assert.equal(secretService.getSecretSync('USERS_LIST'), 'private-users-list');
    } finally {
        SecretCache.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

test('SecretCache model encrypts direct document assignments', () => {
    const doc = new SecretCache({ secret_name: 'MODEL_TEST', secret_value: 'model-secret' });
    const stored = doc.get('secret_value', null, { getters: false });
    assert.equal(isEncrypted(stored), true);
    assert.equal(doc.secret_value, 'model-secret');
});
