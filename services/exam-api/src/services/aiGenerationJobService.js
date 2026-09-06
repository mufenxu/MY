const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../config/logger');
const Category = require('../models/Category');
const Question = require('../models/Question');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const AiGenerationJob = require('../models/AiGenerationJob');
const { AppError, NotFoundError } = require('../utils/errors');
const { ADMIN_SCOPE, PERSONAL_SCOPE, buildAdminScopeQuery } = require('../utils/libraryScope');
const { toQuestionListSort } = require('../utils/questionOrder');
const { buildQuestionSignature, generateQuestionAnalysis } = require('./aiAnalysisService');
const { beforeBatchGeneration, beforeSingleGeneration, afterSingleGeneration } = require('./aiGenerationGuard');

const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_MS = Math.max(config.ai.timeoutMs + 60_000, 90_000);
let workerTimer = null;
let activeRun = null;

function scopedQuery({ scopeType, ownerOpenid }, extra = {}) {
    if (scopeType === ADMIN_SCOPE) return buildAdminScopeQuery(extra);
    return { ...extra, scopeType, ...(scopeType === PERSONAL_SCOPE ? { ownerOpenid } : {}) };
}

function toJobPayload(job) {
    return {
        jobId: String(job._id),
        status: job.status,
        processed: job.processed,
        scheduled: job.questionIds.length,
        summary: {
            total: job.total,
            generated: job.generated,
            skipped: job.skipped,
            pending: job.pending,
            failed: job.failed,
            failures: job.failures,
            selected: job.selected,
        },
    };
}

async function enqueueCategoryAiAnalyses(input) {
    const { categoryId, actorKey, limit = 10, forceRefresh = false, questionIds = [] } = input;
    const existing = await AiGenerationJob.findOne({ actorKey, active: true }).lean();
    if (existing) {
        if (existing.categoryId === String(categoryId) && existing.scopeType === input.scopeType) {
            return toJobPayload(existing);
        }
        throw new AppError('已有 AI 批量任务正在处理，请等待完成后再试', 409);
    }

    const selectedIds = [...new Set(questionIds.map(String))];
    const selected = selectedIds.length > 0;
    const questions = await Question.find(scopedQuery(input, {
        categoryId,
        ...(selected ? { _id: { $in: selectedIds } } : {}),
    })).select('_id').sort(toQuestionListSort(true)).limit(1000).lean();
    if (selected && questions.length !== selectedIds.length) {
        throw new NotFoundError('包含无效或无权访问的题目');
    }

    const ids = questions.map((question) => String(question._id));
    const records = forceRefresh || ids.length === 0 ? []
        : await AiQuestionAnalysis.find({ questionId: { $in: ids } }).select('questionId').lean();
    const storedIds = new Set(records.map((record) => record.questionId));
    const available = ids.filter((id) => !storedIds.has(id));
    const targets = available.slice(0, Math.min(limit, config.ai.batchMaxPerRun));
    if (targets.length) await beforeBatchGeneration(actorKey);

    let job;
    try {
        job = await AiGenerationJob.create({
            actorKey,
            categoryId,
            scopeType: input.scopeType,
            ownerOpenid: input.ownerOpenid || '',
            requesterOpenid: input.requesterOpenid || '',
            questionIds: targets,
            forceRefresh,
            total: ids.length,
            skipped: ids.length - available.length,
            pending: available.length - targets.length,
            selected,
            active: targets.length > 0,
            status: targets.length ? 'queued' : 'completed',
            expiresAt: targets.length ? null : new Date(Date.now() + JOB_RETENTION_MS),
        });
    } catch (error) {
        if (error?.code === 11000) throw new AppError('已有 AI 批量任务正在处理，请稍后查询进度', 409);
        throw error;
    }
    return toJobPayload(job);
}

async function getAiGenerationJob({ id, actorKey, scopeType }) {
    const job = await AiGenerationJob.findOne({ _id: id, actorKey, scopeType }).lean();
    if (!job) throw new NotFoundError('AI 生成任务不存在');
    return toJobPayload(job);
}

async function processJob(job) {
    const claim = { _id: job._id, active: true, leaseToken: job.leaseToken };
    while (workerTimer && job.processed < job.questionIds.length) {
        const questionId = job.questionIds[job.processed];
        const questionStartedAt = job.questionStartedAt || new Date();
        const renewed = await AiGenerationJob.updateOne(claim, {
            $set: { questionStartedAt, leaseUntil: new Date(Date.now() + LEASE_MS) },
        });
        if (!renewed.matchedCount) return;

        let failure = null;
        try {
            const category = await Category.exists(scopedQuery(job, { _id: job.categoryId }));
            const question = category && await Question.findOne(scopedQuery(job, {
                _id: questionId, categoryId: job.categoryId,
            })).select('_id categoryId scopeType ownerOpenid type content options answer analysis').lean();
            if (!question) throw new NotFoundError('题目已删除或不再属于此题库');

            // A restart may occur after saving an analysis but before advancing the job.
            const saved = await AiQuestionAnalysis.exists({
                questionId,
                questionSignature: buildQuestionSignature(question),
                lastGeneratedAt: { $gte: questionStartedAt },
            });
            if (!saved) {
                const result = await generateQuestionAnalysis({
                    question,
                    forceRefresh: job.forceRefresh,
                    requesterOpenid: job.requesterOpenid,
                    generationKey: job.actorKey,
                    allowUpstream: true,
                    beforeUpstream: () => beforeSingleGeneration(job.actorKey),
                    afterUpstream: (result, reservation) => afterSingleGeneration(job.actorKey, result, reservation),
                });
                if (result.persisted === false) throw new AppError('AI解析未能保存，请稍后重试', 503);
            }
        } catch (error) {
            failure = { questionId, message: error instanceof AppError ? error.message : '生成失败，请稍后重试' };
            logger.warn({ err: error, jobId: String(job._id), questionId }, 'AI batch question failed');
        }

        const update = {
            $inc: { processed: 1, [failure ? 'failed' : 'generated']: 1 },
            $set: { questionStartedAt: null, leaseUntil: new Date(Date.now() + LEASE_MS) },
        };
        if (failure) update.$push = { failures: { $each: [failure], $slice: 5 } };
        job = await AiGenerationJob.findOneAndUpdate(claim, update, { new: true }).lean();
        if (!job) return;
    }
    await AiGenerationJob.updateOne(claim, {
        $set: job.processed === job.questionIds.length ? {
            active: false, status: 'completed', leaseToken: '', leaseUntil: new Date(0),
            expiresAt: new Date(Date.now() + JOB_RETENTION_MS),
        } : { status: 'queued', leaseToken: '', leaseUntil: new Date(0) },
    });
}

function startAiGenerationWorker() {
    if (workerTimer) return;
    const tick = () => {
        if (activeRun) return;
        activeRun = (async () => {
            const job = await AiGenerationJob.findOneAndUpdate({
                active: true, leaseUntil: { $lte: new Date() },
            }, { $set: {
                status: 'running', leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + LEASE_MS),
            } }, { sort: { createdAt: 1 }, new: true }).lean();
            if (job) await processJob(job);
        })().catch((error) => {
            logger.error({ err: error }, 'AI batch worker failed; pending work will resume after its lease expires');
        }).finally(() => { activeRun = null; });
    };
    workerTimer = setInterval(tick, 1000);
    workerTimer.unref?.();
    tick();
}

async function stopAiGenerationWorker() {
    clearInterval(workerTimer);
    workerTimer = null;
    await activeRun;
}

module.exports = { enqueueCategoryAiAnalyses, getAiGenerationJob, startAiGenerationWorker, stopAiGenerationWorker };
