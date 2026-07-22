import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
    countInvalidQuestions,
    countQuestionTypes,
    createEditableQuestionFromApi,
    createQuestionRevisionBaseline,
    createQuestionSavePayload,
    getCompletedQuestionCount,
    getCompletionPercent,
    getInvalidQuestionIndexes,
    summarizeSelectedAnswer,
    validateQuestion,
} from './questionUtils.js';

function cancelFrame(id) {
    if (!id) return;
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id);
    } else if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(id);
    }
}

function requestFrame(callback) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
    }

    if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
    }

    callback();
    return 0;
}

export function useExamDetailData({
    examApi,
    isResponsiveEditor,
    mobilePropVisible,
    questions,
    resetRenderedQuestionWindow,
    scrollQuestionIntoView,
    selectedIndex,
} = {}) {
    const loading = ref(false);
    const saving = ref(false);
    const isDirty = ref(false);
    const invalidQuestionCount = ref(0);
    let dirtyTrackingReady = false;
    let suppressDirtyTracking = false;
    let invalidCountRafId = 0;
    let baseQuestions = [];

    const examInfo = reactive({
        _id: '',
        name: '',
        duration: 0,
        passingScore: 60,
        readOnly: false,
    });
    const editDialog = reactive({ visible: false });
    const editForm = reactive({
        name: '',
        duration: 0,
        passingScore: 60,
    });

    const currentQuestion = computed(() => questions.value[selectedIndex.value] || null);
    const canEdit = computed(() => !examInfo.readOnly);
    const completedQuestionCount = computed(() => (
        getCompletedQuestionCount(questions.value, invalidQuestionCount.value)
    ));
    const completionPercent = computed(() => (
        getCompletionPercent(questions.value, completedQuestionCount.value)
    ));
    const invalidQuestionIndexes = computed(() => getInvalidQuestionIndexes(questions.value));
    const firstInvalidQuestionIndex = computed(() => invalidQuestionIndexes.value[0] ?? -1);
    const questionTypeCounts = computed(() => countQuestionTypes(questions.value));
    const selectedAnswerSummary = computed(() => summarizeSelectedAnswer(currentQuestion.value));
    const currentQuestionValid = computed(() => (
        currentQuestion.value ? validateQuestion(currentQuestion.value) : false
    ));

    const showMobileProperties = () => {
        if (typeof isResponsiveEditor === 'function' && isResponsiveEditor()) {
            mobilePropVisible.value = true;
        }
    };

    const resetSelectionAfterLoad = () => {
        if (questions.value.length === 0) {
            selectedIndex.value = -1;
            mobilePropVisible.value = false;
            return;
        }

        if (selectedIndex.value < 0 || selectedIndex.value >= questions.value.length) {
            selectedIndex.value = 0;
        }
    };

    const recalculateInvalidQuestionCount = () => {
        invalidQuestionCount.value = countInvalidQuestions(questions.value);
    };

    const scheduleQuestionSummaryRefresh = () => {
        if (invalidCountRafId) return;
        invalidCountRafId = requestFrame(() => {
            invalidCountRafId = 0;
            recalculateInvalidQuestionCount();
        });
    };

    const markQuestionChanged = () => {
        scheduleQuestionSummaryRefresh();
        if (dirtyTrackingReady && !suppressDirtyTracking && canEdit.value) {
            isDirty.value = true;
        }
    };

    const loadExamInfo = async () => {
        try {
            const res = await examApi.loadExamInfo();
            if (res.data.code === 0) {
                Object.assign(examInfo, res.data.data);
            }
        } catch (err) {
            console.error('Load exam info error:', err);
            ElMessage.error('加载题库信息失败');
        }
    };

    const loadQuestions = async () => {
        loading.value = true;
        try {
            const res = await examApi.listQuestions();

            suppressDirtyTracking = true;
            questions.value = (res.data.data.list || []).map(createEditableQuestionFromApi);
            baseQuestions = createQuestionRevisionBaseline(questions.value);
            resetRenderedQuestionWindow?.();
            resetSelectionAfterLoad();
            recalculateInvalidQuestionCount();
            isDirty.value = false;
            dirtyTrackingReady = true;
        } catch (err) {
            console.error('Load questions error:', err);
            ElMessage.error('加载题目失败');
        } finally {
            suppressDirtyTracking = false;
            loading.value = false;
        }
    };

    const openEditDialog = () => {
        if (!canEdit.value) {
            ElMessage.warning('管理员分配的试卷只能查看，不能编辑');
            return;
        }

        Object.assign(editForm, {
            name: examInfo.name,
            duration: examInfo.duration || 0,
            passingScore: examInfo.passingScore || 60,
        });
        editDialog.visible = true;
    };

    const updateExamInfo = async () => {
        if (!canEdit.value) {
            ElMessage.warning('管理员分配的试卷只能查看，不能编辑');
            return;
        }

        try {
            const res = await examApi.updateExamInfo({ ...editForm });

            if (res.data.code === 0) {
                Object.assign(examInfo, res.data.data);
                editDialog.visible = false;
                ElMessage.success('更新成功');
            }
        } catch (err) {
            console.error('Update exam info error:', err);
            ElMessage.error('更新失败');
        }
    };

    const saveExam = async () => {
        if (!canEdit.value) {
            ElMessage.warning('管理员分配的试卷只能查看，不能保存修改');
            return;
        }

        const invalidQuestion = questions.value.find((q) => !validateQuestion(q));
        if (invalidQuestion) {
            selectedIndex.value = questions.value.indexOf(invalidQuestion);
            scrollQuestionIntoView?.(selectedIndex.value);
            showMobileProperties();
            ElMessage.warning('请先补全题目内容、选项和答案后再保存');
            return;
        }

        saving.value = true;
        try {
            const payload = questions.value.map(createQuestionSavePayload);

            await examApi.saveQuestions(payload, baseQuestions);

            ElMessage.success('保存成功');
            isDirty.value = false;
            await Promise.all([loadExamInfo(), loadQuestions()]);
        } catch (err) {
            console.error('Save exam error:', err);
            const isRevisionConflict = err.response?.status === 409
                || err.response?.data?.code === 'QUESTION_REVISION_CONFLICT';
            ElMessage.error(isRevisionConflict
                ? '题目已被其他管理员更新，请重新加载后再编辑'
                : '保存失败');
        } finally {
            saving.value = false;
        }
    };

    const cleanupExamDetailData = () => {
        cancelFrame(invalidCountRafId);
        invalidCountRafId = 0;
        baseQuestions = [];
    };

    return {
        canEdit,
        completedQuestionCount,
        completionPercent,
        currentQuestion,
        currentQuestionValid,
        editDialog,
        editForm,
        examInfo,
        firstInvalidQuestionIndex,
        invalidQuestionCount,
        invalidQuestionIndexes,
        isDirty,
        loading,
        questionTypeCounts,
        saving,
        selectedAnswerSummary,
        cleanupExamDetailData,
        loadExamInfo,
        loadQuestions,
        markQuestionChanged,
        openEditDialog,
        recalculateInvalidQuestionCount,
        resetSelectionAfterLoad,
        saveExam,
        updateExamInfo,
    };
}
