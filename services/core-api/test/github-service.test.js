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
