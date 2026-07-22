const crypto = require('crypto');
const Question = require('../models/Question');

const QUALITY_ISSUE_CODES = [
    'missing_analysis',
    'missing_answer',
    'insufficient_options',
    'duplicate_option_label',
    'empty_option',
    'answer_not_in_options',
    'single_answer_count',
    'duplicate_content',
    'stale_question',
];

const QUALITY_PROJECTION = '_id categoryId type content options answer analysis updateTime revision';

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('zh-CN');
}

function getContentFingerprint(content) {
    const normalized = normalizeText(content);
    if (!normalized) return '';
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function toIssue(code, severity, message, details) {
    return {
        code,
        severity,
        message,
        ...(details ? { details } : {}),
    };
}

function diagnoseQuestion(question, { duplicateCount = 0, staleBefore = null } = {}) {
    const issues = [];
    const type = String(question?.type || '');
    const options = Array.isArray(question?.options) ? question.options : [];
    const answers = Array.isArray(question?.answer)
        ? question.answer.map((answer) => String(answer).trim()).filter(Boolean)
        : [];
    const analysis = String(question?.analysis || '').trim();
    const isChoice = type === 'single' || type === 'multiple' || type === 'judge';
    const optionLabels = options.map((option) => String(option?.label || '').trim()).filter(Boolean);

    if (!analysis) {
        issues.push(toIssue('missing_analysis', 'warning', '题目缺少解析'));
    }
    if (answers.length === 0) {
        issues.push(toIssue('missing_answer', 'error', '题目缺少答案'));
    }
    if (isChoice && options.length < 2) {
        issues.push(toIssue('insufficient_options', 'error', '选择或判断题至少需要两个选项'));
    }
    if (new Set(optionLabels).size !== optionLabels.length) {
        issues.push(toIssue('duplicate_option_label', 'error', '选项标识存在重复'));
    }
    if (options.some((option) => !String(option?.label || '').trim() || !String(option?.value || '').trim())) {
        issues.push(toIssue('empty_option', 'error', '选项标识或内容为空'));
    }
    if (isChoice) {
        const missingAnswers = answers.filter((answer) => !optionLabels.includes(answer));
        if (missingAnswers.length > 0) {
            issues.push(toIssue(
                'answer_not_in_options',
                'error',
                '答案未对应到有效选项',
                { answers: missingAnswers.slice(0, 10) },
            ));
        }
    }
    if (type === 'single' && answers.length !== 1) {
        issues.push(toIssue('single_answer_count', 'error', '单选题必须且只能有一个答案'));
    }
    if (duplicateCount > 1) {
        issues.push(toIssue(
            'duplicate_content',
            'warning',
            '题干与同一诊断范围内的其他题目重复',
            { count: duplicateCount },
        ));
    }
    if (staleBefore) {
        const updateTime = new Date(question?.updateTime || 0);
        if (!Number.isNaN(updateTime.getTime()) && updateTime < staleBefore) {
            issues.push(toIssue('stale_question', 'info', '题目长期未更新'));
        }
    }

    return issues;
}

function createQuestionCursor(QuestionModel, query, scanLimit) {
    return QuestionModel.find(query)
        .select(QUALITY_PROJECTION)
        .sort({ _id: 1 })
        .limit(scanLimit)
        .lean()
        .cursor();
}

async function scanQuestionQuality({
    query,
    page = 1,
    limit = 20,
    issue = '',
    staleDays = 365,
    scanLimit = 2000,
    now = new Date(),
    QuestionModel = Question,
    cursorFactory,
    totalDocuments,
}) {
    const makeCursor = cursorFactory || (() => createQuestionCursor(QuestionModel, query, scanLimit));
    const fingerprintCounts = new Map();
    let scanned = 0;

    for await (const question of makeCursor()) {
        scanned += 1;
        const fingerprint = getContentFingerprint(question.content);
        if (fingerprint) {
            fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1);
        }
    }

    const documentCount = totalDocuments === undefined
        ? await QuestionModel.countDocuments(query)
        : Number(totalDocuments);
    const staleBefore = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
    const summary = Object.fromEntries(QUALITY_ISSUE_CODES.map((code) => [code, 0]));
    const offset = (page - 1) * limit;
    const list = [];
    let problematic = 0;
    let matching = 0;

    for await (const question of makeCursor()) {
        const fingerprint = getContentFingerprint(question.content);
        const issues = diagnoseQuestion(question, {
            duplicateCount: fingerprint ? fingerprintCounts.get(fingerprint) || 0 : 0,
            staleBefore,
        });

        if (issues.length > 0) problematic += 1;
        issues.forEach((item) => {
            summary[item.code] += 1;
        });

        const matchingIssues = issue ? issues.filter((item) => item.code === issue) : issues;
        if (matchingIssues.length === 0) continue;

        if (matching >= offset && list.length < limit) {
            list.push({
                _id: question._id,
                categoryId: question.categoryId,
                type: question.type,
                content: question.content,
                revision: Number(question.revision) || 1,
                updateTime: question.updateTime,
                issues: matchingIssues,
            });
        }
        matching += 1;
    }

    return {
        list,
        page,
        limit,
        total: matching,
        summary: {
            scanned,
            documents: documentCount,
            problematic,
            healthy: Math.max(scanned - problematic, 0),
            issues: summary,
            truncated: documentCount > scanned,
            scanLimit,
            staleDays,
        },
    };
}

module.exports = {
    QUALITY_ISSUE_CODES,
    diagnoseQuestion,
    getContentFingerprint,
    scanQuestionQuality,
};
