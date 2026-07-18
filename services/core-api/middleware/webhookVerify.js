/**
 * GitHub Webhook 签名验证中间件
 * 验证来自 GitHub 的 Webhook 回调请求的 HMAC-SHA256 签名
 */
const crypto = require('crypto');
const logger = require('../utils/logger');
const secretService = require('../services/secretService');

const getWebhookSecret = () => {
    const value = secretService.getSecretSync('GH_WEBHOOK_SECRET') || process.env.GH_WEBHOOK_SECRET || '';
    return String(value).trim();
};

const isWebhookDisabled = () => ['0', 'false', 'off', 'disabled']
    .includes(String(process.env.GH_WEBHOOK_ENABLED || '').trim().toLowerCase());

const parseBodyObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};

    const text = value.trim();
    if (!text) return {};

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) { }

    try {
        const params = new URLSearchParams(text);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        return obj;
    } catch (_) {
        return {};
    }
};

const extractSecret = (req, { allowPayload = false } = {}) => {
    const lowerHeader = (name) => {
        const val = req.headers[name];
        return Array.isArray(val) ? val[0] : val;
    };

    const headerSecret = lowerHeader('x-webhook-secret')
        || lowerHeader('x-callback-secret')
        || lowerHeader('x-github-secret')
        || lowerHeader('x-ct8-secret')
        || lowerHeader('x-webhook-token')
        || lowerHeader('x-callback-token')
        || lowerHeader('x-api-key');

    if (headerSecret) return String(headerSecret);

    const authHeader = lowerHeader('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    if (!allowPayload) return '';

    const bodyObj = parseBodyObject(req.body);
    const rawObj = parseBodyObject(req.rawBody);
    const queryObj = req.query || {};

    const secret = bodyObj.s
        || bodyObj.secret
        || bodyObj.token
        || bodyObj.webhook_secret
        || rawObj.s
        || rawObj.secret
        || rawObj.token
        || rawObj.webhook_secret
        || queryObj.s
        || queryObj.secret
        || queryObj.token;

    return secret ? String(secret) : '';
};

/**
 * 验证 GitHub Webhook 签名
 * @param {boolean} strict - 是否开启严格模式。开启后，缺少签名的请求将被拒绝。
 */
const verifyWebhookSignature = (strict = true) => (req, res, next) => {
    if (isWebhookDisabled()) {
        return res.status(503).json({
            error: 'Webhook disabled',
            code: 'WEBHOOK_DISABLED'
        });
    }

    const webhookSecret = getWebhookSecret();

    // Never accept an unsigned callback because deployment configuration is incomplete.
    if (!webhookSecret) {
        logger.error('[Webhook] GH_WEBHOOK_SECRET is not configured; callback rejected.');
        return res.status(503).json({
            error: 'Webhook verification is not configured',
            code: 'WEBHOOK_NOT_CONFIGURED'
        });
    }

    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        // 兼容旧回调：允许通过 header/body/query 中的 shared secret 校验
        // Strict endpoints allow legacy shared secrets only in request headers.
        // Payload/query credentials are retained solely for explicitly non-strict
        // integrations because URLs and request bodies are commonly logged.
        const providedSecret = extractSecret(req, { allowPayload: !strict });
        if (providedSecret) {
            const providedBuf = Buffer.from(String(providedSecret).trim());
            const secretBuf = Buffer.from(String(webhookSecret).trim());
            if (providedBuf.length === secretBuf.length && crypto.timingSafeEqual(providedBuf, secretBuf)) {
                logger.warn('[Webhook] 未携带签名头，已通过 shared secret 兼容校验放行。建议升级为 x-hub-signature-256。');
                return next();
            }
        }

        if (strict) {
            logger.error('[Webhook] 请求缺少 x-hub-signature-256 签名头，严格模式下已拦截。');
            return res.status(401).json({ error: 'Missing signature' });
        } else {
            logger.warn('[Webhook] 请求缺少签名头。当前处于降级兼容模式，已放行。');
            return next();
        }
    }

    const body = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');

    // 使用时间安全的比较方法防止时序攻击
    const isValid = signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) {
        logger.warn('[Webhook] 签名验证失败，请求被拒绝');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

module.exports = verifyWebhookSignature;
