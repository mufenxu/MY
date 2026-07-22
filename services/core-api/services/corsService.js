const logger = require('../utils/logger');

const STATIC_ORIGINS = [
    'https://xcx.pxyb.cn',
    'http://xcx.pxyb.cn',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    ...String(process.env.PLATFORM_PUBLIC_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean),
];

const normalizedOrigins = new Set(STATIC_ORIGINS.map((origin) => origin.toLowerCase()));

function normalizeOrigin(origin) {
    let normalized = String(origin || '').trim().toLowerCase().replace(/\/$/, '');
    if (normalized.startsWith('https://') && normalized.endsWith(':443')) {
        normalized = normalized.slice(0, -4);
    } else if (normalized.startsWith('http://') && normalized.endsWith(':80')) {
        normalized = normalized.slice(0, -3);
    }
    return normalized;
}

async function isOriginAllowed(origin) {
    if (!origin) return true;
    if (origin === 'null') return false;

    const normalized = normalizeOrigin(origin);
    const allowed = normalizedOrigins.has(normalized);
    if (!allowed) logger.warn(`CORS request blocked for origin: ${origin}`);
    return allowed;
}

module.exports = {
    isOriginAllowed,
    STATIC_ORIGINS,
};
