const ExamResult = require('../models/ExamResult');
const ExamProgress = require('../models/ExamProgress');
const UserQuestionState = require('../models/UserQuestionState');
const { buildInitialReviewState, scheduleReview } = require('./reviewScheduler');

function answerStateUpdate(existing, { categoryId, isAnswerCorrect, at }) {
    if (!isAnswerCorrect) {
        return {
            $set: {
                categoryId,
                status: 'needsReview',
                correctStreak: 0,
                lastWrongAt: at,
                masteredAt: null,
                ...(existing ? scheduleReview(existing, 'unknown', at) : buildInitialReviewState(at)),
            },
            $inc: { wrongCount: 1 },
            $setOnInsert: { favorite: false, note: '' },
        };
    }
    if (!existing) return null;

    const correctStreak = (existing.correctStreak || 0) + 1;
    const nextStatus = correctStreak >= 2 ? 'mastered' : existing.status;
    const values = {
        categoryId,
        correctStreak,
        lastCorrectAt: at,
        status: nextStatus,
        ...scheduleReview(existing, 'known', at),
    };
    if (nextStatus === 'mastered' && !values.masteredAt) values.masteredAt = at;
    return { $set: values };
}

async function applyAnswerResultToQuestionState({
    userId, categoryId, questionId, isAnswerCorrect, at = new Date(),
}) {
    const filter = { userId, questionId };
    const existing = await UserQuestionState.findOne(filter).lean();
    const update = answerStateUpdate(existing, { categoryId, isAnswerCorrect, at });
    if (!update) return null;
    return UserQuestionState.findOneAndUpdate(filter, update, {
        upsert: !isAnswerCorrect,
        new: true,
        runValidators: true,
    });
}

async function syncQuestionStatesFromExam(userId, categoryId, details, session) {
    const answered = details.filter((detail) => detail?.questionId
        && Array.isArray(detail.userAnswer) && detail.userAnswer.length > 0);
    if (!answered.length) return;

    const states = await UserQuestionState.find({
        userId,
        questionId: { $in: answered.map((detail) => String(detail.questionId)) },
    }).session(session).lean();
    const existingById = new Map(states.map((state) => [String(state.questionId), state]));
    const at = new Date();
    const operations = answered.flatMap((detail) => {
        const questionId = String(detail.questionId);
        const update = answerStateUpdate(existingById.get(questionId), {
            categoryId, isAnswerCorrect: detail.isCorrect, at,
        });
        return update ? [{ updateOne: {
            filter: { userId, questionId },
            update,
            upsert: !detail.isCorrect,
        } }] : [];
    });
    if (operations.length) await UserQuestionState.bulkWrite(operations, { session });
}

async function persistExamSubmission(input) {
    try {
        return await ExamResult.db.transaction(async (session) => {
            const [result] = await ExamResult.create([input], { session });
            await syncQuestionStatesFromExam(input.userId, input.categoryId, input.details, session);
            if (input.attemptId) {
                await ExamProgress.updateOne(
                    { userId: input.userId, categoryId: input.categoryId, mode: 'exam', attemptId: input.attemptId },
                    { $set: { attemptSubmittedAt: new Date(), isCleared: true, timeLeft: 0 } },
                    { session },
                );
            }
            return result;
        });
    } catch (error) {
        // Concurrent submissions share one committed result, including its review state.
        if (error.code === 11000 && input.attemptId) {
            const existing = await ExamResult.findOne({
                userId: input.userId, categoryId: input.categoryId, attemptId: input.attemptId,
            });
            if (existing) return existing;
        }
        throw error;
    }
}

module.exports = { applyAnswerResultToQuestionState, persistExamSubmission };
