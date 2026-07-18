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

function isDuplicateKeyError(error) {
    return error?.code === 11000 || error?.code === 11001;
}

function buildQuotaError(actorKey, limit) {
    const scope = actorKey === GLOBAL_ACTOR_KEY ? '全站' : '';
    return new AppError(`今日${scope} AI 生成次数已达上限 ${limit} 次，请明天再试`, 429);
}

async function reserveUsageCounter({
    actorKey,
    day,
    increment,
    limit,
    model = AiGenerationUsage,
    now = new Date(),
}) {
    if (increment <= 0) return null;
    if (increment > limit) throw buildQuotaError(actorKey, limit);

    const maximumBeforeReservation = limit - increment;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const usage = await model.findOneAndUpdate(
                {
                    day,
                    actorKey,
                    $or: [
                        { generatedCount: { $exists: false } },
                        { generatedCount: { $lte: maximumBeforeReservation } },
                    ],
                },
                {
                    $inc: { generatedCount: increment },
                    $set: { lastReservedAt: now },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            if (usage) return usage;
        } catch (error) {
            if (isDuplicateKeyError(error)) continue;
            throw error;
        }
    }

    throw buildQuotaError(actorKey, limit);
}

async function releaseUsageCounter({ actorKey, day, increment, model = AiGenerationUsage }) {
    if (increment <= 0) return;
    await model.updateOne(
        { day, actorKey, generatedCount: { $gte: increment } },
        { $inc: { generatedCount: -increment } },
    );
}

async function reserveGeneration(actorKey, increment = 1) {
    if (!isStoreAvailable() || increment <= 0) return { active: false };

    const day = getDayKey();
    const limit = config.ai.dailyGenerationLimit;
    await reserveUsageCounter({ actorKey, day, increment, limit });
    try {
        await reserveUsageCounter({ actorKey: GLOBAL_ACTOR_KEY, day, increment, limit });
    } catch (error) {
        await releaseUsageCounter({ actorKey, day, increment }).catch((releaseError) => {
            logger.error({ err: releaseError, actorKey }, 'Failed to roll back actor AI quota reservation');
        });
        throw error;
    }

    return { active: true, actorKey, day, increment, settled: false };
}

async function releaseGeneration(reservation) {
    if (!reservation?.active || reservation.settled) return;
    reservation.settled = true;
    await Promise.all([
        releaseUsageCounter(reservation),
        releaseUsageCounter({ ...reservation, actorKey: GLOBAL_ACTOR_KEY }),
    ]);
}

async function commitGeneration(reservation) {
    if (!reservation?.active || reservation.settled) return;
    reservation.settled = true;
    const lastGeneratedAt = new Date();
    await Promise.all([
        AiGenerationUsage.updateOne(
            { day: reservation.day, actorKey: reservation.actorKey },
            { $set: { lastGeneratedAt } },
        ),
        AiGenerationUsage.updateOne(
            { day: reservation.day, actorKey: GLOBAL_ACTOR_KEY },
            { $set: { lastGeneratedAt } },
        ),
    ]);
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

    const reservation = await reserveGeneration(actorKey, increment);
    await commitGeneration(reservation);
}

async function beforeSingleGeneration(actorKey) {
    return reserveGeneration(actorKey, 1);
}

async function afterSingleGeneration(actorKey, result, reservation) {
    try {
        if (result?.generated) await commitGeneration(reservation);
        else await releaseGeneration(reservation);
    } catch (error) {
        logger.warn({ err: error, actorKey }, 'Failed to settle AI generation quota reservation');
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
    __testing: {
        releaseUsageCounter,
        reserveUsageCounter,
    },
};
