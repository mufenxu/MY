const Question = require('../models/Question');

const QUESTION_ORDER_SORT = { sortOrder: 1, createTime: 1, _id: 1 };
const QUESTION_RECENT_SORT = { updateTime: -1, _id: -1 };

function toQuestionListSort(hasCategoryFilter) {
    return hasCategoryFilter ? QUESTION_ORDER_SORT : QUESTION_RECENT_SORT;
}

async function getNextQuestionSortOrder(query) {
    const lastQuestion = await Question.findOne(query)
        .select('sortOrder')
        .sort({ sortOrder: -1, createTime: -1, _id: -1 })
        .lean();

    const lastSortOrder = Number(lastQuestion?.sortOrder);
    if (Number.isFinite(lastSortOrder)) {
        return lastSortOrder + 1;
    }

    return Question.countDocuments(query);
}

function normalizeText(value) {
    return String(value || '').trim();
}

function comparableQuestionPayload(question) {
    return JSON.stringify({
        type: normalizeText(question.type),
        content: normalizeText(question.content),
        options: (question.options || []).map((option) => ({
            label: normalizeText(option.label),
            value: normalizeText(option.value),
        })),
        answer: (question.answer || []).map(normalizeText),
    });
}

function hasQuestionBodyChanged(oldQuestion, savedQuestion) {
    if (!oldQuestion || !savedQuestion) {
        return true;
    }

    return comparableQuestionPayload(oldQuestion) !== comparableQuestionPayload(savedQuestion);
}

function resolveAnalysisSourceOnSave(oldQuestion, savedQuestion) {
    const nextAnalysis = normalizeText(savedQuestion?.analysis);
    if (!nextAnalysis) {
        return 'manual';
    }

    if (!oldQuestion) {
        return 'manual';
    }

    const analysisChanged = normalizeText(oldQuestion.analysis) !== nextAnalysis;
    if (analysisChanged || hasQuestionBodyChanged(oldQuestion, savedQuestion)) {
        return 'manual';
    }

    return oldQuestion.analysisSource === 'ai' ? 'ai' : 'manual';
}

function getInvalidatedAiAnalysisQuestionIds(oldQuestions, savedQuestions) {
    const oldQuestionMap = new Map(oldQuestions.map((question) => [String(question._id), question]));
    const savedQuestionIds = new Set(
        savedQuestions
            .map((question) => String(question._id || ''))
            .filter((id) => oldQuestionMap.has(id)),
    );
    const invalidatedIds = [];

    for (const oldQuestion of oldQuestions) {
        const oldId = String(oldQuestion._id);
        if (!savedQuestionIds.has(oldId)) {
            invalidatedIds.push(oldId);
        }
    }

    for (const savedQuestion of savedQuestions) {
        const savedId = String(savedQuestion._id || '');
        const oldQuestion = oldQuestionMap.get(savedId);
        if (!oldQuestion) {
            continue;
        }

        if (comparableQuestionPayload(oldQuestion) !== comparableQuestionPayload(savedQuestion)) {
            invalidatedIds.push(savedId);
        }
    }

    return [...new Set(invalidatedIds)];
}

module.exports = {
    QUESTION_ORDER_SORT,
    toQuestionListSort,
    getNextQuestionSortOrder,
    resolveAnalysisSourceOnSave,
    getInvalidatedAiAnalysisQuestionIds,
};
