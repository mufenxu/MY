export const QUESTION_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const BATCH_ISSUE_META = {
    duplicate: { label: '重复题', severity: 'warning', tagType: 'warning' },
    missingAnswer: { label: '无答案', severity: 'error', tagType: 'danger' },
    missingAnalysis: { label: '无解析', severity: 'warning', tagType: 'info' },
    optionFormat: { label: '选项异常', severity: 'error', tagType: 'danger' },
};

export const createEmptyBatchQualityStats = () => ({
    existingTotal: 0,
    importTotal: 0,
    afterImportTotal: 0,
    cleanCount: 0,
    typeCounts: {
        single: 0,
        multiple: 0,
        judge: 0,
        fill: 0,
    },
    issueCounts: {
        duplicate: 0,
        missingAnswer: 0,
        missingAnalysis: 0,
        optionFormat: 0,
    },
});

export const getQuestionTypeName = (type) => {
    const map = {
        single: '单选',
        multiple: '多选',
        judge: '判断',
        fill: '填空',
    };
    return map[type] || type;
};

export const getQuestionTypeTag = (type) => {
    const map = {
        single: '',
        multiple: 'warning',
        judge: 'success',
        fill: 'info',
    };
    return map[type] || 'info';
};

export const isPersistedQuestion = (question) => {
    const id = String(question?._id || '');
    return Boolean(id && !id.startsWith('temp_'));
};

