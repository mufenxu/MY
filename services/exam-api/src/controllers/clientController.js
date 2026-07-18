/**
 * Client-side API controller
 * Handles API requests from the mini program.
 */
const jwt = require('jsonwebtoken');
const Question = require('../models/Question');
const ExamResult = require('../models/ExamResult');
const ExamProgress = require('../models/ExamProgress');
const User = require('../models/User');
const UserQuestionState = require('../models/UserQuestionState');
const ConsoleAccount = require('../models/ConsoleAccount');
const Category = require('../models/Category');
const MajorCategory = require('../models/MajorCategory');
const PaperShare = require('../models/PaperShare');
const PaperShareReceipt = require('../models/PaperShareReceipt');
const Feedback = require('../models/Feedback');
const config = require('../config');
const { isCorrect, asyncHandler } = require('../utils/exam');
const {
    normalizePinyinKeyword,
    isPinyinInitialKeyword,
    containsPinyinInitials,
    getPinyinInitialMatchRanges,
} = require('../utils/pinyinSearch');
const { success } = require('../utils/response');
const { AppError, NotFoundError } = require('../utils/errors');
const { escapeRegex } = require('../utils/string');
const {
    getVisibleMajorCategories,
    getPublicCategories,
    getPublicCategoryById,
    getAccessibleMyMajorCategories,
    getAccessibleMyCategories,
    getAccessibleMyCategoryById,
    getAccessiblePracticeCategory,
} = require('../utils/publicCatalog');
const {
    ADMIN_SCOPE,
    DEMO_SCOPE,
    PERSONAL_SCOPE,
    buildAdminScopeQuery,
} = require('../utils/libraryScope');
const {
    buildCategorySnapshot,
    buildExamDetails,
    hasSnapshotDetails,
    toReviewDetails,
    groupWrongQuestionsFromResults,
} = require('../utils/resultSnapshot');
const { removeUserAssignments } = require('../utils/userAssignment');
const { cleanupAiAnalysesForDeletedUsers } = require('../utils/userDataCleanup');
const { buildRecentDayLabels, toDayLabel } = require('../utils/categoryAnalysis');
const {
    normalizeShareCode,
    assertShareUsable,
    toSharePayload,
    copySharedPaperToRecipient,
} = require('../services/paperShareService');
const {
    generateQuestionAnalysis,
    getStoredQuestionAnalysisMap,
} = require('../services/aiAnalysisService');
const {
    buildActorKey,
    beforeSingleGeneration,
    afterSingleGeneration,
} = require('../services/aiGenerationGuard');
const { canUseQuestionAiAnalysis } = require('../middleware/aiAccess');
const { QUESTION_ORDER_SORT } = require('../utils/questionOrder');

function sanitizeExamQuestions(questions) {
    return questions.map((question) => ({
        _id: question._id,
        type: question.type,
        content: question.content,
        options: question.options,
        answer: [],
        analysis: '',
        analysisSource: question.analysisSource || 'manual',
    }));
}

function toPlainObject(item) {
    if (!item) {
        return item;
    }

    return typeof item.toObject === 'function' ? item.toObject() : { ...item };
}

function getQuestionPayloadId(question) {
    return String(question?._id || question?.questionId || '');
}

async function attachStoredAiAnalysesToQuestions(questions = []) {
    const analysisMap = await getStoredQuestionAnalysisMap(questions.map(toPlainObject));

    return questions.map((question) => {
        const payload = toPlainObject(question);
        const stored = analysisMap.get(getQuestionPayloadId(payload));
        if (!stored) {
            return payload;
        }

        return {
            ...payload,
            aiAnalysis: stored.analysis,
            aiAnalysisUpdatedAt: stored.updatedAt,
        };
    });
}

async function attachStoredAiAnalysesToReviewDetails(details = []) {
    const questions = details
        .map((detail) => {
            if (!detail?.question) {
                return null;
            }

            const question = toPlainObject(detail.question);
            const existingAnswer = Array.isArray(question.answer) ? question.answer : [];
            return {
                ...question,
                answer: existingAnswer.length > 0 ? existingAnswer : (detail.correctAnswer || []),
            };
        })
        .filter(Boolean);
    const enrichedQuestions = await attachStoredAiAnalysesToQuestions(questions);
    const questionMap = new Map(enrichedQuestions.map((question) => [getQuestionPayloadId(question), question]));

    return details.map((detail) => {
        const questionId = getQuestionPayloadId(detail?.question);
        return {
            ...detail,
            question: questionMap.get(questionId) || detail.question,
        };
    });
}

async function attachStoredAiAnalysesToWrongGroups(groups = []) {
    const questions = groups.flatMap((group) => group.questions || []);
    const enrichedQuestions = await attachStoredAiAnalysesToQuestions(questions);
    const questionMap = new Map(enrichedQuestions.map((question) => [getQuestionPayloadId(question), question]));

    return groups.map((group) => ({
        ...group,
        questions: (group.questions || []).map((question) => (
            questionMap.get(getQuestionPayloadId(question)) || question
        )),
    }));
}

function normalizeMyLibraryScope(item) {
    if (!item) {
        return item;
    }

    return {
        ...item,
        scopeType: PERSONAL_SCOPE,
        librarySource: item.librarySource
            || (item.shareOrigin?.shareId ? 'shared' : (item.scopeType === ADMIN_SCOPE ? 'assigned' : 'owned')),
    };
}

function getCategoryRecordScope(category) {
    if (category?.scopeType === PERSONAL_SCOPE) {
        return PERSONAL_SCOPE;
    }

    if (category?.scopeType === DEMO_SCOPE) {
        return DEMO_SCOPE;
    }

    return ADMIN_SCOPE;
}

function buildScopedQueryForMyCategory(category, userOpenid, extra = {}) {
    if (category?.scopeType === PERSONAL_SCOPE) {
        return {
            ...extra,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: userOpenid,
        };
    }

    return buildAdminScopeQuery(extra);
}

function buildAccessibleQuestionQueryForCategory(questionId, category, userOpenid) {
    const categoryId = category?._id ? String(category._id) : '';
    if (category?.scopeType === DEMO_SCOPE) {
        return {
            _id: questionId,
            categoryId,
            scopeType: DEMO_SCOPE,
        };
    }

    if (category?.scopeType === PERSONAL_SCOPE) {
        return {
            _id: questionId,
            categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: category.ownerOpenid || userOpenid,
        };
    }

    return buildAdminScopeQuery({
        _id: questionId,
        categoryId,
    });
}

