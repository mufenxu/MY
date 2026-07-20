const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyServiceRequest } = require('@my-platform/platform-auth');
const { resolveInternalServiceUrl } = require('../utils/internalServiceUrl');
const { sendNotification } = require('../services/notificationClient');

test('production service URLs reject public hosts unless explicitly allowed', () => {
    assert.equal(resolveInternalServiceUrl({
        value: 'http://notification-service:3000',
        serviceName: 'notification-service',
        nodeEnv: 'production',
    }), 'http://notification-service:3000');
    assert.throws(() => resolveInternalServiceUrl({
        value: 'https://notify.example.com',
        serviceName: 'notification-service',
        nodeEnv: 'production',
    }), /internal service hostname/);
    assert.equal(resolveInternalServiceUrl({
        value: 'https://notify.example.com',
        serviceName: 'notification-service',
        nodeEnv: 'production',
        allowPublic: true,
    }), 'https://notify.example.com');
});

test('notification client signs exact request bodies and retries transient failures', async () => {
    const previousUrl = process.env.NOTIFICATION_SERVICE_URL;
    const previousKey = process.env.NOTIFY_API_KEY;
    process.env.NOTIFICATION_SERVICE_URL = 'http://notification-service:3000';
    process.env.NOTIFY_API_KEY = 'notification-client-test-key';
    const calls = [];
    const axiosImpl = {
        async post(url, body, config) {
            calls.push({ url, body, config });
            if (calls.length === 1) {
                const error = new Error('temporary failure');
                error.response = { status: 503 };
                throw error;
            }
            return { data: { errcode: 0 } };
        },
    };
    try {
        const response = await sendNotification(
            { msg_type: 'text', data: { content: 'hello' } },
            { axiosImpl, maxAttempts: 2, sleep: async () => {} },
        );
        assert.equal(response.data.errcode, 0);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].url, 'http://notification-service:3000/notify');
        assert.equal(verifyServiceRequest({
            headers: calls[1].config.headers,
            secret: process.env.NOTIFY_API_KEY,
            allowedCallers: ['core-api'],
            method: 'POST',
            pathname: '/notify',
            body: calls[1].body,
        }).caller, 'core-api');
    } finally {
        if (previousUrl === undefined) delete process.env.NOTIFICATION_SERVICE_URL;
        else process.env.NOTIFICATION_SERVICE_URL = previousUrl;
        if (previousKey === undefined) delete process.env.NOTIFY_API_KEY;
        else process.env.NOTIFY_API_KEY = previousKey;
    }
});
