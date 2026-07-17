import { unref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
    addQuestionOption,
    applyAnswerSelectionChange,
    applyQuestionTypeChange,
    createEmptyQuestion,
    removeQuestionOption,
} from './questionUtils.js';

function readQuestionList(questions) {
    const value = unref(questions);
    return Array.isArray(value) ? value : [];
}

function writeRef(target, value) {
    if (target && typeof target === 'object' && Object.prototype.hasOwnProperty.call(target, 'value')) {
        target.value = value;
    }
}

function readRef(target) {
    return unref(target);
}

export function useQuestionEditor({
    canEdit,
    currentQuestion,
    ensureQuestionRendered,
    isResponsiveEditor,
    markQuestionChanged,
    mobilePropVisible,
    questions,
    resetSelectionAfterLoad: resetSelectionAfterLoadOverride,
    scrollQuestionIntoView,
    selectedIndex,
} = {}) {
    const showMobileProperties = () => {
        if (typeof isResponsiveEditor === 'function' && isResponsiveEditor()) {
            writeRef(mobilePropVisible, true);
        }
    };

    const resetSelectionAfterDelete = () => {
        const questionList = readQuestionList(questions);
        const currentIndex = Number(readRef(selectedIndex) ?? -1);

        if (questionList.length === 0) {
            writeRef(selectedIndex, -1);
            writeRef(mobilePropVisible, false);
            return;
        }

        if (currentIndex < 0 || currentIndex >= questionList.length) {
            writeRef(selectedIndex, 0);
        }
    };
    const resetSelectionAfterLoad = resetSelectionAfterLoadOverride || resetSelectionAfterDelete;

    const addQuestion = (type) => {
        if (!readRef(canEdit)) {
            ElMessage.warning('管理员分配的试卷只能查看，不能新增题目');
            return;
        }

        const questionList = readQuestionList(questions);
        const newQuestion = createEmptyQuestion(type);

        questionList.push(newQuestion);
        writeRef(selectedIndex, questionList.length - 1);
        markQuestionChanged?.();
        scrollQuestionIntoView?.(readRef(selectedIndex));
        showMobileProperties();
    };

    const selectQuestion = (index) => {
        writeRef(selectedIndex, index);
        ensureQuestionRendered?.(index);
        showMobileProperties();
    };

    const deleteQuestion = (index) => {
        if (!readRef(canEdit)) {
            ElMessage.warning('管理员分配的试卷只能查看，不能删除题目');
            return Promise.resolve();
        }

        return ElMessageBox.confirm('确定删除这道题吗？', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning',
        }).then(() => {
            const questionList = readQuestionList(questions);
            const currentIndex = Number(readRef(selectedIndex) ?? -1);

            questionList.splice(index, 1);
            if (currentIndex === index) {
                writeRef(selectedIndex, -1);
            } else if (currentIndex > index) {
                writeRef(selectedIndex, currentIndex - 1);
            }
            resetSelectionAfterLoad();
            markQuestionChanged?.();
        }).catch(() => {});
    };

    const handleAnswerChange = (changedOption) => {
        if (!readRef(canEdit)) {
            return;
        }

        const question = readRef(currentQuestion);
        if (!question) {
            return;
        }

        applyAnswerSelectionChange(question, changedOption);
        markQuestionChanged?.();
    };

    const handleTypeChange = (newType) => {
        if (!readRef(canEdit)) {
            return;
        }

        const question = readRef(currentQuestion);
        if (!question) {
            return;
        }

        applyQuestionTypeChange(question, newType);
        markQuestionChanged?.();
    };

    const addOption = () => {
        if (!readRef(canEdit)) {
            return;
        }

        const question = readRef(currentQuestion);
        const added = addQuestionOption(question);
        if (!added) {
            if (question && question.type !== 'judge' && question.type !== 'fill') {
                ElMessage.warning('最多支持 8 个选项');
            }
            return;
        }

        markQuestionChanged?.();
    };

    const removeOption = (index) => {
        if (!readRef(canEdit)) {
            return;
        }

        const removed = removeQuestionOption(readRef(currentQuestion), index);
        if (removed) {
            markQuestionChanged?.();
        }
    };

    return {
        addOption,
        addQuestion,
        deleteQuestion,
        handleAnswerChange,
        handleTypeChange,
        removeOption,
        resetSelectionAfterLoad,
        selectQuestion,
    };
}