async function getAccessibleQuestionForAi(questionId, userOpenid) {
    const seed = await Question.findById(questionId).select('_id categoryId').lean();
    if (!seed) {
        throw new NotFoundError('题目不存在或无权访问');
    }

    const category = await getAccessiblePracticeCategory(seed.categoryId, userOpenid);
    if (!category) {
        throw new NotFoundError('题目不存在或无权访问');
    }

    const question = await Question.findOne(
        buildAccessibleQuestionQueryForCategory(questionId, category, userOpenid),
    )
        .select('_id categoryId scopeType ownerOpenid type content options answer analysis')
        .lean();

    if (!question) {
        throw new NotFoundError('题目不存在或无权访问');
    }

    return question;
}

function hasAnsweredValue(answers) {
    if (!answers || typeof answers !== 'object') {
        return false;
    }

    return Object.keys(answers).some((key) => {
        const answer = answers[key];
        return Array.isArray(answer)
            ? answer.length > 0
            : answer !== undefined && answer !== null && answer !== '';
    });
}

function hasUsefulProgressData(progress = {}) {
    if (!progress || progress.isCleared) {
        return false;
    }

    if (progress.mode === 'recite') {
        if (progress.reciteMastery && Object.keys(progress.reciteMastery).length > 0) {
            return true;
        }

        return Array.isArray(progress.reciteQueue)
            && Number(progress.questionCount) > 0
            && progress.reciteQueue.length < Number(progress.questionCount);
    }

    return Number(progress.currentIndex) > 0
        && hasAnsweredValue(progress.answers);
}

function buildMyQuestionBaseQuery(categories, userOpenid) {
    const personalCategoryIds = [];
    const adminCategoryIds = [];

    categories.forEach((category) => {
        if (category.scopeType === PERSONAL_SCOPE) {
            personalCategoryIds.push(category._id);
            return;
        }

        adminCategoryIds.push(category._id);
    });

    const queries = [];
    if (personalCategoryIds.length > 0) {
        queries.push({
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: userOpenid,
            categoryId: { $in: personalCategoryIds },
        });
    }

    if (adminCategoryIds.length > 0) {
        queries.push(buildAdminScopeQuery({
            categoryId: { $in: adminCategoryIds },
        }));
    }

    if (queries.length === 0) {
        return null;
    }

    return queries.length === 1 ? queries[0] : { $or: queries };
}

function normalizeSearchScope(searchScope) {
    return ['content', 'option', 'analysis'].includes(searchScope) ? searchScope : 'all';
}

function buildSearchConditions(safeKeyword, searchScope) {
    const conditions = [];

    if (searchScope === 'all' || searchScope === 'content') {
        conditions.push({ content: { $regex: safeKeyword, $options: 'i' } });
    }

    if (searchScope === 'all' || searchScope === 'analysis') {
        conditions.push({ analysis: { $regex: safeKeyword, $options: 'i' } });
    }

    if (searchScope === 'all' || searchScope === 'option') {
        conditions.push({ 'options.value': { $regex: safeKeyword, $options: 'i' } });
    }

    return conditions;
}

function getMatchFields(item, textRegex, normalizedPinyinKeyword, usePinyinInitial, initialsCache, searchScope) {
    const fields = [];
    const content = String(item.content || '');
    const analysis = String(item.analysis || '');
    const options = Array.isArray(item.options) ? item.options : [];
    const matchesText = (value) => textRegex.test(String(value || ''));
    const matchesPinyin = (value) => usePinyinInitial
        && containsPinyinInitials(String(value || ''), normalizedPinyinKeyword, initialsCache);

    if ((searchScope === 'all' || searchScope === 'content')
        && (matchesText(content) || matchesPinyin(content))) {
        fields.push('content');
    }

    if ((searchScope === 'all' || searchScope === 'option')
        && options.some((opt) => matchesText(opt?.value) || matchesPinyin(opt?.value))) {
        fields.push('option');
    }

    if ((searchScope === 'all' || searchScope === 'analysis')
        && (matchesText(analysis) || matchesPinyin(analysis))) {
        fields.push('analysis');
    }

    return fields;
}

function getPinyinHighlightRanges(item, normalizedPinyinKeyword, usePinyinInitial, initialsCache, searchScope) {
    if (!usePinyinInitial) {
        return {
            content: [],
            analysis: [],
            options: {},
        };
    }

    const options = Array.isArray(item.options) ? item.options : [];
    const ranges = {
        content: [],
        analysis: [],
        options: {},
    };

    if (searchScope === 'all' || searchScope === 'content') {
        ranges.content = getPinyinInitialMatchRanges(item.content, normalizedPinyinKeyword, initialsCache);
    }

    if (searchScope === 'all' || searchScope === 'analysis') {
        ranges.analysis = getPinyinInitialMatchRanges(item.analysis, normalizedPinyinKeyword, initialsCache);
    }

    if (searchScope === 'all' || searchScope === 'option') {
        options.forEach((option) => {
            ranges.options[option.label] = getPinyinInitialMatchRanges(option.value, normalizedPinyinKeyword, initialsCache);
        });
    }

    return ranges;
}

function buildMatchSummary(fields = []) {
    if (!fields.length) {
        return '';
    }

    const labels = {
        content: '题干',
        option: '选项',
        analysis: '解析',
    };

    return `命中：${fields.map((field) => labels[field]).filter(Boolean).join('、')}`;
}

