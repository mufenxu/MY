const { isCorrect } = require('./exam');
const { ADMIN_SCOPE } = require('./libraryScope');

function normalizeAnswer(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item).trim())
            .filter(Boolean);
    }

    if (value === undefined || value === null) {
        return [];
    }

    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
}

function buildCategorySnapshot(category) {
    if (!category) {
        return null;
    }

    return {
        categoryId: category._id ? String(category._id) : String(category.categoryId || ''),
        name: category.name || '',
        majorCategoryId: category.majorCategoryId
            ? String(category.majorCategoryId._id || category.majorCategoryId)
            : '',
        passingScore: typeof category.passingScore === 'number' ? category.passingScore : 60,
        duration: typeof category.duration === 'number' ? category.duration : 0,
        scopeType: category.scopeType || ADMIN_SCOPE,
        ownerOpenid: category.ownerOpenid || null,
    };
}

function buildExamDetails(questions, answers = {}) {
    let correctCount = 0;

    const details = questions.map((question) => {
        const questionId = String(question._id);
        const userAnswer = normalizeAnswer(answers[questionId]);
        const correctAnswer = normalizeAnswer(question.answer);
        const isAnswerCorrect = userAnswer.length > 0 && isCorrect(userAnswer, correctAnswer);

        if (isAnswerCorrect) {
            correctCount += 1;
        }

        return {
            questionId,
            type: question.type,
            content: question.content,
            options: Array.isArray(question.options)
                ? question.options.map((option) => ({
                    label: option.label,
                    value: option.value,
                }))
                : [],
            analysis: question.analysis || '',
            analysisSource: question.analysisSource || 'manual',
            correctAnswer,
            userAnswer,
            isCorrect: isAnswerCorrect,
        };
    });

    return { details, correctCount };
}

function hasSnapshotDetails(result) {
    return Array.isArray(result?.details) && result.details.length > 0;
}

function toReviewDetails(details = []) {
    return details.map((detail) => ({
        question: {
            _id: detail.questionId,
            type: detail.type,
            content: detail.content,
            options: Array.isArray(detail.options) ? detail.options : [],
            analysis: detail.analysis || '',
            analysisSource: detail.analysisSource || 'manual',
        },
        userAnswer: Array.isArray(detail.userAnswer) ? detail.userAnswer : [],
        correctAnswer: Array.isArray(detail.correctAnswer) ? detail.correctAnswer : [],
        isCorrect: !!detail.isCorrect,
    }));
}

function groupWrongQuestionsFromResults(results = []) {
    const grouped = new Map();
    const seenQuestionIds = new Set();

    for (const result of results) {
        const categorySnapshot = result.categorySnapshot || {};
        const categoryId = String(
            categorySnapshot.categoryId
            || result.categoryId?._id
            || result.categoryId
            || '',
        );
        const categoryName = categorySnapshot.name || result.categoryId?.name || '未命名试卷';

        for (const detail of result.details || []) {
            if (!detail || detail.isCorrect || !detail.questionId) {
                continue;
            }

            const questionId = String(detail.questionId);
            if (seenQuestionIds.has(questionId)) {
                continue;
            }
            seenQuestionIds.add(questionId);

            if (!grouped.has(categoryId)) {
                grouped.set(categoryId, {
                    categoryId,
                    categoryName,
                    questions: [],
                });
            }

            grouped.get(categoryId).questions.push({
                _id: questionId,
                type: detail.type,
                content: detail.content,
                options: Array.isArray(detail.options) ? detail.options : [],
                answer: Array.isArray(detail.correctAnswer) ? detail.correctAnswer : [],
                analysis: detail.analysis || '',
                analysisSource: detail.analysisSource || 'manual',
                userAnswer: Array.isArray(detail.userAnswer) ? detail.userAnswer : [],
                answeredAt: result.createTime,
            });
        }
    }

    return Array.from(grouped.values());
}

module.exports = {
    normalizeAnswer,
    buildCategorySnapshot,
    buildExamDetails,
    hasSnapshotDetails,
    toReviewDetails,
    groupWrongQuestionsFromResults,
};
