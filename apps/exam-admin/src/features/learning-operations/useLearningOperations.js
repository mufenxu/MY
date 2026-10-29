import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

/**
 * 学习运营域：学习计划、班组、计划选项与统计。
 *
 * 该域原本整段嵌在「User Management Logic」里，但状态、computed、函数全部自包含，
 * 与用户 CRUD 没有共享状态，故独立成 composable。
 */
export function useLearningOperations({
    adminApi,
    isConsoleMode,
    beginViewRequest,
    finishViewRequest,
    quietRequestConfig,
    message = ElMessage,
    messageBox = ElMessageBox,
} = {}) {
    const learningPlans = ref([]);
    const cohorts = ref([]);
    const learningOpsTab = ref('plans');
    const learningPlanOptions = reactive({
        categories: [],
        cohorts: [],
        users: [],
    });
    const cohortDialog = reactive({
        visible: false,
        saving: false,
        id: '',
        form: {
            name: '',
            description: '',
            memberOpenids: [],
            status: 'active',
        },
    });
    const learningPlanDialog = reactive({
        visible: false,
        saving: false,
        id: '',
        form: {
            title: '',
            description: '',
            categoryIds: [],
            cohortIds: [],
            directUserOpenids: [],
            dueAt: '',
            targetScore: 60,
            status: 'active',
        },
    });

    const learningOpsStats = computed(() => {
        const activePlans = learningPlans.value.filter((plan) => plan.status === 'active');
        const assignedUsers = new Set(activePlans.flatMap((plan) => plan.userOpenids || [])).size;
        return {
            activePlans: activePlans.length,
            assignedUsers,
            overdueUsers: activePlans.reduce((sum, plan) => sum + (Number(plan.progress?.overdueCount) || 0), 0),
        };
    });

    const formatLearningDeadline = (value) => {
        if (!value) return '长期有效';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '未设置' : date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const learningPlanStateText = (plan) => ({
        archived: '已归档',
        completed: '已完成',
        overdue: '有逾期',
        active: '进行中',
    }[plan.progress?.state || plan.status] || '进行中');

    const learningPlanStateType = (plan) => ({
        archived: 'info',
        completed: 'success',
        overdue: 'danger',
        active: 'primary',
    }[plan.progress?.state || plan.status] || 'primary');

    const learningCategoryLabel = (category) => {
        const majorName = category.majorCategoryId?.name || '';
        return majorName ? `${majorName} / ${category.name}` : category.name;
    };

    const loadLearningOperations = async () => {
        if (readFlag(isConsoleMode)) return;
        const controller = beginViewRequest('learningPlans');
        try {
            const config = quietRequestConfig(controller);
            const [plansRes, cohortsRes, optionsRes] = await Promise.all([
                adminApi.listLearningPlans({ status: 'all' }, config),
                adminApi.listCohorts({ status: 'all' }, config),
                adminApi.getLearningPlanOptions(config),
            ]);
            if (controller.signal.aborted) return;
            learningPlans.value = plansRes.data.code === 0 ? (plansRes.data.data || []) : [];
            cohorts.value = cohortsRes.data.code === 0 ? (cohortsRes.data.data || []) : [];
            if (optionsRes.data.code === 0) {
                Object.assign(learningPlanOptions, {
                    categories: optionsRes.data.data?.categories || [],
                    cohorts: optionsRes.data.data?.cohorts || [],
                    users: optionsRes.data.data?.users || [],
                });
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                message.error(err.response?.data?.message || '学习计划数据加载失败');
            }
        } finally {
            finishViewRequest('learningPlans', controller);
        }
    };

    const openCohortDialog = (cohort = null) => {
        cohortDialog.id = cohort?._id || '';
        cohortDialog.form.name = cohort?.name || '';
        cohortDialog.form.description = cohort?.description || '';
        cohortDialog.form.memberOpenids = [...(cohort?.memberOpenids || [])];
        cohortDialog.form.status = cohort?.status || 'active';
        cohortDialog.visible = true;
    };

    const saveCohort = async () => {
        const name = cohortDialog.form.name.trim();
        if (!name) {
            message.warning('请输入班组名称');
            return;
        }
        cohortDialog.saving = true;
        try {
            const payload = {
                name,
                description: cohortDialog.form.description.trim(),
                memberOpenids: cohortDialog.form.memberOpenids,
                ...(cohortDialog.id ? { status: cohortDialog.form.status } : {}),
            };
            const res = await adminApi.saveCohort(cohortDialog.id, payload);
            if (res.data.code === 0) {
                message.success(res.data.message || '班组已保存');
                cohortDialog.visible = false;
                await loadLearningOperations();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '班组保存失败');
        } finally {
            cohortDialog.saving = false;
        }
    };

    const archiveCohort = async (cohort) => {
        try {
            await messageBox.confirm(`归档班组“${cohort.name}”？关联计划会立即重算覆盖考生。`, '归档班组', {
                type: 'warning',
                confirmButtonText: '归档',
                cancelButtonText: '取消',
            });
            const res = await adminApi.archiveCohort(cohort._id);
            if (res.data.code === 0) {
                message.success('班组已归档');
                await loadLearningOperations();
            }
        } catch (err) {
            if (err !== 'cancel' && err !== 'close') {
                message.error(err.response?.data?.message || '班组归档失败');
            }
        }
    };

    const openLearningPlanDialog = (plan = null) => {
        learningPlanDialog.id = plan?._id || '';
        learningPlanDialog.form.title = plan?.title || '';
        learningPlanDialog.form.description = plan?.description || '';
        learningPlanDialog.form.categoryIds = (plan?.categoryIds || []).map((item) => String(item?._id || item));
        learningPlanDialog.form.cohortIds = (plan?.cohortIds || []).map((item) => String(item?._id || item));
        learningPlanDialog.form.directUserOpenids = [...(plan?.directUserOpenids || [])];
        learningPlanDialog.form.dueAt = plan?.dueAt || '';
        learningPlanDialog.form.targetScore = Number(plan?.targetScore ?? 60);
        learningPlanDialog.form.status = plan?.status || 'active';
        learningPlanDialog.visible = true;
    };

    const saveLearningPlan = async () => {
        const form = learningPlanDialog.form;
        if (!form.title.trim()) {
            message.warning('请输入计划名称');
            return;
        }
        if (form.categoryIds.length === 0) {
            message.warning('请至少选择一份试卷');
            return;
        }
        if (form.cohortIds.length === 0 && form.directUserOpenids.length === 0) {
            message.warning('请至少选择一个班组或一位考生');
            return;
        }
        learningPlanDialog.saving = true;
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim(),
                categoryIds: form.categoryIds,
                cohortIds: form.cohortIds,
                directUserOpenids: form.directUserOpenids,
                dueAt: form.dueAt || null,
                targetScore: form.targetScore,
                ...(learningPlanDialog.id ? { status: form.status } : {}),
            };
            const res = await adminApi.saveLearningPlan(learningPlanDialog.id, payload);
            if (res.data.code === 0) {
                message.success(res.data.message || '学习计划已保存');
                learningPlanDialog.visible = false;
                await loadLearningOperations();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '学习计划保存失败');
        } finally {
            learningPlanDialog.saving = false;
        }
    };

    const archiveLearningPlan = async (plan) => {
        try {
            await messageBox.confirm(`归档学习计划“${plan.title}”？`, '归档学习计划', {
                type: 'warning',
                confirmButtonText: '归档',
                cancelButtonText: '取消',
            });
            const res = await adminApi.archiveLearningPlan(plan._id);
            if (res.data.code === 0) {
                message.success('学习计划已归档');
                await loadLearningOperations();
            }
        } catch (err) {
            if (err !== 'cancel' && err !== 'close') {
                message.error(err.response?.data?.message || '学习计划归档失败');
            }
        }
    };

    return {
        learningPlans,
        cohorts,
        learningOpsTab,
        learningPlanOptions,
        cohortDialog,
        learningPlanDialog,
        learningOpsStats,
        formatLearningDeadline,
        learningPlanStateText,
        learningPlanStateType,
        learningCategoryLabel,
        loadLearningOperations,
        openCohortDialog,
        saveCohort,
        archiveCohort,
        openLearningPlanDialog,
        saveLearningPlan,
        archiveLearningPlan,
    };
}