async function searchQuestionList({
    keyword = '',
    searchScope = 'all',
    page = 1,
    limit = 20,
    questionBaseQuery,
    scopeType = DEMO_SCOPE,
    ownerOpenid = null,
}) {
    const actualPage = Math.max(parseInt(page, 10) || 1, 1);
    const actualLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const emptyResult = {
        list: [],
        total: 0,
        page: actualPage,
        limit: actualLimit,
        hasMore: false,
    };

    if (!questionBaseQuery) {
        return emptyResult;
    }

    const trimmedKeyword = String(keyword).trim();
    const actualSearchScope = normalizeSearchScope(searchScope);
    const populateOpts = {
        path: 'categoryId',
        select: 'name majorCategoryId scopeType ownerOpenid',
        populate: {
            path: 'majorCategoryId',
            select: 'name showOnHome scopeType ownerOpenid',
        },
    };

    const toSearchItem = (item, matchFields = [], pinyinHighlightRanges = null) => {
        const major = item.categoryId?.majorCategoryId || null;
        return {
            _id: item._id,
            type: item.type,
            content: item.content,
            options: item.options,
            answer: item.answer,
            analysis: item.analysis,
            categoryId: item.categoryId?._id?.toString() || '',
            categoryName: item.categoryId?.name || '未命名试卷',
            majorCategoryId: major?._id?.toString() || '',
            majorCategoryName: major?.name || '未分组科目',
            scopeType,
            ownerOpenid,
            matchFields,
            matchSummary: buildMatchSummary(matchFields),
            pinyinHighlightRanges: pinyinHighlightRanges || {
                content: [],
                analysis: [],
                options: {},
            },
        };
    };

    if (trimmedKeyword) {
        const safeKeyword = escapeRegex(trimmedKeyword);
        const textRegex = new RegExp(safeKeyword, 'i');
        const usePinyinInitial = isPinyinInitialKeyword(trimmedKeyword);
        const normalizedPinyinKeyword = normalizePinyinKeyword(trimmedKeyword);
        const searchConditions = buildSearchConditions(safeKeyword, actualSearchScope);
        const dbTextQuery = {
            $and: [
                questionBaseQuery,
                { $or: searchConditions },
            ],
        };

        if (usePinyinInitial) {
            const PINYIN_CANDIDATE_LIMIT = 2000;
            const initialsCache = new Map();
            const candidates = await Question.find(questionBaseQuery)
                .sort({ updateTime: -1, _id: -1 })
                .limit(PINYIN_CANDIDATE_LIMIT)
                .populate(populateOpts)
                .lean();

            const matched = candidates
                .map((item) => ({
                    item,
                    matchFields: getMatchFields(
                        item,
                        textRegex,
                        normalizedPinyinKeyword,
                        usePinyinInitial,
                        initialsCache,
                        actualSearchScope,
                    ),
                    pinyinHighlightRanges: getPinyinHighlightRanges(
                        item,
                        normalizedPinyinKeyword,
                        usePinyinInitial,
                        initialsCache,
                        actualSearchScope,
                    ),
                }))
                .filter((entry) => entry.matchFields.length > 0);

            const total = matched.length;
            const startIndex = (actualPage - 1) * actualLimit;
            const endIndex = startIndex + actualLimit;

            return {
                list: matched.slice(startIndex, endIndex).map((entry) => toSearchItem(
                    entry.item,
                    entry.matchFields,
                    entry.pinyinHighlightRanges,
                )),
                total,
                page: actualPage,
                limit: actualLimit,
                hasMore: endIndex < total,
            };
        }

        const [list, total] = await Promise.all([
            Question.find(dbTextQuery)
                .sort({ updateTime: -1, _id: -1 })
                .skip((actualPage - 1) * actualLimit)
                .limit(actualLimit)
                .populate(populateOpts)
                .lean(),
            Question.countDocuments(dbTextQuery),
        ]);

        return {
            list: list.map((item) => {
                const initialsCache = new Map();
                return toSearchItem(
                    item,
                    getMatchFields(
                        item,
                        textRegex,
                        normalizedPinyinKeyword,
                        usePinyinInitial,
                        initialsCache,
                        actualSearchScope,
                    ),
                    getPinyinHighlightRanges(
                        item,
                        normalizedPinyinKeyword,
                        usePinyinInitial,
                        initialsCache,
                        actualSearchScope,
                    ),
                );
            }),
            total,
            page: actualPage,
            limit: actualLimit,
            hasMore: actualPage * actualLimit < total,
        };
    }

    const [list, total] = await Promise.all([
        Question.find(questionBaseQuery)
            .sort({ updateTime: -1, _id: -1 })
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .populate(populateOpts)
            .lean(),
        Question.countDocuments(questionBaseQuery),
    ]);

    return {
        list: list.map(toSearchItem),
        total,
        page: actualPage,
        limit: actualLimit,
        hasMore: actualPage * actualLimit < total,
    };
}

function buildLiveReviewDetails(result, questions) {
    return questions.map((question) => {
        const userAnswer = result.answers[question._id.toString()];
        const isAnswerCorrect = userAnswer && isCorrect(userAnswer, question.answer);
        return {
            question: {
                _id: question._id,
                type: question.type,
                content: question.content,
                options: question.options,
                analysis: question.analysis,
                analysisSource: question.analysisSource || 'manual',
            },
            userAnswer: userAnswer || null,
            correctAnswer: question.answer,
            isCorrect: isAnswerCorrect,
        };
    });
}

function mergeWrongQuestionGroups(primaryGroups = [], secondaryGroups = []) {
    const mergedGroups = new Map();
    const seenQuestionIds = new Set();

    for (const group of [...primaryGroups, ...secondaryGroups]) {
        if (!group || !Array.isArray(group.questions)) {
            continue;
        }

        if (!mergedGroups.has(group.categoryId)) {
            mergedGroups.set(group.categoryId, {
                categoryId: group.categoryId,
                categoryName: group.categoryName,
                questions: [],
            });
        }

        const target = mergedGroups.get(group.categoryId);
        for (const question of group.questions) {
            const questionId = String(question._id);
            if (seenQuestionIds.has(questionId)) {
                continue;
            }

            seenQuestionIds.add(questionId);
            target.questions.push(question);
        }
    }

    return Array.from(mergedGroups.values());
}

function toQuestionStatePayload(state) {
    return {
        status: state?.status || 'needsReview',
        favorite: !!state?.favorite,
        note: state?.note || '',
        wrongCount: state?.wrongCount || 0,
        correctStreak: state?.correctStreak || 0,
        masteredAt: state?.masteredAt || null,
        lastWrongAt: state?.lastWrongAt || null,
        lastCorrectAt: state?.lastCorrectAt || null,
    };
}

async function attachWrongQuestionStates(groups, userId, includeMastered = false) {
    const questionIds = [...new Set(
        groups.flatMap((group) => (group.questions || []).map((question) => String(question._id))).filter(Boolean),
    )];

    if (questionIds.length === 0) {
        return groups;
    }

    const states = await UserQuestionState.find({
        userId,
        questionId: { $in: questionIds },
    }).lean();
    const stateMap = new Map(states.map((state) => [String(state.questionId), state]));

    return groups
        .map((group) => ({
            ...group,
            questions: (group.questions || [])
                .map((question) => ({
                    ...question,
                    state: toQuestionStatePayload(stateMap.get(String(question._id))),
                }))
                .filter((question) => includeMastered || question.state.status !== 'mastered'),
        }))
        .filter((group) => (group.questions || []).length > 0);
}

async function applyAnswerResultToQuestionState({
    userId,
    categoryId,
    questionId,
    isAnswerCorrect,
    at = new Date(),
}) {
    const existing = await UserQuestionState.findOne({ userId, questionId });

    if (!isAnswerCorrect) {
        return UserQuestionState.findOneAndUpdate(
            { userId, questionId },
            {
                $set: {
                    categoryId,
                    status: 'needsReview',
                    correctStreak: 0,
                    lastWrongAt: at,
                    masteredAt: null,
                },
                $inc: { wrongCount: 1 },
                $setOnInsert: {
                    favorite: false,
                    note: '',
                },
            },
            { upsert: true, new: true, runValidators: true },
        );
    }

    if (!existing) {
        return null;
    }

    const nextStreak = (existing.correctStreak || 0) + 1;
    const nextStatus = nextStreak >= 2 ? 'mastered' : existing.status;
    existing.categoryId = categoryId;
    existing.correctStreak = nextStreak;
    existing.lastCorrectAt = at;
    existing.status = nextStatus;
    if (nextStatus === 'mastered' && !existing.masteredAt) {
        existing.masteredAt = at;
    }

    return existing.save();
}