export const formatDateTime = (value) => {
    if (!value) {
        return '未知时间';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '未知时间';
    }

    return date.toLocaleString('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const getBatchIssueMeta = (issueOrType) => {
    const type = typeof issueOrType === 'string' ? issueOrType : issueOrType?.type;
    return BATCH_ISSUE_META[type] || { label: type || '问题', severity: 'warning', tagType: 'info' };
};

export const getBatchIssueLabel = (type) => getBatchIssueMeta(type).label;

export const getBatchIssueTagType = (issueOrType) => getBatchIssueMeta(issueOrType).tagType;

export const formatBatchSourceRange = (target) => {
    const start = Number(target?.sourceStartLine) || 0;
    const end = Number(target?.sourceEndLine) || start;
    if (!start) return '';
    if (end && end !== start) {
        return `原文第 ${start}-${end} 行`;
    }
    return `原文第 ${start} 行`;
};

export const normalizeQuestionContentForQuality = (content) => String(content || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。；;,.!！?？:：、（）()【】\[\]“”"‘’']/g, '');

export const getSelectedAnswerLabels = (question) => {
    if (question.type === 'fill') {
        return String(question.fillAnswer || '').trim() ? ['填空答案'] : [];
    }

    return (question.options || [])
        .filter((opt) => opt.isAnswer)
        .map((opt) => String(opt.label || '').trim())
        .filter(Boolean);
};

export const collectOptionFormatIssues = (question) => {
    if (question.type === 'fill') {
        return [];
    }

    const options = Array.isArray(question.options) ? question.options : [];
    const details = [];

    if (options.length === 0) {
        return ['缺少选项'];
    }

    if ((question.type === 'single' || question.type === 'multiple') && options.length < 2) {
        details.push('单选/多选至少需要 2 个选项');
    }

    if (question.type === 'judge' && options.length !== 2) {
        details.push('判断题应保留 A/B 两个选项');
    }

    const labels = options.map((opt) => String(opt.label || '').trim().toUpperCase());
    const invalidLabels = labels.filter((label) => !QUESTION_OPTION_LABELS.includes(label));
    if (invalidLabels.length > 0) {
        details.push(`存在非法选项标号：${[...new Set(invalidLabels)].join('、')}`);
    }

    const duplicateLabels = labels.filter((label, index) => labels.indexOf(label) !== index);
    if (duplicateLabels.length > 0) {
        details.push(`存在重复选项标号：${[...new Set(duplicateLabels)].join('、')}`);
    }

    const emptyOptionLabels = options
        .filter((opt) => !String(opt.value || '').trim())
        .map((opt) => String(opt.label || '?').trim().toUpperCase());
    if (emptyOptionLabels.length > 0) {
        details.push(`选项内容为空：${emptyOptionLabels.join('、')}`);
    }

    const expectedLabels = QUESTION_OPTION_LABELS.slice(0, labels.length);
    if (labels.length <= QUESTION_OPTION_LABELS.length && labels.some((label, index) => label !== expectedLabels[index])) {
        details.push(`选项标号应从 A 连续排列，当前为 ${labels.join('、') || '空'}`);
    }

    if (options.length > QUESTION_OPTION_LABELS.length) {
        details.push('最多支持 A-H 共 8 个选项');
    }

    return [...new Set(details)];
};

function addBatchIssue(issues, stats, question, questionIndex, type, detail) {
    const meta = getBatchIssueMeta(type);
    issues.push({
        id: `${questionIndex}-${type}-${issues.length}`,
        questionIndex,
        questionNumber: questionIndex + 1,
        type,
        severity: meta.severity,
        detail,
        sourceStartLine: question.sourceStartLine || null,
        sourceEndLine: question.sourceEndLine || question.sourceStartLine || null,
    });
    stats.issueCounts[type] += 1;
}

export function analyzeBatchPreviewQuality(previewQuestions, existingQuestions = []) {
    const stats = createEmptyBatchQualityStats();
    const issues = [];
    const existingContentMap = new Map();
    const importContentMap = new Map();

    stats.existingTotal = existingQuestions.length;
    stats.importTotal = previewQuestions.length;
    stats.afterImportTotal = existingQuestions.length + previewQuestions.length;

    existingQuestions.forEach((question, index) => {
        const key = normalizeQuestionContentForQuality(question.content);
        if (key && !existingContentMap.has(key)) {
            existingContentMap.set(key, index + 1);
        }
    });

    previewQuestions.forEach((question, index) => {
        if (Object.prototype.hasOwnProperty.call(stats.typeCounts, question.type)) {
            stats.typeCounts[question.type] += 1;
        }

        const key = normalizeQuestionContentForQuality(question.content);
        if (!key) return;
        if (!importContentMap.has(key)) {
            importContentMap.set(key, []);
        }
        importContentMap.get(key).push(index);
    });

    previewQuestions.forEach((question, index) => {
        const key = normalizeQuestionContentForQuality(question.content);
        if (key) {
            const existingQuestionNumber = existingContentMap.get(key);
            if (existingQuestionNumber) {
                addBatchIssue(issues, stats, question, index, 'duplicate', `与当前题库第 ${existingQuestionNumber} 题题干相同`);
            }

            const duplicateImportIndexes = (importContentMap.get(key) || []).filter((itemIndex) => itemIndex !== index);
            if (duplicateImportIndexes.length > 0) {
                const visibleIndexes = duplicateImportIndexes.slice(0, 4).map((itemIndex) => itemIndex + 1).join('、');
                const overflowText = duplicateImportIndexes.length > 4 ? `等 ${duplicateImportIndexes.length} 道` : '';
                addBatchIssue(issues, stats, question, index, 'duplicate', `与本次导入第 ${visibleIndexes} 题${overflowText}重复`);
            }
        }

        if (getSelectedAnswerLabels(question).length === 0) {
            addBatchIssue(
                issues,
                stats,
                question,
                index,
                'missingAnswer',
                question.type === 'fill' ? '填空答案为空' : '答案为空或未能匹配到选项',
            );
        }

        if (!String(question.analysis || '').trim()) {
            addBatchIssue(issues, stats, question, index, 'missingAnalysis', '解析为空');
        }

        collectOptionFormatIssues(question).forEach((detail) => {
            addBatchIssue(issues, stats, question, index, 'optionFormat', detail);
        });
    });

    const issueQuestionIndexes = new Set(issues.map((issue) => issue.questionIndex));
    stats.cleanCount = Math.max(previewQuestions.length - issueQuestionIndexes.size, 0);
    return { issues, stats };
}

export const getBatchPreviewSeverity = (issues = []) => {
    if (issues.some((issue) => issue.severity === 'error')) return 'error';
    if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
    return '';
};

export const getFirstSelectedPreviewOptionLabel = (question) => (
    (question.options || []).find((opt) => opt.isAnswer)?.label || ''
);

export const normalizePreviewOptionLabels = (question) => {
    question.options = (question.options || []).map((opt, index) => ({
        label: QUESTION_OPTION_LABELS[index] || opt.label,
        value: opt.value || '',
        isAnswer: Boolean(opt.isAnswer),
    }));
};

export const createDefaultOptions = (type) => {
    if (type === 'judge') {
        return [
            { label: 'A', value: '正确', isAnswer: false },
            { label: 'B', value: '错误', isAnswer: false },
        ];
    }

    if (type === 'fill') {
        return [];
    }

    return QUESTION_OPTION_LABELS.slice(0, 4).map((label) => ({
        label,
        value: '',
        isAnswer: false,
    }));
};

export const createEmptyQuestion = (type) => ({
    _id: `temp_${Date.now()}`,
    type,
    content: '',
    analysis: '',
    options: createDefaultOptions(type),
    fillAnswer: '',
});

export const applyAnswerSelectionChange = (question, changedOption) => {
    if (!question || !changedOption) {
        return;
    }

    if ((question.type === 'single' || question.type === 'judge') && changedOption.isAnswer) {
        (question.options || []).forEach((opt) => {
            if (opt !== changedOption) {
                opt.isAnswer = false;
            }
        });
    }
};

export const applyQuestionTypeChange = (question, newType) => {
    if (!question) {
        return;
    }

    if (newType === 'judge') {
        question.options = createDefaultOptions('judge');
        question.fillAnswer = '';
    } else if (newType === 'fill') {
        question.options = [];
        question.fillAnswer = question.fillAnswer || '';
    } else {
        const shouldResetOptions = (
            !Array.isArray(question.options)
            || question.options.length === 0
            || question.type === 'judge'
            || question.type === 'fill'
        );

        if (shouldResetOptions) {
            question.options = createDefaultOptions(newType);
        }

        if (newType === 'single') {
            let found = false;
            (question.options || []).forEach((opt) => {
                if (opt.isAnswer) {
                    if (found) {
                        opt.isAnswer = false;
                    }
                    found = true;
                }
            });
        }
    }

    question.type = newType;
};

export const addQuestionOption = (question) => {
    if (!question || question.type === 'judge' || question.type === 'fill') {
        return false;
    }

    if (!Array.isArray(question.options)) {
        question.options = [];
    }

    if (question.options.length >= QUESTION_OPTION_LABELS.length) {
        return false;
    }

    question.options.push({
        label: QUESTION_OPTION_LABELS[question.options.length],
        value: '',
        isAnswer: false,
    });
    return true;
};

export const removeQuestionOption = (question, optionIndex) => {
    if (!question || !Array.isArray(question.options)) {
        return false;
    }

    question.options.splice(optionIndex, 1);
    normalizePreviewOptionLabels(question);
    return true;
};

export const createQuestionSavePayload = (question) => ({
    ...(isPersistedQuestion(question) ? {
        _id: question._id,
        revision: Number(question.revision) || 1,
    } : {}),
    type: question.type,
    content: String(question.content || '').trim(),
    options: question.type === 'fill'
        ? []
        : (question.options || []).map((opt) => ({
            label: opt.label,
            value: String(opt.value || '').trim(),
        })),
    answer: question.type === 'fill'
        ? [String(question.fillAnswer || '').trim()]
        : (question.options || []).filter((opt) => opt.isAnswer).map((opt) => opt.label),
    analysis: String(question.analysis || '').trim(),
});

export const createEditableQuestionFromApi = (question = {}) => ({
    _id: question._id,
    ...(isPersistedQuestion(question) ? { revision: Number(question.revision) || 1 } : {}),
    type: question.type,
    content: question.content,
    options: (question.options || []).map((opt) => ({
        label: opt.label,
        value: opt.value,
        isAnswer: (question.answer || []).includes(opt.label),
    })),
    analysis: question.analysis || '',
    analysisSource: question.analysisSource || 'manual',
    fillAnswer: question.type === 'fill' ? (question.answer?.[0] || '') : '',
});

export const createQuestionRevisionBaseline = (questions = []) => questions
    .filter(isPersistedQuestion)
    .map((question) => ({
        _id: question._id,
        revision: Number(question.revision) || 1,
    }));

export const validateQuestion = (question) => {
    if (!String(question.content || '').trim()) {
        return false;
    }

    if (question.type === 'fill') {
        return !!String(question.fillAnswer || '').trim();
    }

    const options = Array.isArray(question.options) ? question.options : [];
    const hasInvalidOption = options.some((opt) => !String(opt.value || '').trim());
    if (hasInvalidOption) {
        return false;
    }

    return options.some((opt) => opt.isAnswer);
};

export const createQuestionTypeCounts = () => ({
    single: 0,
    multiple: 0,
    judge: 0,
    fill: 0,
});

export const countQuestionTypes = (questions = []) => questions.reduce((counts, question) => {
    const type = question?.type || 'single';
    if (Object.prototype.hasOwnProperty.call(counts, type)) {
        counts[type] += 1;
    }
    return counts;
}, createQuestionTypeCounts());

export const getInvalidQuestionIndexes = (questions = []) => questions
    .map((question, index) => (validateQuestion(question) ? -1 : index))
    .filter((index) => index >= 0);

export const countInvalidQuestions = (questions = []) => getInvalidQuestionIndexes(questions).length;

export const getCompletedQuestionCount = (questions = [], invalidQuestionCount = countInvalidQuestions(questions)) => (
    Math.max(questions.length - invalidQuestionCount, 0)
);

export const getCompletionPercent = (questions = [], completedQuestionCount = getCompletedQuestionCount(questions)) => (
    questions.length ? Math.round((completedQuestionCount / questions.length) * 100) : 0
);

export const summarizeSelectedAnswer = (question) => {
    if (!question) {
        return '未选择';
    }

    if (question.type === 'fill') {
        return String(question.fillAnswer || '').trim() || '未设置';
    }

    return (question.options || [])
        .filter((opt) => opt.isAnswer)
        .map((opt) => opt.label)
        .join('、') || '未设置';
};

export const cloneBatchQuestionForImport = (question) => ({
    ...question,
    options: (question.options || []).map((opt) => ({ ...opt })),
});
