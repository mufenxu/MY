const axios = require('axios');
const crypto = require('node:crypto');
const { issueServiceRequest } = require('@my-platform/platform-auth');
const { resolveInternalServiceUrl } = require('../utils/internalServiceUrl');

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, minimum), maximum);
}

function getNotificationServiceUrl() {
    return resolveInternalServiceUrl({
        value: process.env.NOTIFICATION_SERVICE_URL,
        serviceName: 'notification-service',
        developmentFallback: 'http://127.0.0.1:3000',
    });
}

function getNotificationApiKey(configuredApiKey = '') {
    return String(process.env.NOTIFY_API_KEY || configuredApiKey || '').trim();
}

function isTransientNotificationError(error) {
    const status = Number(error?.response?.status);
    return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)
        || status === 429
        || status === 502
        || status === 503
        || status === 504;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendNotification(payload, {
    apiKey = '',
    timeoutMs = 8_000,
    maxAttempts = process.env.CORE_NOTIFICATION_MAX_ATTEMPTS,
    axiosImpl = axios,
    requestId = crypto.randomUUID(),
    sleep = delay,
} = {}) {
    const secret = getNotificationApiKey(apiKey);
    if (!secret) throw new Error('Notification service API key is not configured');
    const body = JSON.stringify(payload);
    const url = `${getNotificationServiceUrl()}/notify`;
    const attempts = boundedInteger(maxAttempts, 2, 1, 3);
    const timeout = boundedInteger(timeoutMs, 8_000, 1_000, 30_000);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const serviceHeaders = issueServiceRequest({
                caller: 'core-api',
                secret,
                method: 'POST',
                pathname: '/notify',
                body,
            });
            return await axiosImpl.post(url, body, {
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Request-Id': requestId,
                    ...serviceHeaders,
                },
                timeout,
                transformRequest: [(data) => data],
            });
        } catch (error) {
            if (attempt >= attempts || !isTransientNotificationError(error)) throw error;
            await sleep(100 * attempt);
        }
    }
    throw new Error('Notification service request failed');
}

module.exports = {
    getNotificationApiKey,
    getNotificationServiceUrl,
    isTransientNotificationError,
    sendNotification,
};
