/**
 * 考试详情 API 层（ESM 版）
 * 从 exam-detail-api.js IIFE 迁移。
 */
import http from '@/utils/http';
import { collectPagedItems } from './pagedCollection.js';

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
        listQuestions: async (config = {}) => {
            const result = await collectPagedItems(({ page, pageSize }) => (
                http.get(questionsUrl(), {
                    ...config,
                    params: scopeParams({ categoryId: getExamId(), page, pageSize }),
                })
            ));
            return {
                ...result.response,
                data: {
                    ...result.response.data,
                    data: {
                        ...result.response.data.data,
                        list: result.items,
                        total: result.total,
                    },
                },
            };
        },
        listQuestionVersions: (questionId, params = {}, config = {}) =>
            http.get(`${questionUrl(questionId)}/versions`, {
                ...config,
                params: scopeParams({ ...(config.params || {}), ...params }),
            }),
        getQuestionVersion: (questionId, revision, config = {}) =>
            http.get(`${questionUrl(questionId)}/versions/${encodeURIComponent(String(revision))}`, {
                ...config,
                params: scopeParams(config.params || {}),
            }),
        restoreQuestionVersion: (questionId, revision, config = {}) =>
            http.post(
                `${questionUrl(questionId)}/versions/${encodeURIComponent(String(revision))}/restore`,
                {},
                {
                    ...config,
                    params: scopeParams(config.params || {}),
                },
            ),
        getAiAnalysis: (questionId) =>
            http.get(`${questionUrl(questionId)}/ai-analysis`, { params: scopeParams() }),
        generateAiAnalyses: async (payload, { onProgress, signal, retryJobId } = {}) => {
            const jobBase = `${apiBase}${isConsoleMode() ? '/api/console' : '/api/manage'}/ai-analyses/jobs`;
            const params = scopeParams();
            let response = retryJobId
                ? await http.post(`${jobBase}/${encodeURIComponent(retryJobId)}/retry`, {}, { params, signal })
                : await http.post(`${categoryUrl()}/ai-analyses/generate`, scopePayload(payload), { signal });
            let job = response.data.data;
            onProgress?.(job);
            while (['queued', 'selecting', 'running'].includes(job.status)) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                signal?.throwIfAborted();
                response = await http.get(`${jobBase}/${encodeURIComponent(job.jobId)}`, { params, signal });
                job = response.data.data;
                onProgress?.(job);
            }
            return { ...response, data: { ...response.data, data: job.summary } };
        },
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
        saveQuestions: (questions, baseQuestions) =>
            http.put(batchSaveUrl(), scopePayload({ questions, baseQuestions })),
    };
}
