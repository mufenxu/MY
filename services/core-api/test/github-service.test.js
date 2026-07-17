const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const secretService = require('../services/secretService');
const githubService = require('../services/githubService');

test('GitHub authentication failures are exposed as upstream errors', async () => {
    const originalGet = axios.get;
    const originalGetSecretSync = secretService.getSecretSync;

    secretService.getSecretSync = (key) => ({
        GH_TOKEN: 'test-token',
        GH_OWNER: 'test-owner',
        GH_REPO: 'test-repo',
    })[key];
    axios.get = async () => {
        const error = new Error('Request failed with status code 401');
        error.response = {
            status: 401,
            data: { message: 'Bad credentials' },
        };
        throw error;
    };

    try {
        await assert.rejects(
            githubService.updateSecret('update', 'USERS_LIST', 'value'),
            (error) => {
                assert.equal(error.statusCode, 502);
                assert.equal(error.code, 'GITHUB_AUTH_FAILED');
                assert.match(error.message, /GH_TOKEN/);
                assert.deepEqual(error.details, {
                    operation: '更新 Actions Secret',
                    upstreamStatus: 401,
                    upstreamMessage: 'Bad credentials',
                });
                return true;
            }
        );
    } finally {
        axios.get = originalGet;
        secretService.getSecretSync = originalGetSecretSync;
    }
});

test('GitHub configuration accepts common GITHUB_* aliases', async () => {
    const originalGet = axios.get;
    const originalGetSecretSync = secretService.getSecretSync;

    secretService.getSecretSync = (key) => ({
        GITHUB_TOKEN: 'alias-token',
        GITHUB_REPOSITORY: 'alias-owner/alias-repo',
    })[key];
    axios.get = async (url, options) => {
        assert.equal(url, 'https://api.github.com/repos/alias-owner/alias-repo/actions/secrets/USERS_LIST');
        assert.equal(options.headers.Authorization, 'Bearer alias-token');
        return { data: { name: 'USERS_LIST' } };
    };

    try {
        const result = await githubService.updateSecret('get', 'USERS_LIST');
        assert.deepEqual(result, {
            ok: true,
            secret: { name: 'USERS_LIST' },
            message: 'Secret exists',
        });
    } finally {
        axios.get = originalGet;
        secretService.getSecretSync = originalGetSecretSync;
    }
});

test('missing GitHub token is reported as service configuration error', async () => {
    const originalGetSecretSync = secretService.getSecretSync;

    secretService.getSecretSync = () => null;

    try {
        await assert.rejects(
            githubService.updateSecret('update', 'USERS_LIST', 'value'),
            (error) => {
                assert.equal(error.statusCode, 503);
                assert.equal(error.code, 'GITHUB_NOT_CONFIGURED');
                assert.match(error.message, /GH_TOKEN/);
                return true;
            }
        );
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
    }
});