async function syncQuestionStatesFromExam(userId, category, details = []) {
    const categoryId = category?._id || category;
    if (!userId || !categoryId || !Array.isArray(details) || details.length === 0) {
        return;
    }

    const answeredDetails = details
        .filter((detail) => detail?.questionId && Array.isArray(detail.userAnswer) && detail.userAnswer.length > 0);
    const wrongDetails = answeredDetails.filter((detail) => !detail.isCorrect);
    await Promise.all(wrongDetails.map((detail) => applyAnswerResultToQuestionState({
        userId,
        categoryId,
        questionId: String(detail.questionId),
        isAnswerCorrect: false,
    })));

    const correctQuestionIds = answeredDetails
        .filter((detail) => detail.isCorrect)
        .map((detail) => String(detail.questionId));
    if (correctQuestionIds.length === 0) {
        return;
    }

    const existingStates = await UserQuestionState.find({
        userId,
        questionId: { $in: correctQuestionIds },
    }).select('questionId').lean();
    const existingQuestionIds = new Set(existingStates.map((state) => String(state.questionId)));

    await Promise.all(correctQuestionIds
        .filter((questionId) => existingQuestionIds.has(questionId))
        .map((questionId) => applyAnswerResultToQuestionState({
            userId,
            categoryId,
            questionId,
            isAnswerCorrect: true,
        })));
}

function buildStudyTrend(results, dayCount = 14) {
    const labels = buildRecentDayLabels(dayCount);
    const map = new Map(labels.map((label) => [label, { count: 0, scoreSum: 0 }]));

    results.forEach((item) => {
        const label = toDayLabel(item.createTime);
        if (!map.has(label)) {
            return;
        }

        const bucket = map.get(label);
        bucket.count += 1;
        bucket.scoreSum += Number(item.score) || 0;
    });

    return {
        dates: labels,
        counts: labels.map((label) => map.get(label)?.count || 0),
        averageScores: labels.map((label) => {
            const bucket = map.get(label);
            return bucket && bucket.count > 0 ? Math.round(bucket.scoreSum / bucket.count) : 0;
        }),
    };
}

function buildStudyWeakCategories(results) {
    const map = new Map();

    results.forEach((item) => {
        const categoryId = String(item.categorySnapshot?.categoryId || item.categoryId?._id || item.categoryId || '');
        if (!categoryId) {
            return;
        }

        if (!map.has(categoryId)) {
            map.set(categoryId, {
                categoryId,
                categoryName: item.categorySnapshot?.name || item.categoryId?.name || '未命名题库',
                examCount: 0,
                scoreSum: 0,
                totalQuestions: 0,
                wrongQuestions: 0,
                lastExamAt: item.createTime,
            });
        }

        const target = map.get(categoryId);
        target.examCount += 1;
        target.scoreSum += Number(item.score) || 0;
        target.totalQuestions += Number(item.totalCount) || 0;
        target.wrongQuestions += Math.max((Number(item.totalCount) || 0) - (Number(item.correctCount) || 0), 0);
        if (new Date(item.createTime) > new Date(target.lastExamAt)) {
            target.lastExamAt = item.createTime;
        }
    });

    return Array.from(map.values())
        .map((item) => ({
            ...item,
            averageScore: item.examCount > 0 ? Math.round(item.scoreSum / item.examCount) : 0,
            wrongRate: item.totalQuestions > 0 ? Math.round((item.wrongQuestions / item.totalQuestions) * 100) : 0,
        }))
        .sort((left, right) => right.wrongRate - left.wrongRate || left.averageScore - right.averageScore)
        .slice(0, 5);
}

async function buildLiveWrongQuestions(examResults, userId) {
    if (examResults.length === 0) {
        return [];
    }

    const categoryMap = new Map();
    examResults
        .filter((result) => result.categoryId)
        .forEach((result) => {
            categoryMap.set(String(result.categoryId._id), result.categoryId);
        });
    const questionEntries = await Promise.all(
        Array.from(categoryMap.values()).map(async (category) => {
            const categoryId = String(category._id);
            const questions = await Question.find(buildScopedQueryForMyCategory(category, userId, {
                categoryId,
            })).sort(QUESTION_ORDER_SORT);
            return [categoryId, questions];
        }),
    );
    const questionsByCategoryId = {};

    for (const [categoryId, questions] of questionEntries) {
        questionsByCategoryId[categoryId] = questions;
    }

    const wrongQuestionsMap = new Map();
    for (const result of examResults) {
        if (!result.categoryId) {
            continue;
        }

        const categoryId = result.categoryId._id.toString();
        const questions = questionsByCategoryId[categoryId] || [];

        for (const question of questions) {
            const questionId = question._id.toString();
            if (wrongQuestionsMap.has(questionId)) {
                continue;
            }

            const userAnswer = result.answers[questionId];
            if (userAnswer && !isCorrect(userAnswer, question.answer)) {
                wrongQuestionsMap.set(questionId, {
                    question,
                    userAnswer,
                    categoryId,
                    categoryName: result.categoryId.name,
                    answeredAt: result.createTime,
                });
            }
        }
    }

    const grouped = {};
    for (const [, item] of wrongQuestionsMap) {
        if (!grouped[item.categoryId]) {
            grouped[item.categoryId] = {
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                questions: [],
            };
        }

        grouped[item.categoryId].questions.push({
            _id: item.question._id.toString(),
            type: item.question.type,
            content: item.question.content,
            options: item.question.options,
            answer: item.question.answer,
            analysis: item.question.analysis,
            analysisSource: item.question.analysisSource || 'manual',
            userAnswer: item.userAnswer,
            answeredAt: item.answeredAt,
        });
    }

    return Object.values(grouped);
}

