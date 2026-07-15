/**
 * HTTP 请求日志中间件。
 * 记录方法、脱敏后的 URL、状态码和耗时。
 */
const logger = require('../config/logger');

const SENSITIVE_QUERY_KEYS = new Set([
    'token',
    'qrtoken',
    'polltoken',
    'tempauthcode',
    'code',
    'secret',
    'password',
    'authorization',
]);

function redactUrl(originalUrl = '') {
    try {
        const url = new URL(originalUrl, 'http://local');
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
                url.searchParams.set(key, '[REDACTED]');
            }
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return String(originalUrl).replace(
            /([?&][^=]*(?:token|code|secret|password|authorization)[^=]*=)[^&]*/gi,
            '$1[REDACTED]',
        );
    }
}

function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'info';
        const url = redactUrl(req.originalUrl);

        logger[level]({
            method: req.method,
            url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
        }, '%s %s %d %dms', req.method, url, res.statusCode, duration);
    });

    next();
}

module.exports = requestLogger;
