const AuditLog = require('../models/AuditLog');
const { isSafeHttpMethod } = require('@my-platform/platform-auth');
const logger = require('../config/logger');

const SENSITIVE_KEY_PATTERN = /(password|token|secret|code|authorization)/i;

function sanitizeObject(value = {}) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return Object.entries(value).reduce((result, [key, item]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            result[key] = '[REDACTED]';
        } else if (Array.isArray(item)) {
            result[key] = item.slice(0, 20).map((entry) => String(entry).slice(0, 120));
        } else if (item && typeof item === 'object') {
            result[key] = '[OBJECT]';
        } else {
            result[key] = String(item ?? '').slice(0, 200);
        }
        return result;
    }, {});
}

function getBodyKeys(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return [];
    }

    return Object.keys(body)
        .filter((key) => !SENSITIVE_KEY_PATTERN.test(key))
        .slice(0, 50);
}

function getActor(req, fallbackActorType) {
    const role = req.user?.role || fallbackActorType || 'unknown';
    if (role === 'admin') {
        return {
            actorType: 'admin',
            actorId: String(req.user?.id || ''),
            actorName: String(req.user?.username || ''),
        };
    }

    if (role === 'console') {
        return {
            actorType: 'console',
            actorId: String(req.user?.openid || ''),
            actorName: String(req.user?.consoleRole || ''),
        };
    }

    return {
        actorType: role === 'user' ? 'user' : 'unknown',
        actorId: String(req.user?.openid || req.user?.id || ''),
        actorName: '',
    };
}

function auditMutations({ actorType } = {}) {
    return (req, res, next) => {
        if (isSafeHttpMethod(req.method)) {
            return next();
        }

        const startedAt = Date.now();

        res.on('finish', () => {
            if (res.statusCode >= 400) {
                return;
            }

            const actor = getActor(req, actorType);
            const routePath = req.route?.path
                ? `${req.baseUrl}${req.route.path}`
                : req.baseUrl;

            AuditLog.create({
                ...actor,
                method: req.method,
                path: req.path,
                routePath,
                statusCode: res.statusCode,
                params: sanitizeObject(req.params),
                query: sanitizeObject(req.query),
                bodyKeys: getBodyKeys(req.body),
                ip: req.ip,
                userAgent: String(req.get('user-agent') || '').slice(0, 300),
                durationMs: Date.now() - startedAt,
            }).catch((err) => {
                logger.warn({ err }, 'Failed to write audit log');
            });
        });

        return next();
    };
}

function recordAuditLog(req, options = {}) {
    const startedAt = Date.now();
    const actor = getActor(req, options.actorType);

    return AuditLog.create({
        ...actor,
        method: options.method || req.method || 'GET',
        path: options.path || req.path || '',
        routePath: options.routePath || '',
        statusCode: options.statusCode || 200,
        params: sanitizeObject(options.params || req.params),
        query: sanitizeObject(options.query || req.query),
        bodyKeys: Array.isArray(options.bodyKeys) ? options.bodyKeys.slice(0, 50) : [],
        ip: req.ip,
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
        durationMs: Date.now() - startedAt,
    }).catch((err) => {
        logger.warn({ err }, 'Failed to write audit log');
    });
}

module.exports = {
    auditMutations,
    recordAuditLog,
};
