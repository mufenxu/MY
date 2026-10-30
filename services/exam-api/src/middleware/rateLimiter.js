/**
 * 分级限流配置。
 * 使用当前 Mongoose 连接写入轻量级计数集合，避免额外限流依赖带来的供应链风险。
 */
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../config/logger');
const { fail } = require('../utils/respond');

/**
 * 429 的统一写法：JSON 信封 + Retry-After。
 *
 * 不要退回 `message: { code: 429, message: '...' }`——那样响应体里的 code 是数字
 * HTTP 状态（规范 §2.1 明令禁止），而且没有 Retry-After，客户端只能盲等。
 */
function rateLimitHandler(message) {
    return (req, res, _next, options = {}) => {
        const resetTime = req.rateLimit && req.rateLimit.resetTime instanceof Date
            ? req.rateLimit.resetTime.getTime()
            : null;
        const windowMs = Number(options.windowMs) || 60_000;
        const retryAfter = Math.max(
            1,
            resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : Math.ceil(windowMs / 1000),
        );
        res.setHeader('Retry-After', String(retryAfter));
        return fail(res, {
            status: 429,
            code: 'RATE_LIMITED',
            message,
            retryAfter,
            requestId: req.id,
        });
    };
}

const configuredMemoryLimit = Number.parseInt(process.env.RATE_LIMIT_FALLBACK_MAX_KEYS || '', 10);
const FALLBACK_MEMORY_MAX_KEYS = Number.isFinite(configuredMemoryLimit)
    ? Math.min(Math.max(configuredMemoryLimit, 100), 100000)
    : 10000;

class MongoRateLimitStore {
    constructor(collectionName, options = {}) {
        this.collectionName = collectionName;
        this.windowMs = 15 * 60 * 1000;
        this.memoryHits = new Map();
        this.memoryMaxEntries = options.memoryMaxEntries || FALLBACK_MEMORY_MAX_KEYS;
        this.lastMemoryCleanupAt = 0;
        this.indexPromise = null;
    }

    init(options = {}) {
        this.windowMs = options.windowMs || this.windowMs;
    }

    get collection() {
        if (mongoose.connection.readyState !== 1) {
            return null;
        }
        return mongoose.connection.collection(this.collectionName);
    }

    ensureIndex(collection) {
        if (!this.indexPromise) {
            this.indexPromise = collection
                .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
                .catch((err) => {
                    this.indexPromise = null;
                    logger.warn({ err, collectionName: this.collectionName }, 'Failed to ensure rate-limit TTL index');
                });
        }
        return this.indexPromise;
    }

    cleanupMemory(now = Date.now(), force = false) {
        const cleanupInterval = Math.min(this.windowMs, 60000);
        if (!force && now - this.lastMemoryCleanupAt < cleanupInterval) return;
        this.lastMemoryCleanupAt = now;
        for (const [key, record] of this.memoryHits) {
            if (record.resetTime.getTime() <= now) this.memoryHits.delete(key);
        }
    }

    incrementMemory(key, now = Date.now()) {
        this.cleanupMemory(now);
        const current = this.memoryHits.get(key);
        if (!current || current.resetTime.getTime() <= now) {
            const resetTime = new Date(now + this.windowMs);
            if (this.memoryHits.size >= this.memoryMaxEntries) {
                this.cleanupMemory(now, true);
            }
            if (this.memoryHits.size >= this.memoryMaxEntries) {
                return { totalHits: Number.MAX_SAFE_INTEGER, resetTime };
            }
            this.memoryHits.set(key, { totalHits: 1, resetTime });
            return { totalHits: 1, resetTime };
        }

        current.totalHits += 1;
        return { totalHits: current.totalHits, resetTime: current.resetTime };
    }

    async increment(key) {
        const collection = this.collection;
        if (!collection) {
            return this.incrementMemory(key);
        }

        const now = new Date();
        const resetTime = new Date(now.getTime() + this.windowMs);
        const activeWindow = { $gt: ['$resetTime', now] };

        try {
            await this.ensureIndex(collection);
            const result = await collection.findOneAndUpdate(
                { _id: key },
                [
                    {
                        $set: {
                            hits: {
                                $cond: [
                                    activeWindow,
                                    { $add: [{ $ifNull: ['$hits', 0] }, 1] },
                                    1,
                                ],
                            },
                            resetTime: { $cond: [activeWindow, '$resetTime', resetTime] },
                            expireAt: { $cond: [activeWindow, '$expireAt', resetTime] },
                        },
                    },
                ],
                { upsert: true, returnDocument: 'after' },
            );

            const doc = result?.value || result;
            return {
                totalHits: doc?.hits || 1,
                resetTime: doc?.resetTime || resetTime,
            };
        } catch (err) {
            logger.warn({ err, collectionName: this.collectionName }, 'Rate-limit store failed, falling back to memory');
            return this.incrementMemory(key);
        }
    }

    async decrement(key) {
        const collection = this.collection;
        if (!collection) {
            const current = this.memoryHits.get(key);
            if (current) current.totalHits = Math.max(current.totalHits - 1, 0);
            return;
        }

        await collection.updateOne(
            { _id: key },
            [{ $set: { hits: { $max: [{ $subtract: [{ $ifNull: ['$hits', 0] }, 1] }, 0] } } }],
        ).catch(() => {});
    }

    async resetKey(key) {
        this.memoryHits.delete(key);
        const collection = this.collection;
        if (collection) {
            await collection.deleteOne({ _id: key }).catch(() => {});
        }
    }

    async resetAll() {
        this.memoryHits.clear();
        const collection = this.collection;
        if (collection) {
            await collection.deleteMany({}).catch(() => {});
        }
    }
}

function createMongoStore(collectionName) {
    return new MongoRateLimitStore(collectionName);
}

const authLimiter = rateLimit({
    windowMs: config.rateLimit.auth.windowMs,
    max: config.rateLimit.auth.max,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_auth'),
    handler: rateLimitHandler('登录请求过于频繁，请15分钟后再试'),
});

const apiLimiter = rateLimit({
    windowMs: config.rateLimit.api.windowMs,
    max: config.rateLimit.api.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_api'),
    handler: rateLimitHandler('请求过于频繁，请稍后再试'),
});

const clientLimiter = rateLimit({
    windowMs: config.rateLimit.client.windowMs,
    max: config.rateLimit.client.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_client'),
    handler: rateLimitHandler('请求过于频繁，请稍后再试'),
});

const aiLimiter = rateLimit({
    windowMs: config.rateLimit.ai.windowMs,
    max: config.rateLimit.ai.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_ai'),
    handler: rateLimitHandler('AI解析请求过于频繁，请稍后再试'),
});

const qrCreateLimiter = rateLimit({
    windowMs: config.rateLimit.qrCreate.windowMs,
    max: config.rateLimit.qrCreate.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_qr_create'),
    handler: rateLimitHandler('二维码创建过于频繁，请稍后再试'),
});

const qrStatusLimiter = rateLimit({
    windowMs: config.rateLimit.qrStatus.windowMs,
    max: config.rateLimit.qrStatus.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_qr_status'),
    handler: rateLimitHandler('二维码状态查询过于频繁，请稍后再试'),
});

module.exports = {
    FALLBACK_MEMORY_MAX_KEYS,
    MongoRateLimitStore,
    rateLimitHandler,
    authLimiter,
    apiLimiter,
    clientLimiter,
    aiLimiter,
    qrCreateLimiter,
    qrStatusLimiter,
};
