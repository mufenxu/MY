import { computed, nextTick, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { parseQuestions, formatForExamDetail, readQuestionsFromSpreadsheetFile } from '../../utils/batchImport.js';
import {
    QUESTION_OPTION_LABELS as BATCH_OPTION_LABELS,
    analyzeBatchPreviewQuality as analyzeBatchPreviewQualityData,
    createEmptyBatchQualityStats,
    getBatchPreviewSeverity as resolveBatchPreviewSeverity,
    getFirstSelectedPreviewOptionLabel,
    normalizePreviewOptionLabels,
} from './questionUtils.js';

const BATCH_FORMAT_GUIDE = [
    '请把原始题库文本整理成以下可导入格式（逐题输出，不要解释）：',
    '',
    '1. [题型] 题目内容',
    '题干: [可选，与上一行二选一]',
    '选项:',
    'A. ...',
    'B. ...',
    'C. ...',
    'D. ...',
    '答案: [单选填 A；多选填 ABD；判断填 正确/错误；填空填文本答案]',
    '解析: [可选]',
    '',
    '可用题头示例：',
    '1. 题目内容 / 1) 题目内容 / 第1题 题目内容 / (1) 题目内容 / 直接题干内容',
    '无题号时，请让题干下一行紧跟选项或答案，系统会自动分题。',
    '',
    '可用答案示例：',
    '答案: A',
    '答案: ABCD',
    '正确答案: A',
    '参考答案: A',
    '答案是: A',
    '答案: ACD（少选不得分）',
    '',
    '要求：',
    '1) 保留题号顺序。',
    '2) 删除“（少选不得分）/（多选）/分值”等答案备注。',
    '3) 不确定题型时，按“题干 + 选项 + 答案”完整输出。',
    '',
    'Excel/CSV 首行建议：题干、题型、A、B、C、D、答案、解析。',
].join('\n');

function clearWindowTimer(timerId) {
    if (!timerId) return;
    if (typeof window !== 'undefined') window.clearTimeout(timerId);
    else clearTimeout(timerId);
}

function setWindowTimer(callback, delay) {
    if (typeof window !== 'undefined') return window.setTimeout(callback, delay);
    return setTimeout(callback, delay);
}

function isRefLike(value) {
    return value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value');
}

export function useBatchImport({ canEdit, existingQuestions } = {}) {
    const canEditValue = () => (isRefLike(canEdit) ? Boolean(canEdit.value) : Boolean(canEdit));
    const existingQuestionList = () => (
        isRefLike(existingQuestions) ? existingQuestions.value || [] : existingQuestions || []
    );

    const batchDialog = reactive({ visible: false });
    const batchForm = reactive({ text: '' });
    const batchFileInputRef = ref(null);
    const batchSpreadsheetImporting = ref(false);
    const batchSpreadsheetFileName = ref('');
    const batchImportOptions = reactive({
        skipDuplicates: true,
        onlyValid: false,
    });
    const batchPreview = ref([]);
    const batchPreviewIssues = ref([]);
    const batchQualityStats = ref(createEmptyBatchQualityStats());
    const batchActivePreviewIndex = ref(-1);
    const batchEditingPreviewIndex = ref(-1);
    const batchFormatExpanded = ref(false);
    const batchFormatGuide = BATCH_FORMAT_GUIDE;
    let batchIssueHighlightTimer = 0;
    let batchAutoParseTimer = 0;

    const batchPreviewIssueMap = computed(() => batchPreviewIssues.value.reduce((map, issue) => {
        const index = issue.questionIndex;
        if (!map[index]) map[index] = [];
        map[index].push(issue);
        return map;
    }, {}));
    const batchBlockingIssueCount = computed(() => (
        batchPreviewIssues.value.filter((issue) => issue.severity === 'error').length
    ));
    const batchWarningIssueCount = computed(() => (
        batchPreviewIssues.value.filter((issue) => issue.severity === 'warning').length
    ));

    function shouldSkipBatchPreviewQuestion(index) {
        const issues = batchPreviewIssueMap.value[index] || [];
        if (batchImportOptions.skipDuplicates && issues.some((issue) => issue.type === 'duplicate')) {
            return true;
        }
        if (batchImportOptions.onlyValid && issues.some((issue) => issue.severity === 'error')) {
            return true;
        }
        return false;
    }

    const batchImportableQuestions = computed(() => (
        batchPreview.value.filter((_, index) => !shouldSkipBatchPreviewQuestion(index))
    ));
    const batchImportableCount = computed(() => batchImportableQuestions.value.length);
    const batchSkippedCount = computed(() => Math.max(batchPreview.value.length - batchImportableCount.value, 0));
    const batchConfirmButtonText = computed(() => {
        if (batchPreview.value.length === 0) {
            return '添加';
        }
        if (batchBlockingIssueCount.value > 0 && !batchImportOptions.onlyValid) {
            return `需先处理 ${batchBlockingIssueCount.value} 项`;
        }
        const skipText = batchSkippedCount.value > 0 ? `，跳过 ${batchSkippedCount.value}` : '';
        return `添加 (${batchImportableCount.value})${skipText}`;
    });
    const batchAutoParseStatus = computed(() => {
        if (!String(batchForm.text || '').trim()) {
            return '粘贴题目后会自动解析';
        }
        if (batchSpreadsheetFileName.value && batchPreview.value.length > 0) {
            return `已从 ${batchSpreadsheetFileName.value} 识别 ${batchPreview.value.length} 道题`;
        }
        if (batchPreview.value.length > 0) {
            return `已自动识别 ${batchPreview.value.length} 道题`;
        }
        return '正在等待自动解析';
    });

    const analyzeBatchPreviewQuality = (previewQuestions) => {
        const { issues, stats } = analyzeBatchPreviewQualityData(previewQuestions, existingQuestionList());
        batchPreviewIssues.value = issues;
        batchQualityStats.value = stats;
    };

    const getBatchPreviewSeverity = (index) => (
        resolveBatchPreviewSeverity(batchPreviewIssueMap.value[index] || [])
    );

    const clearBatchPreviewQuality = () => {
        batchPreview.value = [];
        batchPreviewIssues.value = [];
        batchQualityStats.value = createEmptyBatchQualityStats();
        batchActivePreviewIndex.value = -1;
        batchEditingPreviewIndex.value = -1;
        clearWindowTimer(batchIssueHighlightTimer);
        batchIssueHighlightTimer = 0;
    };

    const clearBatchAutoParseTimer = () => {
        clearWindowTimer(batchAutoParseTimer);
        batchAutoParseTimer = 0;
    };

    const runBatchParse = ({ silent = false } = {}) => {
        if (!canEditValue()) {
            return [];
        }

        const text = batchForm.text;
        if (!text.trim()) {
            clearBatchPreviewQuality();
            if (!silent) {
                ElMessage.warning('请输入题目文本');
            }
            return [];
        }

        const rawQuestions = parseQuestions(text);
        const parsedQuestions = formatForExamDetail(rawQuestions);
        batchPreview.value = parsedQuestions;
        analyzeBatchPreviewQuality(parsedQuestions);
        batchActivePreviewIndex.value = -1;
        if (batchEditingPreviewIndex.value >= parsedQuestions.length) {
            batchEditingPreviewIndex.value = -1;
        }

        if (silent) {
            return parsedQuestions;
        }

        if (parsedQuestions.length === 0) {
            ElMessage.warning('未识别到题目，请检查格式');
        } else if (batchBlockingIssueCount.value > 0) {
            ElMessage.warning(`识别 ${parsedQuestions.length} 道题，发现 ${batchBlockingIssueCount.value} 项必须处理的问题`);
        } else {
            ElMessage.success(`成功识别 ${parsedQuestions.length} 道题目`);
        }

        return parsedQuestions;
    };

    const copyBatchFormatGuide = async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(batchFormatGuide);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = batchFormatGuide;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            ElMessage.success('已复制 AI 整理模板');
        } catch (err) {
            console.error('Copy batch format guide error:', err);
            ElMessage.error('复制失败，请手动复制下方模板');
        }
    };

    const triggerBatchFileImport = () => {
        if (!canEditValue() || batchSpreadsheetImporting.value) return;
        batchFileInputRef.value?.click?.();
    };

    const isSupportedBatchSpreadsheetFile = (file) => (
        /\.(xlsx|csv)$/i.test(file?.name || '')
    );

    const handleBatchFileChange = async (event) => {
        const input = event?.target;
        const file = input?.files?.[0];
        if (input) input.value = '';
        if (!file) return;

        if (!isSupportedBatchSpreadsheetFile(file)) {
            ElMessage.warning('请选择 .xlsx 或 .csv 文件');
            return;
        }

        clearBatchAutoParseTimer();
        batchSpreadsheetImporting.value = true;
        try {
            const text = await readQuestionsFromSpreadsheetFile(file);
            if (!String(text || '').trim()) {
                batchForm.text = '';
                batchSpreadsheetFileName.value = '';
                clearBatchPreviewQuality();
                ElMessage.warning('未从文件中读取到可导入的题目，请检查首个工作表');
                return;
            }

            batchForm.text = text;
            batchSpreadsheetFileName.value = file.name;
            const parsedQuestions = runBatchParse({ silent: true });
            if (parsedQuestions.length === 0) {
                ElMessage.warning('文件已读取，但未识别到题目，请检查表头或内容');
                return;
            }
            ElMessage.success(`已从 ${file.name} 识别 ${parsedQuestions.length} 道题目`);
        } catch (err) {
            console.error('Batch spreadsheet import error:', err);
            ElMessage.error('读取 Excel/CSV 失败，请检查文件格式');
        } finally {
            batchSpreadsheetImporting.value = false;
        }
    };

    const handleBatchTextInput = () => {
        clearBatchAutoParseTimer();
        batchSpreadsheetFileName.value = '';
        if (!String(batchForm.text || '').trim()) {
            clearBatchPreviewQuality();
            return;
        }
        batchAutoParseTimer = setWindowTimer(() => {
            batchAutoParseTimer = 0;
            runBatchParse({ silent: true });
        }, 500);
    };

    const handleBatchPreviewChanged = () => {
        if (batchPreview.value.length > 0) {
            analyzeBatchPreviewQuality(batchPreview.value);
        }
    };

    const toggleBatchPreviewEditor = (index) => {
        batchEditingPreviewIndex.value = batchEditingPreviewIndex.value === index ? -1 : index;
    };

    const handleBatchPreviewTypeChange = (question, newType) => {
        if (!question) return;

        const selectedLabel = getFirstSelectedPreviewOptionLabel(question);

        if (newType === 'judge') {
            question.options = [
                { label: 'A', value: '正确', isAnswer: selectedLabel === 'A' },
                { label: 'B', value: '错误', isAnswer: selectedLabel === 'B' },
            ];
            question.fillAnswer = '';
        } else if (newType === 'fill') {
            question.fillAnswer = question.fillAnswer || selectedLabel || '';
            question.options = [];
        } else {
            if (!Array.isArray(question.options) || question.options.length === 0) {
                question.options = BATCH_OPTION_LABELS.slice(0, 4).map((label) => ({
                    label,
                    value: '',
                    isAnswer: false,
                }));
            } else {
                normalizePreviewOptionLabels(question);
            }
            question.fillAnswer = '';
            if (newType === 'single') {
                let found = false;
                question.options.forEach((opt) => {
                    if (opt.isAnswer) {
                        if (found) {
                            opt.isAnswer = false;
                        }
                        found = true;
                    }
                });
            }
        }

        handleBatchPreviewChanged();
    };

    const handleBatchPreviewAnswerChange = (question, changedOpt) => {
        if (!question || !changedOpt) return;
        if ((question.type === 'single' || question.type === 'judge') && changedOpt.isAnswer) {
            question.options.forEach((opt) => {
                if (opt !== changedOpt) {
                    opt.isAnswer = false;
                }
            });
        }
        handleBatchPreviewChanged();
    };

    const addBatchPreviewOption = (question) => {
        if (!question || question.type === 'judge' || question.type === 'fill') return;
        if (question.options.length >= BATCH_OPTION_LABELS.length) {
            ElMessage.warning('最多支持 8 个选项');
            return;
        }

        question.options.push({
            label: BATCH_OPTION_LABELS[question.options.length],
            value: '',
            isAnswer: false,
        });
        handleBatchPreviewChanged();
    };

    const removeBatchPreviewOption = (question, optionIndex) => {
        if (!question || question.type === 'judge' || question.type === 'fill') return;
        if (question.options.length <= 2) {
            ElMessage.warning('至少保留 2 个选项');
            return;
        }

        question.options.splice(optionIndex, 1);
        normalizePreviewOptionLabels(question);
        handleBatchPreviewChanged();
    };

    const locateBatchIssue = (issue) => {
        batchActivePreviewIndex.value = issue.questionIndex;
        batchEditingPreviewIndex.value = issue.questionIndex;
        nextTick(() => {
            const node = document.querySelector(`[data-batch-preview-index="${issue.questionIndex}"]`);
            node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        });

        clearWindowTimer(batchIssueHighlightTimer);
        batchIssueHighlightTimer = setWindowTimer(() => {
            if (batchActivePreviewIndex.value === issue.questionIndex) {
                batchActivePreviewIndex.value = -1;
            }
            batchIssueHighlightTimer = 0;
        }, 2200);
    };

    const openBatchImportDialog = () => {
        clearBatchAutoParseTimer();
        batchForm.text = '';
        batchSpreadsheetFileName.value = '';
        batchImportOptions.skipDuplicates = true;
        batchImportOptions.onlyValid = false;
        clearBatchPreviewQuality();
        batchFormatExpanded.value = false;
        batchDialog.visible = true;
    };

    const cleanupBatchImport = () => {
        clearBatchAutoParseTimer();
        clearWindowTimer(batchIssueHighlightTimer);
        batchIssueHighlightTimer = 0;
    };

    return {
        BATCH_OPTION_LABELS,
        batchActivePreviewIndex,
        batchAutoParseStatus,
        batchBlockingIssueCount,
        batchConfirmButtonText,
        batchDialog,
        batchEditingPreviewIndex,
        batchFileInputRef,
        batchFormatExpanded,
        batchFormatGuide,
        batchForm,
        batchImportOptions,
        batchImportableCount,
        batchImportableQuestions,
        batchPreview,
        batchPreviewIssueMap,
        batchPreviewIssues,
        batchQualityStats,
        batchSkippedCount,
        batchSpreadsheetFileName,
        batchSpreadsheetImporting,
        batchWarningIssueCount,
        addBatchPreviewOption,
        cleanupBatchImport,
        clearBatchAutoParseTimer,
        copyBatchFormatGuide,
        getBatchPreviewSeverity,
        handleBatchFileChange,
        handleBatchPreviewAnswerChange,
        handleBatchPreviewChanged,
        handleBatchPreviewTypeChange,
        handleBatchTextInput,
        locateBatchIssue,
        openBatchImportDialog,
        removeBatchPreviewOption,
        runBatchParse,
        toggleBatchPreviewEditor,
        triggerBatchFileImport,
    };
}
