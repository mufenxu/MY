import { computed, nextTick, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { isPersistedQuestion } from './questionUtils.js';

function isRefLike(value) {
    return value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value');
}

function refValue(value) {
    return isRefLike(value) ? value.value : value;
}

function waitForNextFrame() {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            resolve();
            return;
        }

        window.requestAnimationFrame(() => resolve());
    });
}

export function useAiAnalysis({
    canEdit,
    canBatchGenerateAi,
    currentQuestion,
    examApi,
    isDirty,
    questions,
    selectedIndex,
} = {}) {
    const questionList = () => refValue(questions) || [];
    const selectedQuestion = () => refValue(currentQuestion);
    const selectedQuestionIndex = () => Number(refValue(selectedIndex) ?? -1);

    const aiBatchQuestionOptions = computed(() => questionList()
        .map((question, index) => ({
            id: String(question?._id || ''),
            index,
            type: question?.type || '',
            content: String(question?.content || '').trim(),
        }))
        .filter((item) => item.id && !item.id.startsWith('temp_')));

    const aiBatchDialog = reactive({
        visible: false,
        loading: false,
        summary: null,
    });
    const aiBatchForm = reactive({
        mode: 'all',
        limit: 10,
        forceRefresh: false,
        questionIds: [],
    });
    const aiBatchGeneratingText = computed(() => {
        const count = aiBatchForm.mode === 'selected'
            ? aiBatchForm.questionIds.length
            : aiBatchForm.limit;
        const actionText = aiBatchForm.forceRefresh ? '重新生成并覆盖' : '生成缺失解析';
        return `本次最多${actionText} ${count} 道题，完成后会自动显示统计结果。`;
    });
    const aiAnalysisDialog = reactive({
        visible: false,
        loading: false,
        record: null,
        questionId: '',
        questionIndex: -1,
        requestKey: 0,
    });

    const getAiAnalysisTargetQuestion = () => {
        const questionId = String(aiAnalysisDialog.questionId || '');
        if (!questionId) {
            return selectedQuestion();
        }

        return questionList().find((question) => String(question?._id || '') === questionId) || selectedQuestion();
    };

    const openAiAnalysisDialog = async () => {
        if (!refValue(canEdit)) {
            ElMessage.warning('管理员分配的试卷只能查看，不能管理 AI 解析');
            return;
        }

        const question = selectedQuestion();
        if (!isPersistedQuestion(question)) {
            ElMessage.warning('请先保存题目后再查看 AI 解析');
            return;
        }

        aiAnalysisDialog.questionId = String(question._id);
        aiAnalysisDialog.questionIndex = selectedQuestionIndex();
        const requestKey = aiAnalysisDialog.requestKey + 1;
        aiAnalysisDialog.requestKey = requestKey;
        aiAnalysisDialog.visible = true;
        aiAnalysisDialog.loading = true;
        aiAnalysisDialog.record = null;

        try {
            await nextTick();
            await waitForNextFrame();
            const res = await examApi.getAiAnalysis(question._id);
            if (
                aiAnalysisDialog.requestKey === requestKey
                && aiAnalysisDialog.questionId === String(question._id)
                && res.data.code === 0
            ) {
                aiAnalysisDialog.record = res.data.data || null;
            }
        } catch (err) {
            console.error('Load AI analysis failed:', err);
            ElMessage.error(err.response?.data?.message || '加载 AI 解析失败');
        } finally {
            if (aiAnalysisDialog.requestKey === requestKey) {
                aiAnalysisDialog.loading = false;
            }
        }
    };

    const adoptAiAnalysis = async () => {
        const question = getAiAnalysisTargetQuestion();
        const record = aiAnalysisDialog.record;
        if (!isPersistedQuestion(question) || !record?._id) {
            return;
        }

        try {
            const res = await examApi.adoptAiAnalysis(question._id);
            if (res.data.code === 0) {
                question.analysis = res.data.data?.analysis || record.analysis || '';
                question.analysisSource = res.data.data?.analysisSource || 'ai';
                ElMessage.success('已采纳为正式解析');
            }
        } catch (err) {
            console.error('Adopt AI analysis failed:', err);
            ElMessage.error(err.response?.data?.message || '采纳失败');
        }
    };

    const deleteAiAnalysis = async () => {
        const question = getAiAnalysisTargetQuestion();
        const record = aiAnalysisDialog.record;
        if (!isPersistedQuestion(question) || !record?._id) {
            return;
        }

        try {
            await ElMessageBox.confirm('确定删除这条 AI 解析吗？删除后普通用户将无法再查看这条 AI 解析。', '删除 AI 解析', {
                confirmButtonText: '删除',
                cancelButtonText: '取消',
                type: 'warning',
            });

            const res = await examApi.deleteAiAnalysis(question._id);
            if (res.data.code === 0) {
                aiAnalysisDialog.record = null;
                ElMessage.success('已删除 AI 解析');
            }
        } catch (err) {
            if (err !== 'cancel') {
                console.error('Delete AI analysis failed:', err);
                ElMessage.error(err.response?.data?.message || '删除失败');
            }
        }
    };

    const openAiBatchDialog = () => {
        if (!refValue(canBatchGenerateAi)) {
            ElMessage.warning('当前账号无权限批量生成 AI 解析');
            return;
        }

        if (refValue(isDirty) && refValue(canEdit)) {
            ElMessage.warning('请先保存试卷修改后再批量生成 AI 解析');
            return;
        }

        if (questionList().length === 0) {
            ElMessage.warning('当前试卷暂无题目');
            return;
        }

        aiBatchDialog.visible = true;
        aiBatchDialog.summary = null;
        aiBatchForm.questionIds = aiBatchForm.questionIds.filter((id) => (
            aiBatchQuestionOptions.value.some((item) => item.id === id)
        ));
    };

    const handleAiBatchDialogClose = (done) => {
        if (aiBatchDialog.loading) {
            ElMessage.warning('AI解析正在生成中，请等待完成后再关闭');
            return;
        }
        done();
    };

    const selectCurrentAiBatchQuestion = () => {
        const question = selectedQuestion();
        if (!isPersistedQuestion(question)) {
            ElMessage.warning('当前题目尚未保存，不能批量生成 AI 解析');
            return;
        }

        const id = String(question._id);
        if (!aiBatchForm.questionIds.includes(id)) {
            if (aiBatchForm.questionIds.length >= 10) {
                ElMessage.warning('一次最多选择 10 道题');
                return;
            }
            aiBatchForm.questionIds.push(id);
        }
    };

    const generateAiBatch = async () => {
        if (!refValue(canBatchGenerateAi)) {
            ElMessage.warning('当前账号无权限批量生成 AI 解析');
            return;
        }

        if (aiBatchForm.mode === 'selected' && aiBatchForm.questionIds.length === 0) {
            ElMessage.warning('请先选择要生成 AI 解析的题目');
            return;
        }

        aiBatchDialog.loading = true;
        try {
            const payload = {
                limit: aiBatchForm.limit,
                forceRefresh: aiBatchForm.forceRefresh,
            };
            if (aiBatchForm.mode === 'selected') {
                payload.questionIds = aiBatchForm.questionIds.slice(0, 10);
                payload.limit = payload.questionIds.length;
            }

            const res = await examApi.generateAiAnalyses(payload);
            if (res.data.code === 0) {
                aiBatchDialog.summary = res.data.data || null;
                const summary = res.data.data || {};
                ElMessage.success(`AI解析生成完成：生成/覆盖 ${summary.generated || 0} 条，失败 ${summary.failed || 0} 条`);
            }
        } catch (err) {
            console.error('Generate AI analyses failed:', err);
            ElMessage.error(err.response?.data?.message || '批量生成失败');
        } finally {
            aiBatchDialog.loading = false;
        }
    };

    return {
        aiAnalysisDialog,
        aiBatchDialog,
        aiBatchForm,
        aiBatchGeneratingText,
        aiBatchQuestionOptions,
        adoptAiAnalysis,
        deleteAiAnalysis,
        generateAiBatch,
        handleAiBatchDialogClose,
        openAiAnalysisDialog,
        openAiBatchDialog,
        selectCurrentAiBatchQuestion,
    };
}