async function buildLiveWrongQuestionsByCategory(category, userId, examResults) {
    if (examResults.length === 0) {
        return [];
    }

    const questions = await Question.find(buildScopedQueryForMyCategory(category, userId, {
        categoryId: category._id,
    })).sort(QUESTION_ORDER_SORT);
    const wrongQuestionsMap = new Map();

    for (const result of examResults) {
        for (const question of questions) {
            const questionId = question._id.toString();
            if (wrongQuestionsMap.has(questionId)) {
                continue;
            }

            const userAnswer = result.answers[questionId];
            if (userAnswer && !isCorrect(userAnswer, question.answer)) {
                wrongQuestionsMap.set(questionId, {
                    _id: questionId,
                    type: question.type,
                    content: question.content,
                    options: question.options,
                    answer: question.answer,
                    analysis: question.analysis,
                    analysisSource: question.analysisSource || 'manual',
                    userAnswer,
                    answeredAt: result.createTime,
                });
            }
        }
    }

    return Array.from(wrongQuestionsMap.values());
}

exports.getCategories = asyncHandler(async (req, res) => {
    const { majorCategoryId } = req.query;
    const categories = await getPublicCategories({ majorCategoryId });
    success(res, categories);
});

exports.getQuestions = asyncHandler(async (req, res) => {
    const { categoryId, mode = 'exam' } = req.query;
    const category = await getPublicCategoryById(categoryId);
    if (!category) {
        throw new NotFoundError('示例题库不存在或已下线');
    }

    const questions = await Question.find({ categoryId, scopeType: DEMO_SCOPE }).sort(QUESTION_ORDER_SORT);

    if (mode === 'exam') {
        return success(res, sanitizeExamQuestions(questions));
    }

    const payload = req.user
        ? await attachStoredAiAnalysesToQuestions(questions)
        : questions;

    success(res, payload);
});

exports.searchQuestions = asyncHandler(async (req, res) => {
    const {
        keyword = '',
        majorCategoryId,
        categoryId,
        searchScope = 'all',
        page = 1,
        limit = 20,
    } = req.query;

    const actualPage = Math.max(parseInt(page, 10) || 1, 1);
    const actualLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

    const visibleMajors = await getVisibleMajorCategories();
    const visibleMajorSet = new Set(visibleMajors.map((item) => item._id.toString()));

    if (majorCategoryId && !visibleMajorSet.has(majorCategoryId)) {
        return success(res, {
            list: [],
            total: 0,
            page: actualPage,
            limit: actualLimit,
            hasMore: false,
        });
    }

    const visibleCategories = await getPublicCategories({ majorCategoryId, categoryId });
    if (visibleCategories.length === 0) {
        return success(res, {
            list: [],
            total: 0,
            page: actualPage,
            limit: actualLimit,
            hasMore: false,
        });
    }

    const questionBaseQuery = {
        scopeType: DEMO_SCOPE,
        categoryId: { $in: visibleCategories.map((item) => item._id) },
    };
    const result = await searchQuestionList({
        keyword,
        searchScope,
        page,
        limit,
        questionBaseQuery,
        scopeType: DEMO_SCOPE,
        ownerOpenid: null,
    });
    return success(res, result);
});

exports.searchMyQuestions = asyncHandler(async (req, res) => {
    const {
        keyword = '',
        majorCategoryId,
        categoryId,
        searchScope = 'all',
        page = 1,
        limit = 20,
    } = req.query;
    const categories = await getAccessibleMyCategories({
        ownerOpenid: req.user.openid,
        majorCategoryId,
        categoryId,
    });
    const result = await searchQuestionList({
        keyword,
        searchScope,
        page,
        limit,
        questionBaseQuery: buildMyQuestionBaseQuery(categories, req.user.openid),
        scopeType: PERSONAL_SCOPE,
        ownerOpenid: req.user.openid,
    });

    success(res, result);
});

exports.previewDemoExam = asyncHandler(async (req, res) => {
    const { categoryId, answers } = req.body;
    const userId = req.user?.openid || '';
    const category = await getPublicCategoryById(categoryId);
    if (!category) {
        throw new NotFoundError('示例题库不存在或已下线');
    }

    const questions = await Question.find({ categoryId, scopeType: DEMO_SCOPE }).sort(QUESTION_ORDER_SORT);
    if (questions.length === 0) {
        throw new NotFoundError('该题库下没有题目');
    }

    const totalCount = questions.length;
    const { details, correctCount } = buildExamDetails(questions, answers);
    const score = Math.round((correctCount / totalCount) * 100);
    let persistedResult = null;

    if (userId) {
        persistedResult = await ExamResult.create({
            userId,
            categoryId,
            score,
            correctCount,
            totalCount,
            answers,
            categorySnapshot: buildCategorySnapshot(category),
            details,
            scopeType: DEMO_SCOPE,
            ownerOpenid: null,
        });
        await syncQuestionStatesFromExam(userId, category, details);
    }

    const reviewDetails = userId
        ? await attachStoredAiAnalysesToReviewDetails(toReviewDetails(details))
        : toReviewDetails(details);

    success(res, {
        _id: persistedResult?._id || `demo_preview_${Date.now()}`,
        score,
        correctCount,
        totalCount,
        details: reviewDetails,
        categoryName: category.name,
        createTime: persistedResult?.createTime,
        scopeType: DEMO_SCOPE,
        ownerOpenid: null,
    });
});

exports.getMyMajorCategories = asyncHandler(async (req, res) => {
    const list = await getAccessibleMyMajorCategories(req.user.openid, { includeHidden: false });
    success(res, list.map(normalizeMyLibraryScope));
});

exports.getMyCategories = asyncHandler(async (req, res) => {
    const { majorCategoryId } = req.query;
    const categories = await getAccessibleMyCategories({
        ownerOpenid: req.user.openid,
        majorCategoryId,
    });
    success(res, categories.map(normalizeMyLibraryScope));
});

exports.getMyQuestions = asyncHandler(async (req, res) => {
    const { categoryId, mode = 'exam' } = req.query;
    const category = await getAccessibleMyCategoryById(categoryId, req.user.openid);
    if (!category) {
        throw new NotFoundError('你可访问的题库不存在或未发布');
    }

    const questions = await Question.find(buildScopedQueryForMyCategory(category, req.user.openid, {
        categoryId,
    })).sort(QUESTION_ORDER_SORT);

    if (mode === 'exam') {
        return success(res, sanitizeExamQuestions(questions));
    }

    success(res, await attachStoredAiAnalysesToQuestions(questions));
});

exports.previewPaperShare = asyncHandler(async (req, res) => {
    const shareCode = normalizeShareCode(req.query.shareCode);
    const share = await PaperShare.findOne({ shareCode })
        .populate('categoryId', 'name count duration passingScore isPublished')
        .lean();

    if (!share) {
        throw new NotFoundError('分享不存在或分享码错误');
    }

    const receipt = await PaperShareReceipt.findOne({
        shareId: share._id,
        recipientOpenid: req.user.openid,
    })
        .populate('newCategoryId', 'name majorCategoryId shareOrigin')
        .lean();

    if (!receipt) {
        assertShareUsable(share);
    }

    success(res, {
        share: toSharePayload(share, req),
        sourceCategory: share.categoryId
            ? {
                _id: share.categoryId._id,
                name: share.categoryId.name,
                count: share.categoryId.count || 0,
                duration: share.categoryId.duration || 0,
                passingScore: share.categoryId.passingScore || 60,
            }
            : null,
        alreadyAccepted: Boolean(receipt),
        importedCategory: receipt?.newCategoryId || null,
    });
});

