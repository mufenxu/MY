/**
 * 分级限流配置。
 * 使用当前 Mongoose 连接写入轻量级计数集合，避免额外限流依赖带来的供应链风险。
 */
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../config/logger');

class MongoRateLimitStore {
    constructor(collectionName) {
        this.collectionName = collectionName;
        this.windowMs = 15 * 60 * 1000;
        this.memoryHits = new Map();
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

    incrementMemory(key) {
        const now = Date.now();
        const current = this.memoryHits.get(key);
        if (!current || current.resetTime.getTime() <= now) {
            const resetTime = new Date(now + this.windowMs);
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
    message: { code: 429, message: '登录请求过于频繁，请15分钟后再试' },
});

const apiLimiter = rateLimit({
    windowMs: config.rateLimit.api.windowMs,
    max: config.rateLimit.api.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_api'),
    message: { code: 429, message: '请求过于频繁，请稍后再试' },
});

const clientLimiter = rateLimit({
    windowMs: config.rateLimit.client.windowMs,
    max: config.rateLimit.client.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_client'),
    message: { code: 429, message: '请求过于频繁，请稍后再试' },
});

const aiLimiter = rateLimit({
    windowMs: config.rateLimit.ai.windowMs,
    max: config.rateLimit.ai.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_ai'),
    message: { code: 429, message: 'AI解析请求过于频繁，请稍后再试' },
});

const qrCreateLimiter = rateLimit({
    windowMs: config.rateLimit.qrCreate.windowMs,
    max: config.rateLimit.qrCreate.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_qr_create'),
    message: { code: 429, message: '二维码创建过于频繁，请稍后再试' },
});

const qrStatusLimiter = rateLimit({
    windowMs: config.rateLimit.qrStatus.windowMs,
    max: config.rateLimit.qrStatus.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('rate_limit_qr_status'),
    message: { code: 429, message: '二维码状态查询过于频繁，请稍后再试' },
});

module.exports = {
    authLimiter,
    apiLimiter,
    clientLimiter,
    aiLimiter,
    qrCreateLimiter,
    qrStatusLimiter,
};
