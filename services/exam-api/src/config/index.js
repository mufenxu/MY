/**
 * Centralized runtime configuration.
 * Validates required environment variables at startup.
 */
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const DEFAULT_PORT = 3110;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const examJwtSecret = process.env.EXAM_JWT_SECRET || process.env.JWT_SECRET || '';
const requiredEnvVars = ['MONGODB_URI'];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

if (!examJwtSecret) {
    console.error('Missing required environment variable: EXAM_JWT_SECRET');
    process.exit(1);
}

if (examJwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    const message = `EXAM_JWT_SECRET should be at least ${MIN_JWT_SECRET_LENGTH} characters long.`;
    if (isProduction) {
        console.error(message);
        process.exit(1);
    }
    console.warn(message);
}

if (isProduction) {
    const productionRequired = ['WECHAT_APP_ID', 'WECHAT_APP_SECRET'];
    for (const envVar of productionRequired) {
        if (!process.env[envVar]) {
            console.error(`Missing required production environment variable: ${envVar}`);
            process.exit(1);
        }
    }
}

const corsOrigins = (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function parsePositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTrustProxy(value, fallback = 1) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1;
    const hops = Number.parseInt(normalized, 10);
    return Number.isFinite(hops) && hops >= 0 ? hops : String(value).trim();
}

function parseOptionalHttpUrl(value, name) {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return '';
    }

    try {
        const url = new URL(trimmed);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('URL must use http or https');
        }
        return url.toString();
    } catch (error) {
        const message = `${name} must be a valid http(s) URL.`;
        if (isProduction) {
            console.error(message);
            process.exit(1);
        }
        console.warn(message, error.message);
        return '';
    }
}

function parseScanLoginQrCodeMode() {
    const mode = String(process.env.SCAN_LOGIN_QR_CODE_MODE || '').trim().toLowerCase();
    if (['scheme', 'link', 'wxacode'].includes(mode)) {
        return mode;
    }

    if (mode) {
        const message = 'SCAN_LOGIN_QR_CODE_MODE must be one of: scheme, link, wxacode.';
        if (isProduction) {
            console.error(message);
            process.exit(1);
        }
        console.warn(message);
    }

    return process.env.SCAN_LOGIN_QR_LINK_BASE ? 'link' : 'scheme';
}

if (isProduction && (corsOrigins.length === 0 || corsOrigins.includes('*'))) {
    console.error('CORS_ORIGINS must be explicitly configured in production.');
    process.exit(1);
}

const aiApiBaseUrl = process.env.SUB2API_BASE_URL || process.env.AI_API_BASE_URL || '';
const aiApiKey = process.env.SUB2API_API_KEY || process.env.AI_API_KEY || '';

const config = {
    isProduction,
    port: parseInt(process.env.PORT, 10) || DEFAULT_PORT,
    trustProxy: parseTrustProxy(
        process.env.EXAM_TRUST_PROXY || process.env.TRUST_PROXY || process.env.PLATFORM_TRUST_PROXY,
        1,
    ),

    mongodbUri: process.env.MONGODB_URI,
    mongodbOptions: {
        serverSelectionTimeoutMS: parsePositiveInt(process.env.EXAM_MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),
        socketTimeoutMS: parsePositiveInt(process.env.EXAM_MONGODB_SOCKET_TIMEOUT_MS, 45000),
        maxPoolSize: parsePositiveInt(process.env.EXAM_MONGODB_MAX_POOL_SIZE, 10),
    },

    jwtSecret: examJwtSecret,
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h',
    userJwtExpiresIn: process.env.USER_JWT_EXPIRES_IN || '30d',

    corsOrigins,

    wechat: {
        appId: process.env.WECHAT_APP_ID || '',
        appSecret: process.env.WECHAT_APP_SECRET || '',
    },

    scanLogin: {
        enabled: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),
        apiBase: '/api/public/scan-login',
        qrCodeMode: parseScanLoginQrCodeMode(),
        qrLinkBase: parseOptionalHttpUrl(process.env.SCAN_LOGIN_QR_LINK_BASE, 'SCAN_LOGIN_QR_LINK_BASE'),
        wxacode: {
            page: process.env.SCAN_LOGIN_WXACODE_PAGE || 'subpackages/user/scan-login/scan-login',
            checkPath: process.env.SCAN_LOGIN_WXACODE_CHECK_PATH !== 'false',
            envVersion: process.env.SCAN_LOGIN_WXACODE_ENV_VERSION || '',
        },
    },

    aiCaptcha: {
        enabled: process.env.ALIYUN_AI_CAPTCHA_ENABLED !== 'false'
            && Boolean(process.env.ALIYUN_AI_CAPTCHA_PREFIX)
            && Boolean(process.env.ALIYUN_AI_CAPTCHA_SCENE_ID || 'e5isq0ly'),
        region: process.env.ALIYUN_AI_CAPTCHA_REGION || 'cn',
        prefix: process.env.ALIYUN_AI_CAPTCHA_PREFIX || '',
        sceneId: process.env.ALIYUN_AI_CAPTCHA_SCENE_ID || 'e5isq0ly',
    },

    rateLimit: {
        auth: { windowMs: RATE_LIMIT_WINDOW_MS, max: 10 },
        api: { windowMs: RATE_LIMIT_WINDOW_MS, max: 200 },
        client: { windowMs: RATE_LIMIT_WINDOW_MS, max: 500 },
        ai: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            max: parsePositiveInt(process.env.AI_RATE_LIMIT_MAX, 10),
        },
        qrCreate: { windowMs: RATE_LIMIT_WINDOW_MS, max: 60 },
        qrStatus: { windowMs: RATE_LIMIT_WINDOW_MS, max: 900 },
    },

    ai: {
        enabled: process.env.AI_ANALYSIS_ENABLED !== 'false' && Boolean(aiApiBaseUrl && aiApiKey),
        apiBaseUrl: aiApiBaseUrl,
        apiKey: aiApiKey,
        model: process.env.SUB2API_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
        timeoutMs: parsePositiveInt(process.env.AI_API_TIMEOUT_MS, 30000),
        maxTokens: parsePositiveInt(process.env.AI_MAX_TOKENS, 500),
        batchMaxPerRun: parsePositiveInt(process.env.AI_BATCH_MAX_PER_RUN, 10),
        batchCooldownMs: parsePositiveInt(process.env.AI_BATCH_COOLDOWN_MS, 60000),
        dailyGenerationLimit: parsePositiveInt(process.env.AI_GENERATION_DAILY_LIMIT, 80),
        usageRetentionDays: parsePositiveInt(process.env.AI_USAGE_RETENTION_DAYS, 45),
    },

    bodyLimit: process.env.BODY_LIMIT || '10mb',
    adminPasswordMinLength: MIN_ADMIN_PASSWORD_LENGTH,
    externalApiTimeoutMs: parsePositiveInt(process.env.EXTERNAL_API_TIMEOUT_MS, 8000),
    examSubmissionGraceMs: parsePositiveInt(process.env.EXAM_SUBMISSION_GRACE_MS, 30000),
    shutdownTimeoutMs: parsePositiveInt(process.env.EXAM_SHUTDOWN_TIMEOUT_MS, 10000),
    shouldSeedSampleData:
        process.env.SEED_SAMPLE_DATA === 'true'
        || (!isProduction && process.env.SEED_SAMPLE_DATA !== 'false'),
};

module.exports = config;
