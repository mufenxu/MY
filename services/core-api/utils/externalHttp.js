const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONTENT_LENGTH = 2 * 1024 * 1024;

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function getExternalHttpOptions({
    timeoutMs = process.env.CORE_EXTERNAL_HTTP_TIMEOUT_MS,
    maxRedirects = 3,
    maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
} = {}) {
    return {
        timeout: boundedInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 30_000),
        maxRedirects: boundedInteger(maxRedirects, 3, 0, 5),
        maxContentLength: boundedInteger(
            maxContentLength,
            DEFAULT_MAX_CONTENT_LENGTH,
            64 * 1024,
            5 * 1024 * 1024,
        ),
    };
}

function isExternalHttpTimeout(error) {
    return ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
        || error?.name === 'AbortError';
}

module.exports = {
    getExternalHttpOptions,
    isExternalHttpTimeout,
};
