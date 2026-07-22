const mongoose = require('mongoose');
const Question = require('../models/Question');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const {
    resolveAnalysisSourceOnSave,
    getInvalidatedAiAnalysisQuestionIds,
} = require('./questionOrder');
const {
    getChangedFields,
    recordQuestionVersions,
} = require('../services/questionVersionService');

function supportsTransactions(connection = mongoose.connection) {
    const topologyType = connection?.client?.topology?.description?.type;
    return topologyType && topologyType !== 'Single' && topologyType !== 'Unknown';
}

function isTransactionUnsupportedError(error) {
    const message = String(error?.message || '');
    return (
        message.includes('Transaction numbers are only allowed')
        || message.includes('Transactions are not supported')
        || message.includes('Transaction not supported')
        || message.includes('This MongoDB deployment does not support retryable writes')
    );
}

function canUseNonTransactionalReplacement(nodeEnv = process.env.NODE_ENV) {
    return nodeEnv !== 'production';
}

function transactionRequiredError() {
    const error = new Error('Question replacement requires an available MongoDB transaction.');
    error.statusCode = 503;
    error.code = 'TRANSACTION_REQUIRED';
    error.isOperational = true;
    return error;
}

function revisionConflictError(message = 'Question data changed after it was loaded. Refresh and retry.') {
    const error = new Error(message);
    error.statusCode = 409;
    error.code = 'QUESTION_REVISION_CONFLICT';
    error.isOperational = true;
    return error;
}

function assertQuestionRevisions(questionsToSave, oldQuestions) {
    const oldById = new Map(oldQuestions.map((question) => [String(question._id), question]));

    for (const question of questionsToSave) {
        if (!question?._id) continue;
        if (question.revision === undefined) {
            throw revisionConflictError('Question revision is required. Refresh the question set and retry.');
        }
        const current = oldById.get(String(question._id));
        const expectedRevision = Number(question.revision);
        const currentRevision = Number(current?.revision) || 1;
        if (!current || expectedRevision !== currentRevision) {
            throw revisionConflictError();
        }
    }
}

function assertPersistedQuestionState(expectedQuestions, currentQuestions) {
    const expected = new Map(expectedQuestions.map((question) => [
        String(question._id),
        Number(question.revision) || 1,
    ]));
    const current = new Map(currentQuestions.map((question) => [
        String(question._id),
        Number(question.revision) || 1,
    ]));

    if (expected.size !== current.size) throw revisionConflictError();
    for (const [questionId, revision] of expected) {
        if (current.get(questionId) !== revision) throw revisionConflictError();
    }
}

async function readQuestionRevisionState(QuestionModel, questionQuery, session = null) {
    let query = QuestionModel.find(questionQuery).select('_id revision');
    if (session) query = query.session(session);
    return query.lean();
}

async function validateQuestionsBeforeReplace(questions, QuestionModel = Question) {
    await Promise.all(questions.map((question) => new QuestionModel(question).validate()));
}

async function replaceQuestionsWithoutTransaction({
    questionQuery,
    categoryQuery,
    categoryUpdate,
    questions,
    expectedQuestions = [],
    versionEntries = [],
    Category,
    QuestionModel = Question,
    recordVersions = recordQuestionVersions,
}) {
    const currentQuestions = await readQuestionRevisionState(QuestionModel, questionQuery);
    assertPersistedQuestionState(expectedQuestions, currentQuestions);
    await QuestionModel.deleteMany(questionQuery);

    if (questions.length > 0) {
        await QuestionModel.insertMany(questions);
    }

    await Category.findOneAndUpdate(categoryQuery, categoryUpdate);
    await recordVersions({ entries: versionEntries });
}

async function replaceCategoryQuestions({
    questionQuery,
    categoryQuery,
    categoryUpdate,
    questions,
    expectedQuestions = [],
    versionEntries = [],
    Category,
    QuestionModel = Question,
    mongooseInstance = mongoose,
    recordVersions = recordQuestionVersions,
}) {
    await validateQuestionsBeforeReplace(questions, QuestionModel);

    if (!supportsTransactions(mongooseInstance.connection)) {
        if (!canUseNonTransactionalReplacement()) throw transactionRequiredError();
        await replaceQuestionsWithoutTransaction({
            questionQuery,
            categoryQuery,
            categoryUpdate,
            questions,
            expectedQuestions,
            versionEntries,
            Category,
            QuestionModel,
            recordVersions,
        });
        return;
    }

    const session = await mongooseInstance.startSession();
    try {
        await session.withTransaction(async () => {
            const currentQuestions = await readQuestionRevisionState(QuestionModel, questionQuery, session);
            assertPersistedQuestionState(expectedQuestions, currentQuestions);
            await QuestionModel.deleteMany(questionQuery, { session });

            if (questions.length > 0) {
                await QuestionModel.insertMany(questions, { session });
            }

            await Category.findOneAndUpdate(categoryQuery, categoryUpdate, { session });
            await recordVersions({ entries: versionEntries, session });
        });
    } catch (error) {
        if (!isTransactionUnsupportedError(error)) {
            throw error;
        }

        if (!canUseNonTransactionalReplacement()) throw transactionRequiredError();

        await replaceQuestionsWithoutTransaction({
            questionQuery,
            categoryQuery,
            categoryUpdate,
            questions,
            expectedQuestions,
            versionEntries,
            Category,
            QuestionModel,
            recordVersions,
        });
    } finally {
        await session.endSession();
    }
}

