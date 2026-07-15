const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');
const AiGenerationUsage = require('../models/AiGenerationUsage');
const { AppError } = require('../utils/errors');

const GLOBAL_ACTOR_KEY = 'global';

function isStoreAvailable() {
    return mongoose.connection.readyState === 1;
}

function getDayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function buildActorKey(actorType, actorId) {
    return `${actorType || 'unknown'}:${actorId || 'anonymous'}`;
}

function getRetrySeconds(ms) {
    return Math.max(Math.ceil(ms / 1000), 1);
}

async function getUsage(actorKey, day = getDayKey()) {
    if (!isStoreAvailable()) {
        return null;
    }

    return AiGenerationUsage.findOne({ day, actorKey }).lean();
}

async function assertDailyGenerationAvailable(actorKey, increment = 1) {
    if (!isStoreAvailable()) {
        return;
    }

    const limit = config.ai.dailyGenerationLimit;
    const day = getDayKey();
    const [actorUsage, globalUsage] = await Promise.all([
        getUsage(actorKey, day),
        getUsage(GLOBAL_ACTOR_KEY, day),
    ]);

    if ((actorUsage?.generatedCount || 0) + increment > limit) {
        throw new AppError(`今日 AI 生成次数已达上限 ${limit} 次，请明天再试`, 429);
    }

    if ((globalUsage?.generatedCount || 0) + increment > limit) {
        throw new AppError(`今日全站 AI 生成次数已达上限 ${limit} 次，请明天再试`, 429);
    }
}

async function assertBatchCooldown(actorKey) {
    if (!isStoreAvailable()) {
        return;
    }

    const cooldownMs = config.ai.batchCooldownMs;
    if (cooldownMs <= 0) {
        return;
    }

    const usage = await getUsage(actorKey);
    const lastBatchAt = usage?.lastBatchAt ? new Date(usage.lastBatchAt).getTime() : 0;
    if (!lastBatchAt) {
        return;
    }

    const elapsed = Date.now() - lastBatchAt;
    if (elapsed < cooldownMs) {
        const retrySeconds = getRetrySeconds(cooldownMs - elapsed);
        throw new AppError(`AI 批量生成过于频繁，请 ${retrySeconds} 秒后再试`, 429);
    }
}

async function markBatchStarted(actorKey) {
    if (!isStoreAvailable()) {
        return;
    }

    await AiGenerationUsage.findOneAndUpdate(
        { day: getDayKey(), actorKey },
        {
            $set: { lastBatchAt: new Date() },
            $setOnInsert: { generatedCount: 0 },
        },
        { upsert: true, setDefaultsOnInsert: true },
    );
}

async function recordGeneration(actorKey, increment = 1) {
    if (!isStoreAvailable() || increment <= 0) {
        return;
    }

    const now = new Date();
    const day = getDayKey(now);
    await Promise.all([
        AiGenerationUsage.findOneAndUpdate(
            { day, actorKey },
            {
                $inc: { generatedCount: increment },
                $set: { lastGeneratedAt: now },
            },
            { upsert: true, setDefaultsOnInsert: true },
        ),
        AiGenerationUsage.findOneAndUpdate(
            { day, actorKey: GLOBAL_ACTOR_KEY },
            {
                $inc: { generatedCount: increment },
                $set: { lastGeneratedAt: now },
            },
            { upsert: true, setDefaultsOnInsert: true },
        ),
    ]);
}

async function beforeSingleGeneration(actorKey) {
    await assertDailyGenerationAvailable(actorKey, 1);
}

async function afterSingleGeneration(actorKey, result) {
    if (!result?.generated) {
        return;
    }

    try {
        await recordGeneration(actorKey, 1);
    } catch (error) {
        logger.warn({ err: error, actorKey }, 'Failed to record AI generation usage');
    }
}

async function beforeBatchGeneration(actorKey) {
    await assertBatchCooldown(actorKey);
    await assertDailyGenerationAvailable(actorKey, 1);
    await markBatchStarted(actorKey);
}

module.exports = {
    buildActorKey,
    beforeSingleGeneration,
    afterSingleGeneration,
    beforeBatchGeneration,
    assertDailyGenerationAvailable,
    recordGeneration,
};
