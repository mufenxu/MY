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
const { buildQuestionSignature, isStoredAnalysisFresh, generateQuestionAnalysis } = require('./aiAnalysisService');
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
            failures: job.failures.slice(0, 5),
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
    if (selected) {
        const count = await Question.countDocuments(scopedQuery(input, { categoryId, _id: { $in: selectedIds } }));
        if (count !== selectedIds.length) throw new NotFoundError('包含无效或无权访问的题目');
    }
    await beforeBatchGeneration(actorKey);

    let job;
    try {
        job = await AiGenerationJob.create({
            actorKey,
            categoryId,
            scopeType: input.scopeType,
            ownerOpenid: input.ownerOpenid || '',
            requesterOpenid: input.requesterOpenid || '',
            requestedQuestionIds: selectedIds,
            batchLimit: Math.min(limit, config.ai.batchMaxPerRun),
            selectionPending: true,
            forceRefresh,
            selected,
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

async function retryAiGenerationJob({ id, actorKey, scopeType }) {
    const job = await AiGenerationJob.findOne({ _id: id, actorKey, scopeType }).lean();
    if (!job) throw new NotFoundError('AI 生成任务不存在');
    if (job.active) throw new AppError('任务仍在处理中，请完成后再重试', 409);
    if (!job.failures.length) throw new AppError('此任务没有失败题目', 400);
    if (!await Category.exists(scopedQuery(job, { _id: job.categoryId }))) throw new NotFoundError('题库不存在');
    const questions = await Question.find(scopedQuery(job, {
        categoryId: job.categoryId, _id: { $in: job.failures.map((failure) => failure.questionId) },
    })).select('_id').lean();
    if (!questions.length) throw new NotFoundError('失败题目已删除或不可访问');
    return enqueueCategoryAiAnalyses({
        ...job,
        questionIds: questions.map((question) => String(question._id)),
        limit: questions.length,
    });
}

async function selectJobQuestions(job, claim) {
    const after = job.selectionCursor?.questionId ? job.selectionCursor : null;
    const targets = after ? [...job.questionIds] : [];
    let total = after ? job.total : 0;
    let skipped = after ? job.skipped : 0;
    const baseQuery = scopedQuery(job, {
        categoryId: job.categoryId,
        ...(job.requestedQuestionIds.length ? { _id: { $in: job.requestedQuestionIds } } : {}),
    });
    const query = after ? { $and: [baseQuery, { $or: [
        { sortOrder: after.sortOrder == null ? { $ne: null } : { $gt: after.sortOrder } },
        {
            sortOrder: after.sortOrder ?? null,
            createTime: after.createTime == null ? { $ne: null } : { $gt: after.createTime },
        },
        { sortOrder: after.sortOrder ?? null, createTime: after.createTime ?? null, _id: { $gt: after.questionId } },
    ] }] } : baseQuery;
    const cursor = Question.find(query).select('_id sortOrder createTime type content options answer analysis')
        .sort(toQuestionListSort(true)).lean().cursor({ batchSize: 200 });
    const inspectBatch = async (questions) => {
        const records = job.forceRefresh ? [] : await AiQuestionAnalysis.find({
            questionId: { $in: questions.map((question) => String(question._id)) },
        }).select('questionId questionSignature promptVersion analysis').lean();
        const byId = new Map(records.map((record) => [record.questionId, record]));
        for (const question of questions) {
            total += 1;
            if (!job.forceRefresh && isStoredAnalysisFresh(byId.get(String(question._id)), question)) skipped += 1;
            else if (targets.length < job.batchLimit) targets.push(String(question._id));
        }
        const last = questions[questions.length - 1];
        const result = await AiGenerationJob.updateOne(claim, {
            $set: {
                status: 'selecting', total, skipped, questionIds: targets,
                selectionCursor: {
                    questionId: String(last._id), sortOrder: last.sortOrder ?? null, createTime: last.createTime ?? null,
                },
                leaseUntil: new Date(Date.now() + LEASE_MS),
            },
        });
        return result.matchedCount > 0;
    };
    try {
        let batch = [];
        for await (const question of cursor) {
            if (!workerTimer) return null;
            batch.push(question);
            if (batch.length === 200) {
                if (!await inspectBatch(batch)) return null;
                batch = [];
            }
        }
        if (batch.length && !await inspectBatch(batch)) return null;
        return await AiGenerationJob.findOneAndUpdate(claim, { $set: {
            questionIds: targets, total, skipped, pending: total - skipped - targets.length,
            selectionPending: false, status: 'running', leaseUntil: new Date(Date.now() + LEASE_MS),
        } }, { new: true }).lean();
    } finally {
        await cursor.close();
    }
}

async function processJob(job) {
    const claim = { _id: job._id, active: true, leaseToken: job.leaseToken };
    if (job.selectionPending) {
        job = await selectJobQuestions(job, claim);
        if (!job) {
            await AiGenerationJob.updateOne(claim, { $set: { status: 'queued', leaseToken: '', leaseUntil: new Date(0) } });
            return;
        }
    }
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
        if (failure) update.$push = { failures: failure };
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

module.exports = { enqueueCategoryAiAnalyses, getAiGenerationJob, retryAiGenerationJob, startAiGenerationWorker, stopAiGenerationWorker };