exports.acceptPaperShare = asyncHandler(async (req, res) => {
    const shareCode = normalizeShareCode(req.body.shareCode);
    const share = await PaperShare.findOne({ shareCode });
    const result = await copySharedPaperToRecipient(share, req.user.openid);
    const latestShare = await PaperShare.findById(share._id).lean();
    const category = result.category.toObject ? result.category.toObject() : result.category;

    success(res, {
        created: result.created,
        share: toSharePayload(latestShare || share, req),
        category: normalizeMyLibraryScope(category),
    }, result.created ? '分享接收成功' : '你已接收过该分享');
});

exports.submitExam = asyncHandler(async (req, res) => {
    const { categoryId, answers } = req.body;
    const userId = req.user.openid;
    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        throw new NotFoundError('你可访问的题库不存在或未发布');
    }

    const questions = await Question.find(buildScopedQueryForMyCategory(category, userId, {
        categoryId,
    })).sort(QUESTION_ORDER_SORT);
    if (questions.length === 0) {
        throw new NotFoundError('该题库下没有题目');
    }

    const totalCount = questions.length;
    const { details, correctCount } = buildExamDetails(questions, answers);
    const score = Math.round((correctCount / totalCount) * 100);
    const resultScopeType = getCategoryRecordScope(category);

    const result = await ExamResult.create({
        userId,
        categoryId,
        score,
        correctCount,
        totalCount,
        answers,
        categorySnapshot: buildCategorySnapshot(category),
        details,
        scopeType: resultScopeType,
        ownerOpenid: resultScopeType === PERSONAL_SCOPE ? (category.ownerOpenid || userId) : null,
    });
    await syncQuestionStatesFromExam(userId, category, details);

    success(res, {
        _id: result._id,
        score,
        correctCount,
        totalCount,
        details: await attachStoredAiAnalysesToReviewDetails(toReviewDetails(details)),
        categoryName: category.name,
        scopeType: result.scopeType,
        ownerOpenid: result.ownerOpenid,
    });
});

exports.getLatestResult = asyncHandler(async (req, res) => {
    const { categoryId } = req.query;
    const userId = req.user.openid;
    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        return success(res, null, 'No result found');
    }

    const latestResult = await ExamResult.findOne(buildScopedQueryForMyCategory(category, userId, {
        categoryId,
        userId,
    }))
        .sort({ createTime: -1 })
        .populate('categoryId', 'name');

    if (!latestResult) {
        return success(res, null, 'No result found');
    }

    if (hasSnapshotDetails(latestResult)) {
        return success(res, {
            _id: latestResult._id,
            score: latestResult.score,
            correctCount: latestResult.correctCount,
            totalCount: latestResult.totalCount,
            details: await attachStoredAiAnalysesToReviewDetails(toReviewDetails(latestResult.details)),
            createTime: latestResult.createTime,
            categoryName: latestResult.categorySnapshot?.name || latestResult.categoryId?.name || '',
        });
    }

    const questions = await Question.find(buildScopedQueryForMyCategory(category, userId, {
        categoryId,
    })).sort(QUESTION_ORDER_SORT);
    const details = await attachStoredAiAnalysesToReviewDetails(
        buildLiveReviewDetails(latestResult, questions),
    );

    success(res, {
        _id: latestResult._id,
        score: latestResult.score,
        correctCount: latestResult.correctCount,
        totalCount: latestResult.totalCount,
        details,
        createTime: latestResult.createTime,
        categoryName: latestResult.categorySnapshot?.name || latestResult.categoryId?.name || '',
    });
});

exports.saveProgress = asyncHandler(async (req, res) => {
    const {
        categoryId,
        mode,
        currentIndex,
        answers,
        timeLeft,
        questionCount,
        reciteQueue,
        reciteMastery,
        reciteReviewTimes,
        updateTime,
    } = req.body;
    const userId = req.user.openid;
    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        throw new NotFoundError('你可访问的题库不存在或未发布');
    }

    if (!hasUsefulProgressData(req.body)) {
        return success(res, null, 'Progress ignored');
    }

    const progressScopeType = category.scopeType === PERSONAL_SCOPE ? PERSONAL_SCOPE : ADMIN_SCOPE;
    const existingProgress = await ExamProgress.findOne({ userId, categoryId, mode });
    const incomingUpdatedAt = updateTime ? new Date(updateTime).getTime() : Date.now();
    const existingUpdatedAt = existingProgress?.updateTime
        ? new Date(existingProgress.updateTime).getTime()
        : 0;

    if (
        existingProgress?.isCleared
        && Number.isFinite(incomingUpdatedAt)
        && incomingUpdatedAt <= existingUpdatedAt
    ) {
        return success(res, null, 'Progress ignored');
    }

    const progressData = {
        currentIndex,
        answers,
        timeLeft,
        questionCount,
        reciteQueue,
        reciteMastery,
        reciteReviewTimes,
        isCleared: false,
        scopeType: progressScopeType,
        ownerOpenid: progressScopeType === PERSONAL_SCOPE ? userId : null,
    };

    Object.keys(progressData).forEach((key) => {
        if (progressData[key] === undefined) {
            delete progressData[key];
        }
    });

    await ExamProgress.findOneAndUpdate(
        {
            userId,
            categoryId,
            mode,
        },
        progressData,
        { upsert: true, new: true },
    );
    success(res, null, 'Progress saved');
});

exports.getProgress = asyncHandler(async (req, res) => {
    const { categoryId, mode } = req.query;
    const userId = req.user.openid;
    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        return success(res, null);
    }

    let progress = await ExamProgress.findOne(buildScopedQueryForMyCategory(category, userId, {
        userId,
        categoryId,
        mode,
    }));
    if (!progress) {
        progress = await ExamProgress.findOne({ userId, categoryId, mode });
    }

    if (!hasUsefulProgressData(progress)) {
        return success(res, null);
    }

    success(res, progress);
});

