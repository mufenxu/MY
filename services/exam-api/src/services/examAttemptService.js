const crypto = require('crypto');
const { AppError } = require('../utils/errors');
const { ADMIN_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

function toDurationSeconds(durationMinutes) {
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
        return 0;
    }

    return Math.floor(minutes * 60);
}

function toAttemptPayload(progress, { now = new Date(), submissionGraceMs = 0 } = {}) {
    const deadlineAt = progress?.deadlineAt ? new Date(progress.deadlineAt) : null;
    const deadlineMs = deadlineAt?.getTime() || 0;
    const nowMs = now.getTime();

    return {
        attemptId: progress?.attemptId || '',
        startedAt: progress?.attemptStartedAt || null,
        deadlineAt,
        durationSeconds: Number(progress?.attemptDurationSeconds) || 0,
        serverNow: now,
        submissionGraceSeconds: Math.ceil(Math.max(0, submissionGraceMs) / 1000),
        expired: Boolean(deadlineMs && nowMs >= deadlineMs),
        canSubmit: !deadlineMs || nowMs <= deadlineMs + Math.max(0, submissionGraceMs),
    };
}

async function startOrResumeExamAttempt({
    progressModel,
    userId,
    category,
    restart = false,
    requestId = '',
    now = new Date(),
    submissionGraceMs = 0,
}) {
    const categoryId = category._id;
    const key = { userId, categoryId, mode: 'exam' };
    const scopeType = category.scopeType === PERSONAL_SCOPE ? PERSONAL_SCOPE : ADMIN_SCOPE;
    let progress = await progressModel.findOneAndUpdate(
        key,
        {
            $setOnInsert: {
                currentIndex: 0,
                answers: {},
                timeLeft: 0,
                questionCount: 0,
                isCleared: false,
                scopeType,
                ownerOpenid: scopeType === PERSONAL_SCOPE ? userId : null,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const isIdempotentRestart = restart
        && requestId
        && progress.attemptRequestId === requestId;
    const canResume = progress.attemptId
        && !progress.attemptSubmittedAt
        && (!restart || isIdempotentRestart);
    if (canResume) {
        return toAttemptPayload(progress, { now, submissionGraceMs });
    }

    const durationSeconds = toDurationSeconds(category.duration);
    const attemptId = crypto.randomUUID();
    const previousAttemptId = progress.attemptId || null;
    const shouldResetProgress = restart || Boolean(progress.attemptSubmittedAt);
    const attemptData = {
        attemptId,
        attemptRequestId: requestId || null,
        attemptStartedAt: now,
        deadlineAt: durationSeconds > 0
            ? new Date(now.getTime() + durationSeconds * 1000)
            : null,
        attemptDurationSeconds: durationSeconds,
        attemptSubmittedAt: null,
        timeLeft: durationSeconds,
        isCleared: false,
        scopeType,
        ownerOpenid: scopeType === PERSONAL_SCOPE ? userId : null,
    };
    if (shouldResetProgress) {
        Object.assign(attemptData, {
            currentIndex: 0,
            answers: {},
            questionCount: 0,
            reciteQueue: [],
            reciteMastery: {},
            reciteReviewTimes: {},
        });
    }

    progress = await progressModel.findOneAndUpdate(
        { _id: progress._id, attemptId: previousAttemptId },
        { $set: attemptData },
        { new: true },
    );

    if (!progress) {
        progress = await progressModel.findOne(key);
        const wonBySameRequest = progress
            && progress.attemptId
            && !progress.attemptSubmittedAt
            && (!restart || (requestId && progress.attemptRequestId === requestId));
        if (!wonBySameRequest) {
            throw new AppError('考试场次创建冲突，请重试', 409);
        }
    }

    return toAttemptPayload(progress, { now, submissionGraceMs });
}

function assertExamAttemptCanSubmit({
    progress,
    attemptId,
    categoryDuration,
    now = new Date(),
    submissionGraceMs = 0,
}) {
    assertCurrentExamAttempt({ progress, attemptId, categoryDuration });
    if (!attemptId) {
        return;
    }

    const durationSeconds = Number(progress.attemptDurationSeconds) || 0;
    if (durationSeconds <= 0) {
        return;
    }

    const deadlineMs = progress.deadlineAt ? new Date(progress.deadlineAt).getTime() : 0;
    if (!deadlineMs) {
        throw new AppError('考试截止时间无效，请重新开始', 409);
    }

    if (now.getTime() > deadlineMs + Math.max(0, submissionGraceMs)) {
        throw new AppError('考试已超时，请重新开始', 409);
    }
}

function assertCurrentExamAttempt({ progress, attemptId }) {
    if (!attemptId) {
        throw new AppError('考试会话版本已更新，请重新进入考试', 409);
    }
    if (attemptId && (!progress || progress.attemptId !== attemptId)) {
        throw new AppError('考试场次已失效，请重新开始', 409);
    }
}

function resolveExamAttempt({ progresses = [], attemptId = '' }) {
    const candidates = Array.isArray(progresses)
        ? progresses.filter(Boolean)
        : (progresses ? [progresses] : []);

    if (!attemptId) {
        throw new AppError('考试会话版本已更新，请重新进入考试', 409);
    }
    const matches = candidates.filter((progress) => progress.attemptId === attemptId);
    if (matches.length !== 1) {
        throw new AppError('考试场次已失效，请重新开始', 409);
    }
    assertCurrentExamAttempt({ progress: matches[0], attemptId });
    return { attemptId, progress: matches[0] };
}

module.exports = {
    assertCurrentExamAttempt,
    assertExamAttemptCanSubmit,
    resolveExamAttempt,
    startOrResumeExamAttempt,
    toAttemptPayload,
    toDurationSeconds,
};
