/**
 * 管理后台 API 层
 * 从 admin-api.js IIFE 迁移为 ES Module。
 */
import http from '@/utils/http';

export function createAdminApi({ getIsConsoleMode, getIsDemoManage, apiBase = '' }) {
    const isConsoleMode = () => Boolean(getIsConsoleMode?.());
    const isDemoManage = () => Boolean(getIsDemoManage?.());

    const managementUrl = (path) =>
        `${apiBase}${isConsoleMode() ? '/api/console' : '/api/manage'}${path}`;
    const profileUrl = (path) =>
        `${apiBase}${isConsoleMode() ? '/api/console' : '/api/admin'}${path}`;
    const scopeParams = (extra = {}) =>
        (!isConsoleMode() && isDemoManage()) ? { ...extra, scopeType: 'demo' } : extra;
    const scopePayload = (extra = {}) =>
        (!isConsoleMode() && isDemoManage()) ? { ...extra, scopeType: 'demo' } : extra;
    const resourceId = (value) => encodeURIComponent(String(value));

    return {
        managementUrl,
        profileUrl,
        scopeParams,
        scopePayload,

        getDashboardData: () => http.get(
            isConsoleMode()
                ? `${apiBase}/api/console/overview`
                : `${apiBase}/api/admin/stats`,
        ),

        listMajorCategories: ({ includeAll = false } = {}) => {
            const params = isConsoleMode() ? {} : scopeParams(includeAll ? { all: true } : {});
            return http.get(managementUrl('/major-categories'), { params });
        },

        saveMajorCategory: (id, payload) =>
            id
                ? http.put(managementUrl(`/major-categories/${resourceId(id)}`), payload)
                : http.post(managementUrl('/major-categories'), payload),

        deleteMajorCategory: (id) =>
            http.delete(managementUrl(`/major-categories/${resourceId(id)}`), { params: scopeParams() }),

        listCategories: () =>
            http.get(managementUrl('/categories'), { params: scopeParams() }),

        saveCategory: (id, payload) =>
            id
                ? http.put(managementUrl(`/categories/${resourceId(id)}`), payload)
                : http.post(managementUrl('/categories'), payload),

        deleteCategory: (id) =>
            http.delete(managementUrl(`/categories/${resourceId(id)}`), { params: scopeParams() }),

        listPaperShares: (categoryId) =>
            http.get(managementUrl(`/categories/${resourceId(categoryId)}/shares`)),

        getCategoryAnalysis: (categoryId) =>
            http.get(managementUrl(`/categories/${resourceId(categoryId)}/analysis`)),

        createPaperShare: (categoryId, payload) =>
            http.post(managementUrl(`/categories/${resourceId(categoryId)}/shares`), payload),

        previewPaperShare: (shareCode) =>
            http.get(managementUrl('/paper-shares/preview'), { params: { shareCode } }),

        acceptPaperShare: (shareCode) =>
            http.post(managementUrl('/paper-shares/accept'), { shareCode }),

        revokePaperShare: (shareId) =>
            http.patch(managementUrl(`/paper-shares/${resourceId(shareId)}/revoke`)),

        listExamResults: (params) =>
            http.get(managementUrl('/exam-results'), { params }),

        deleteExamResults: (ids) =>
            http.delete(managementUrl('/exam-results'), { data: { ids } }),

        listUsers: (params) =>
            http.get(managementUrl('/users'), { params }),

        getUserDetails: (openid) =>
            http.get(managementUrl(`/users/${resourceId(openid)}`)),

        deleteUsers: (openids) =>
            http.delete(managementUrl('/users'), { data: { openids } }),

        clearUserRecords: (openid) =>
            http.delete(managementUrl(`/users/${resourceId(openid)}/records`)),

        getUserAssignments: (openid) =>
            http.get(managementUrl(`/users/${resourceId(openid)}/assignments`)),

        saveUserAssignments: (openid, payload) =>
            http.put(managementUrl(`/users/${resourceId(openid)}/assignments`), payload),

        listPersonalCategories: (params) =>
            http.get(managementUrl('/personal-categories'), { params }),

        getPersonalCategory: (id) =>
            http.get(managementUrl(`/personal-categories/${resourceId(id)}`)),

        listPersonalCategoryQuestions: (id, params) =>
            http.get(managementUrl(`/personal-categories/${resourceId(id)}/questions`), { params }),

        getFeedbackSummary: () =>
            http.get(managementUrl('/feedbacks/summary')),

        listFeedbacks: (params) =>
            http.get(managementUrl('/feedbacks'), { params }),

        createFeedback: (payload) =>
            http.post(managementUrl('/feedbacks'), payload),

        replyFeedback: (id, payload) =>
            http.post(managementUrl(`/feedbacks/${resourceId(id)}/reply`), payload),

        updateFeedbackStatus: (id, payload) =>
            http.patch(managementUrl(`/feedbacks/${resourceId(id)}/status`), payload),

        markFeedbackReplyRead: (id) =>
            http.patch(managementUrl(`/feedbacks/${resourceId(id)}/read`)),

        getProfile: () => http.get(profileUrl('/me')),

        logout: () => http.post(`${apiBase}/api/admin/logout`),

        bindWechat: (tempAuthCode) =>
            http.post(`${apiBase}/api/admin/auth/wechat/bind`, { tempAuthCode }),

        unbindWechat: () =>
            http.post(`${apiBase}/api/admin/auth/wechat/unbind`),

        changePassword: (payload) =>
            http.post(`${apiBase}/api/admin/change-password`, payload),
    };
}
