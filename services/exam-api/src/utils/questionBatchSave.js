const mongoose = require('mongoose');
const Question = require('../models/Question');

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

module.exports = {
    replaceCategoryQuestions,
};
