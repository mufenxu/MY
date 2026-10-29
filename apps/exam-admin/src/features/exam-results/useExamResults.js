import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

export function useExamResults({
    adminApi,
    isConsoleMode,
    loading,
    beginViewRequest,
    finishViewRequest,
    quietRequestConfig,
    message = ElMessage,
} = {}) {
    const examResults = reactive({ list: [], total: 0 });
    const examResultsFilter = reactive({ categoryId: '', userId: '' });
    const selectedExamResults = ref([]);
    const examResultsTable = ref(null);

    // 批量删除弹窗
    const deleteDialog = reactive({
        visible: false,
        mathQuestion: '',
        mathAnswer: null,
        userInput: '',
    });

    const handleExamResultSelection = (selection) => {
        selectedExamResults.value = selection;
    };

    const clearExamResultSelection = () => {
        examResultsTable.value?.clearSelection?.();
        selectedExamResults.value = [];
    };

    const generateMathQuestion = () => {
        const a = Math.floor(Math.random() * 20) + 1;
        const b = Math.floor(Math.random() * 20) + 1;
        const operators = ['+', '-', '×'];
        const op = operators[Math.floor(Math.random() * operators.length)];

        let answer;
        switch (op) {
            case '+': answer = a + b; break;
            case '-': answer = a - b; break;
            case '×': answer = a * b; break;
        }

        deleteDialog.mathQuestion = `${a} ${op} ${b} = ?`;
        deleteDialog.mathAnswer = answer;
        deleteDialog.userInput = '';
    };

    const openDeleteDialog = () => {
        if (readFlag(isConsoleMode)) return;
        if (selectedExamResults.value.length === 0) {
            message.warning('请先选择要删除的记录');
            return;
        }
        generateMathQuestion();
        deleteDialog.visible = true;
    };

    const confirmBatchDelete = async () => {
        if (readFlag(isConsoleMode)) return;
        const userAnswer = parseInt(deleteDialog.userInput, 10);
        if (isNaN(userAnswer) || userAnswer !== deleteDialog.mathAnswer) {
            message.error('验证答案错误，请重新输入');
            generateMathQuestion();
            return;
        }

        try {
            loading.value = true;
            const ids = selectedExamResults.value.map((item) => item._id);
            const res = await adminApi.deleteExamResults(ids);

            if (res.data.code === 0) {
                message.success(res.data.message);
                deleteDialog.visible = false;
                selectedExamResults.value = [];
                loadExamResults();
            }
        } catch (err) {
            message.error('删除失败: ' + (err.response?.data?.message || err.message));
        } finally {
            loading.value = false;
        }
    };

    const loadExamResults = async (page = 1) => {
        if (readFlag(isConsoleMode)) return;
        const controller = beginViewRequest('examResults');
        try {
            const res = await adminApi.listExamResults({
                page,
                pageSize: 20,
                categoryId: examResultsFilter.categoryId || undefined,
                userId: examResultsFilter.userId || undefined,
            }, quietRequestConfig(controller));
            if (controller.signal.aborted) return;
            if (res.data.code === 0) {
                examResults.list = res.data.data.list;
                examResults.total = res.data.data.total;
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            message.error('加载考试记录失败');
        } finally {
            finishViewRequest('examResults', controller);
        }
    };

    return {
        examResults,
        examResultsFilter,
        selectedExamResults,
        examResultsTable,
        deleteDialog,
        handleExamResultSelection,
        clearExamResultSelection,
        openDeleteDialog,
        confirmBatchDelete,
        loadExamResults,
    };
}