function buildQuestionSavePlan({ questionsToSave, oldQuestions, categoryId, scopeAssignment }) {
    const oldQuestionMap = new Map(oldQuestions.map((question) => [String(question._id), question]));
    const oldQuestionIdSet = new Set(oldQuestionMap.keys());

    const questions = questionsToSave.map((question, index) => {
        const oldQuestion = question._id && oldQuestionIdSet.has(String(question._id))
            ? oldQuestionMap.get(String(question._id))
            : null;
        const nextQuestion = {
            ...(oldQuestion ? { _id: question._id } : {}),
            type: question.type,
            content: question.content,
            options: question.options,
            answer: question.answer,
            analysis: question.analysis,
            categoryId,
            sortOrder: index,
            ...scopeAssignment,
        };

        const savedQuestion = {
            ...nextQuestion,
            analysisSource: resolveAnalysisSourceOnSave(oldQuestion, nextQuestion),
        };
        const currentRevision = Number(oldQuestion?.revision) || 1;
        return {
            ...savedQuestion,
            revision: oldQuestion && getChangedFields(oldQuestion, savedQuestion).length === 0
                ? currentRevision
                : oldQuestion
                    ? currentRevision + 1
                    : 1,
        };
    });

    return {
        questions,
        invalidatedAiQuestionIds: getInvalidatedAiAnalysisQuestionIds(oldQuestions, questions),
    };
}

async function saveCategoryQuestions({
    questionsToSave,
    baseQuestions,
    questionQuery,
    categoryQuery,
    categoryId,
    categoryUpdate = {},
    scopeAssignment,
    actor = {},
    Category,
}) {
    const oldQuestions = await Question.find(questionQuery)
        .select('_id type content options answer analysis analysisSource categoryId scopeType ownerOpenid sortOrder revision')
        .lean();
    assertPersistedQuestionState(baseQuestions, oldQuestions);
    assertQuestionRevisions(questionsToSave, oldQuestions);
    const plan = buildQuestionSavePlan({
        questionsToSave,
        oldQuestions,
        categoryId,
        scopeAssignment,
    });
    const persistedQuestions = plan.questions.map((question) => ({
        ...question,
        _id: question._id || new mongoose.Types.ObjectId(),
    }));
    const oldQuestionMap = new Map(oldQuestions.map((question) => [String(question._id), question]));
    const versionEntries = [
        ...oldQuestions.map((question) => ({
            question,
            action: 'baseline',
            actor,
        })),
        ...persistedQuestions
            .filter((question) => {
                const previousQuestion = oldQuestionMap.get(String(question._id));
                return !previousQuestion || Number(question.revision) !== (Number(previousQuestion.revision) || 1);
            })
            .map((question) => ({
                question,
                previousQuestion: oldQuestionMap.get(String(question._id)) || null,
                action: oldQuestionMap.has(String(question._id)) ? 'update' : 'create',
                actor,
            })),
    ];

    await replaceCategoryQuestions({
        questionQuery,
        categoryQuery,
        categoryUpdate: { count: plan.questions.length, ...categoryUpdate },
        questions: persistedQuestions,
        expectedQuestions: baseQuestions,
        versionEntries,
        Category,
    });

    if (plan.invalidatedAiQuestionIds.length > 0) {
        await AiQuestionAnalysis.deleteMany({
            questionId: { $in: plan.invalidatedAiQuestionIds },
        });
    }

    return { ...plan, questions: persistedQuestions };
}

module.exports = {
    assertPersistedQuestionState,
    assertQuestionRevisions,
    buildQuestionSavePlan,
    canUseNonTransactionalReplacement,
    replaceCategoryQuestions,
    saveCategoryQuestions,
};