exports.clearProgress = asyncHandler(async (req, res) => {
    const { categoryId, mode } = req.body;
    const userId = req.user.openid;
    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        return success(res, null, 'Progress cleared');
    }

    const progressScopeType = category.scopeType === PERSONAL_SCOPE ? PERSONAL_SCOPE : ADMIN_SCOPE;
    const clearedProgress = {
        currentIndex: 0,
        answers: {},
        timeLeft: 0,
        questionCount: 0,
        reciteQueue: [],
        reciteMastery: {},
        reciteReviewTimes: {},
        isCleared: true,
        scopeType: progressScopeType,
        ownerOpenid: progressScopeType === PERSONAL_SCOPE ? userId : null,
    };

    const result = await ExamProgress.updateMany({
        userId,
        categoryId,
        mode,
    }, { $set: clearedProgress });

    if (!result.matchedCount) {
        await ExamProgress.create({
            userId,
            categoryId,
            mode,
            ...clearedProgress,
        });
    }

    success(res, null, 'Progress cleared');
});

exports.getWrongQuestions = asyncHandler(async (req, res) => {
    const userId = req.user.openid;
    const includeMastered = req.query.includeMastered === 'true';
    const examResults = await ExamResult.find({ userId })
        .sort({ createTime: -1 })
        .populate('categoryId', 'name majorCategoryId scopeType ownerOpenid');

    if (examResults.length === 0) {
        return success(res, []);
    }

    const snapshotGroups = groupWrongQuestionsFromResults(
        examResults.filter((result) => hasSnapshotDetails(result)),
    );
    const liveGroups = await buildLiveWrongQuestions(
        examResults.filter((result) => !hasSnapshotDetails(result)),
        userId,
    );

    const groups = await attachWrongQuestionStates(
        mergeWrongQuestionGroups(snapshotGroups, liveGroups),
        userId,
        includeMastered,
    );

    success(res, await attachStoredAiAnalysesToWrongGroups(groups));
});

exports.getWrongQuestionsByCategory = asyncHandler(async (req, res) => {
    const { categoryId } = req.params;
    const userId = req.user.openid;
    const includeMastered = req.query.includeMastered === 'true';
    const category = await getAccessibleMyCategoryById(categoryId, userId);

    if (!category) {
        return success(res, {
            categoryId,
            categoryName: '未知题库',
            questions: [],
        });
    }

    const examResults = await ExamResult.find({
        categoryId,
        userId,
    }).sort({ createTime: -1 });

    if (examResults.length === 0) {
        return success(res, {
            categoryId,
            categoryName: category.name || '未命名题库',
            questions: [],
        });
    }

    const categoryName = category.name || '未命名题库';
    const snapshotGroups = groupWrongQuestionsFromResults(
        examResults.filter((result) => hasSnapshotDetails(result)),
    );
    const snapshotQuestions = snapshotGroups
        .find((group) => group.categoryId === String(categoryId))
        ?.questions || [];
    const liveQuestions = await buildLiveWrongQuestionsByCategory(
        category,
        userId,
        examResults.filter((result) => !hasSnapshotDetails(result)),
    );
    const mergedGroups = mergeWrongQuestionGroups(
        [{ categoryId: String(categoryId), categoryName, questions: snapshotQuestions }],
        [{ categoryId: String(categoryId), categoryName, questions: liveQuestions }],
    );
    const groupsWithState = await attachWrongQuestionStates(mergedGroups, userId, includeMastered);
    const groupsWithAiAnalysis = await attachStoredAiAnalysesToWrongGroups(groupsWithState);
    const mergedQuestions = groupsWithAiAnalysis[0]?.questions || [];

    success(res, {
        categoryId,
        categoryName,
        questions: mergedQuestions,
    });
});

exports.updateWrongQuestionState = asyncHandler(async (req, res) => {
    const { questionId } = req.params;
    const userId = req.user.openid;
    const {
        categoryId: incomingCategoryId,
        status,
        favorite,
        note,
        answerResult,
    } = req.body;
    const question = await Question.findById(questionId).select('categoryId').lean();
    const categoryId = incomingCategoryId || question?.categoryId;

    if (!categoryId) {
        throw new AppError('缺少题库信息，无法更新错题状态', 400);
    }

    const category = await getAccessibleMyCategoryById(categoryId, userId);
    if (!category) {
        throw new NotFoundError('你可访问的题库不存在或未发布');
    }

    const scopedQuestion = await Question.findOne(buildScopedQueryForMyCategory(category, userId, {
        _id: questionId,
        categoryId,
    }))
        .select('_id')
        .lean();
    if (!scopedQuestion) {
        throw new NotFoundError('题目不存在或无权访问');
    }

    let state = null;
    const answeredAt = new Date();
    if (answerResult) {
        state = await applyAnswerResultToQuestionState({
            userId,
            categoryId,
            questionId,
            isAnswerCorrect: answerResult === 'correct',
            at: answeredAt,
        });
    }

    const setData = { categoryId };
    if (answerResult === 'correct' && !state) {
        setData.status = 'needsReview';
        setData.correctStreak = 1;
        setData.lastCorrectAt = answeredAt;
    }
    if (status) {
        setData.status = status;
        setData.masteredAt = status === 'mastered' ? new Date() : null;
        if (status === 'needsReview') {
            setData.correctStreak = 0;
        }
    }
    if (typeof favorite === 'boolean') {
        setData.favorite = favorite;
    }
    if (typeof note === 'string') {
        setData.note = note;
    }

    if (Object.keys(setData).length > 1 || !state) {
        const setOnInsert = {
            wrongCount: 0,
            correctStreak: 0,
            favorite: false,
            note: '',
        };
        Object.keys(setData).forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(setOnInsert, key)) {
                delete setOnInsert[key];
            }
        });

        state = await UserQuestionState.findOneAndUpdate(
            { userId, questionId },
            {
                $set: setData,
                $setOnInsert: setOnInsert,
            },
            { upsert: true, new: true, runValidators: true },
        );
    }

    success(res, toQuestionStatePayload(state), '错题状态已更新');
});

