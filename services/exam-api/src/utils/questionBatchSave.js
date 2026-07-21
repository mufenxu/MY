const mongoose = require('mongoose');
const Question = require('../models/Question');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const {
    resolveAnalysisSourceOnSave,
    getInvalidatedAiAnalysisQuestionIds,
} = require('./questionOrder');

function supportsTransactions() {
    const topologyType = mongoose.connection?.client?.topology?.description?.type;
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

async function validateQuestionsBeforeReplace(questions) {
    await Promise.all(questions.map((question) => new Question(question).validate()));
}

async function replaceQuestionsWithoutTransaction({
    questionQuery,
    categoryQuery,
    categoryUpdate,
    questions,
    Category,
}) {
    await Question.deleteMany(questionQuery);

    if (questions.length > 0) {
        await Question.insertMany(questions);
    }

    await Category.findOneAndUpdate(categoryQuery, categoryUpdate);
}

async function replaceCategoryQuestions({
    questionQuery,
    categoryQuery,
    categoryUpdate,
    questions,
    Category,
}) {
    await validateQuestionsBeforeReplace(questions);

    if (!supportsTransactions()) {
        await replaceQuestionsWithoutTransaction({
            questionQuery,
            categoryQuery,
            categoryUpdate,
            questions,
            Category,
        });
        return;
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await Question.deleteMany(questionQuery, { session });

            if (questions.length > 0) {
                await Question.insertMany(questions, { session });
            }

            await Category.findOneAndUpdate(categoryQuery, categoryUpdate, { session });
        });
    } catch (error) {
        if (!isTransactionUnsupportedError(error)) {
            throw error;
        }

        await replaceQuestionsWithoutTransaction({
            questionQuery,
            categoryQuery,
            categoryUpdate,
            questions,
            Category,
        });
    } finally {
        session.endSession();
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

        return {
            ...nextQuestion,
            analysisSource: resolveAnalysisSourceOnSave(oldQuestion, nextQuestion),
        };
    });

    return {
        questions,
        invalidatedAiQuestionIds: getInvalidatedAiAnalysisQuestionIds(oldQuestions, questions),
    };
}

async function saveCategoryQuestions({
    questionsToSave,
    questionQuery,
    categoryQuery,
    categoryId,
    categoryUpdate = {},
    scopeAssignment,
    Category,
}) {
    const oldQuestions = await Question.find(questionQuery)
        .select('_id type content options answer analysis analysisSource')
        .lean();
    const plan = buildQuestionSavePlan({
        questionsToSave,
        oldQuestions,
        categoryId,
        scopeAssignment,
    });

    await replaceCategoryQuestions({
        questionQuery,
        categoryQuery,
        categoryUpdate: { count: plan.questions.length, ...categoryUpdate },
        questions: plan.questions,
        Category,
    });

    if (plan.invalidatedAiQuestionIds.length > 0) {
        await AiQuestionAnalysis.deleteMany({
            questionId: { $in: plan.invalidatedAiQuestionIds },
        });
    }

    return plan;
}

module.exports = {
    buildQuestionSavePlan,
    replaceCategoryQuestions,
    saveCategoryQuestions,
};
