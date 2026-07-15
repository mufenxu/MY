/**
 * 考试详情 API 层（ESM 版）
 * 从 exam-detail-api.js IIFE 迁移。
 */
import http from '@/utils/http';

export function createExamDetailApi({ getExamId, getScopeType, getIsConsoleMode, apiBase = '' }) {
    const isConsoleMode = () => Boolean(getIsConsoleMode?.());
    const examId = () => encodeURIComponent(String(getExamId?.() || ''));
    const scopeType = () => getScopeType?.() || 'admin';

    const categoryUrl = () =>
        `${apiBase}${isConsoleMode() ? '/api/console' : '/api/manage'}/categories/${examId()}`;
    const questionsUrl = () =>
        `${apiBase}${isConsoleMode() ? '/api/console' : '/api/manage'}/questions`;
    const questionUrl = (questionId) =>
        `${questionsUrl()}/${encodeURIComponent(String(questionId || ''))}`;
    const batchSaveUrl = () =>
        `${apiBase}${isConsoleMode() ? '/api/console' : '/api/manage'}/categories/${examId()}/questions`;
    const scopeParams = (extra = {}) =>
        isConsoleMode() ? extra : { ...extra, scopeType: scopeType() };
    const scopePayload = (extra = {}) =>
        isConsoleMode() ? extra : { ...extra, scopeType: scopeType() };

    return {
        loadExamInfo: () =>
            http.get(categoryUrl(), isConsoleMode() ? undefined : { params: scopeParams() }),
        listQuestions: () =>
            http.get(questionsUrl(), { params: scopeParams({ categoryId: getExamId(), pageSize: 1000, limit: 1000 }) }),
        getAiAnalysis: (questionId) =>
            http.get(`${questionUrl(questionId)}/ai-analysis`, { params: scopeParams() }),
        generateAiAnalyses: (payload) =>
            http.post(`${categoryUrl()}/ai-analyses/generate`, scopePayload(payload), {
                timeout: 180000,
            }),
        adoptAiAnalysis: (questionId) =>
            http.patch(`${questionUrl(questionId)}/ai-analysis/adopt`, {}, {
                params: scopeParams(),
            }),
        deleteAiAnalysis: (questionId) =>
            http.delete(`${questionUrl(questionId)}/ai-analysis`, {
                params: scopeParams(),
            }),
        updateExamInfo: (payload) =>
            http.put(categoryUrl(), scopePayload(payload)),
        saveQuestions: (questions) =>
            http.put(batchSaveUrl(), scopePayload({ questions })),
    };
}