exports.userLogin = asyncHandler(async (req, res) => {
    const { code } = req.body;

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', config.wechat.appId);
    url.searchParams.set('secret', config.wechat.appSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.externalApiTimeoutMs);
    let payload;

    try {
        const response = await fetch(url, { signal: controller.signal });
        payload = await response.json();

        if (!response.ok) {
            throw new AppError('微信登录服务暂时不可用', 502);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new AppError('微信登录请求超时，请稍后再试', 504);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    const { openid, errcode, errmsg } = payload;
    if (errcode) {
        throw new AppError(errmsg || '微信登录失败', 400);
    }

    let user = await User.findOne({ openid });
    if (!user) {
        user = await User.create({ openid });
    } else {
        user.lastActiveTime = Date.now();
        await user.save();
    }

    const token = jwt.sign(
        { openid, role: 'user' },
        config.jwtSecret,
        { expiresIn: config.userJwtExpiresIn },
    );

    success(res, {
        token,
        openid,
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || '',
    });
});

exports.updateProfile = asyncHandler(async (req, res) => {
    const { nickname, avatarUrl } = req.body;

    const user = await User.findOneAndUpdate(
        { openid: req.user.openid },
        { nickname, avatarUrl, lastActiveTime: Date.now() },
        { new: true, upsert: true },
    );
    success(res, user);
});

exports.getConsoleProfile = asyncHandler(async (req, res) => {
    const openid = req.user.openid;
    const [account, accessibleCategories] = await Promise.all([
        ConsoleAccount.findOne({ openid }).lean(),
        getAccessibleMyCategories({ ownerOpenid: openid }),
    ]);

    success(res, {
        hasConsoleAccount: !!account,
        role: account?.role || '',
        displayName: account?.displayName || '',
        categoryCount: accessibleCategories.length,
        consolePath: '/',
    });
});

exports.getAiAnalysisStatus = asyncHandler(async (req, res) => {
    const canGenerateAiAnalysis = await canUseQuestionAiAnalysis(req.user.openid);
    const enabled = Boolean(config.ai.enabled);

    success(res, {
        enabled,
        canUseAiAnalysis: enabled,
        canGenerateAiAnalysis: enabled && canGenerateAiAnalysis,
        model: enabled ? config.ai.model : '',
    });
});

exports.analyzeQuestion = asyncHandler(async (req, res) => {
    const question = await getAccessibleQuestionForAi(req.body.questionId, req.user.openid);
    const canGenerateAiAnalysis = await canUseQuestionAiAnalysis(req.user.openid);
    const actorKey = buildActorKey('user', req.user.openid);
    const result = await generateQuestionAnalysis({
        question,
        forceRefresh: canGenerateAiAnalysis && req.body.forceRefresh,
        requesterOpenid: req.user.openid,
        generationKey: actorKey,
        allowUpstream: canGenerateAiAnalysis,
        beforeUpstream: () => beforeSingleGeneration(actorKey),
        afterUpstream: (generatedResult, reservation) => afterSingleGeneration(actorKey, generatedResult, reservation),
    });
    success(res, result, result.generated ? 'AI解析已生成' : 'AI解析已读取');
});

exports.getUserSummary = asyncHandler(async (req, res) => {
    const openid = req.user.openid;
    const [summary] = await ExamResult.aggregate([
        { $match: { userId: openid } },
        {
            $group: {
                _id: null,
                examCount: { $sum: 1 },
                passCount: {
                    $sum: {
                        $cond: [
                            { $gte: ['$score', { $ifNull: ['$categorySnapshot.passingScore', 60] }] },
                            1,
                            0,
                        ],
                    },
                },
                bestScore: { $max: '$score' },
                averageScore: { $avg: '$score' },
            },
        },
    ]);

    success(res, {
        examCount: summary?.examCount || 0,
        passCount: summary?.passCount || 0,
        bestScore: summary?.bestScore || 0,
        averageScore: summary ? Math.round(summary.averageScore || 0) : 0,
    });
});

exports.getStudyReport = asyncHandler(async (req, res) => {
    const openid = req.user.openid;
    const [summary] = await ExamResult.aggregate([
        { $match: { userId: openid } },
        {
            $group: {
                _id: null,
                examCount: { $sum: 1 },
                passCount: {
                    $sum: {
                        $cond: [
                            { $gte: ['$score', { $ifNull: ['$categorySnapshot.passingScore', 60] }] },
                            1,
                            0,
                        ],
                    },
                },
                bestScore: { $max: '$score' },
                averageScore: { $avg: '$score' },
                totalCorrect: { $sum: '$correctCount' },
                totalQuestions: { $sum: '$totalCount' },
            },
        },
    ]);
    const results = await ExamResult.find({ userId: openid })
        .select('categoryId categorySnapshot score correctCount totalCount createTime')
        .populate('categoryId', 'name')
        .sort({ createTime: -1 })
        .limit(300)
        .lean();

    const examCount = summary?.examCount || 0;
    const passCount = summary?.passCount || 0;
    const totalQuestions = summary?.totalQuestions || 0;
    const totalCorrect = summary?.totalCorrect || 0;

    success(res, {
        summary: {
            examCount,
            passCount,
            passRate: examCount > 0 ? Math.round((passCount / examCount) * 100) : 0,
            bestScore: summary?.bestScore || 0,
            averageScore: summary ? Math.round(summary.averageScore || 0) : 0,
            accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
            totalQuestions,
            totalCorrect,
        },
        trendData: buildStudyTrend(results),
        weakCategories: buildStudyWeakCategories(results),
        recentResults: results.slice(0, 20).map((item) => ({
            id: item._id,
            title: item.categorySnapshot?.name || item.categoryId?.name || '未命名题库',
            score: item.score,
            correctCount: item.correctCount,
            totalCount: item.totalCount,
            time: item.createTime,
        })),
    });
});

exports.getExamHistory = asyncHandler(async (req, res) => {
    const openid = req.user.openid;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 100);

    const history = await ExamResult.find({ userId: openid })
        .sort({ createTime: -1 })
        .populate('categoryId', 'name')
        .limit(limit);

    const formattedHistory = history.map((item) => ({
        id: item._id,
        title: item.categorySnapshot?.name || (item.categoryId ? item.categoryId.name : '未命名题库'),
        score: item.score,
        time: new Date(item.createTime).toISOString().split('T')[0],
    }));

    success(res, formattedHistory);
});

exports.deleteAccount = asyncHandler(async (req, res) => {
    const openid = req.user.openid;
    await cleanupAiAnalysesForDeletedUsers([openid]);

    await Promise.all([
        User.deleteOne({ openid }),
        ConsoleAccount.deleteOne({ openid }),
        MajorCategory.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: openid }),
        Category.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: openid }),
        Question.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: openid }),
        PaperShare.deleteMany({ ownerOpenid: openid }),
        PaperShareReceipt.deleteMany({
            $or: [
                { ownerOpenid: openid },
                { recipientOpenid: openid },
            ],
        }),
        Feedback.deleteMany({ ownerOpenid: openid }),
        ExamResult.deleteMany({
            $or: [
                { userId: openid },
                { ownerOpenid: openid },
            ],
        }),
        ExamProgress.deleteMany({
            $or: [
                { userId: openid },
                { ownerOpenid: openid },
            ],
        }),
        UserQuestionState.deleteMany({ userId: openid }),
        removeUserAssignments([openid]),
    ]);

    success(res, null, 'Account deleted');
});

exports.getMajorCategories = asyncHandler(async (req, res) => {
    const list = await getVisibleMajorCategories();
    success(res, list);
});
