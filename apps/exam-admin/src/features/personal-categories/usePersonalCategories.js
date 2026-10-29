import { reactive } from 'vue';
import { ElMessage } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

export function usePersonalCategories({
    adminApi,
    isConsoleMode,
    beginViewRequest,
    finishViewRequest,
    quietRequestConfig,
    message = ElMessage,
} = {}) {
    const personalCategories = reactive({
        list: [],
        total: 0,
        page: 1,
        limit: 20,
    });
    const personalCategoryFilter = reactive({
        keyword: '',
        ownerStudyId: '',
        publishStatus: 'all',
        source: 'all',
    });
    const personalCategoryDialog = reactive({
        visible: false,
        loading: false,
        questionsLoading: false,
        category: null,
        stats: null,
        questions: [],
        questionsTotal: 0,
        questionsPage: 1,
        questionsLimit: 50,
    });

    const buildPersonalCategoryParams = (page = 1) => ({
        page,
        limit: personalCategories.limit,
        keyword: personalCategoryFilter.keyword || undefined,
        ownerStudyId: personalCategoryFilter.ownerStudyId || undefined,
        publishStatus: personalCategoryFilter.publishStatus || 'all',
        source: personalCategoryFilter.source || 'all',
    });

    const loadPersonalCategories = async (page = 1) => {
        if (readFlag(isConsoleMode)) return;
        const controller = beginViewRequest('personalCategories');
        try {
            const res = await adminApi.listPersonalCategories(
                buildPersonalCategoryParams(page),
                quietRequestConfig(controller),
            );
            if (controller.signal.aborted) return;
            if (res.data.code === 0) {
                const data = res.data.data || {};
                personalCategories.list = data.list || [];
                personalCategories.total = data.total || 0;
                personalCategories.page = data.page || page;
                personalCategories.limit = data.limit || personalCategories.limit;
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            message.error(err.response?.data?.message || '加载个人题库失败');
        } finally {
            finishViewRequest('personalCategories', controller);
        }
    };

    const loadPersonalCategoryQuestions = async (page = 1) => {
        const categoryId = personalCategoryDialog.category?._id;
        if (!categoryId) return;
        personalCategoryDialog.questionsLoading = true;
        try {
            const res = await adminApi.listPersonalCategoryQuestions(categoryId, {
                page,
                limit: personalCategoryDialog.questionsLimit,
            });
            if (res.data.code === 0) {
                const data = res.data.data || {};
                personalCategoryDialog.questions = data.list || [];
                personalCategoryDialog.questionsTotal = data.total || 0;
                personalCategoryDialog.questionsPage = data.page || page;
                personalCategoryDialog.questionsLimit = data.limit || personalCategoryDialog.questionsLimit;
                if (data.category) {
                    personalCategoryDialog.category = data.category;
                }
            }
        } catch (err) {
            message.error(err.response?.data?.message || '加载题目失败');
        } finally {
            personalCategoryDialog.questionsLoading = false;
        }
    };

    const openPersonalCategoryDetail = async (row) => {
        if (!row?._id || readFlag(isConsoleMode)) return;

        personalCategoryDialog.visible = true;
        personalCategoryDialog.loading = true;
        personalCategoryDialog.category = row;
        personalCategoryDialog.stats = null;
        personalCategoryDialog.questions = [];
        personalCategoryDialog.questionsTotal = 0;
        personalCategoryDialog.questionsPage = 1;

        try {
            const res = await adminApi.getPersonalCategory(row._id);
            if (res.data.code === 0) {
                const data = res.data.data || {};
                personalCategoryDialog.category = data.category || row;
                personalCategoryDialog.stats = data.stats || null;
            }
            await loadPersonalCategoryQuestions(1);
        } catch (err) {
            message.error(err.response?.data?.message || '加载个人题库详情失败');
            personalCategoryDialog.visible = false;
        } finally {
            personalCategoryDialog.loading = false;
        }
    };

    return {
        personalCategories,
        personalCategoryFilter,
        personalCategoryDialog,
        buildPersonalCategoryParams,
        loadPersonalCategories,
        loadPersonalCategoryQuestions,
        openPersonalCategoryDetail,
    };
}
