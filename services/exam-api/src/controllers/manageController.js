/**
 * Admin management controller
 * Default scope is admin, with optional explicit demo scope for example content maintenance.
 */
const Category = require('../models/Category');
const Question = require('../models/Question');
const ExamResult = require('../models/ExamResult');
const ExamProgress = require('../models/ExamProgress');
const MajorCategory = require('../models/MajorCategory');
const ConsoleAccount = require('../models/ConsoleAccount');
const User = require('../models/User');
const UserQuestionState = require('../models/UserQuestionState');
const PaperShare = require('../models/PaperShare');
const PaperShareReceipt = require('../models/PaperShareReceipt');
const Feedback = require('../models/Feedback');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const config = require('../config');
const { asyncHandler } = require('../utils/exam');
const { success } = require('../utils/response');
const { NotFoundError, AppError } = require('../utils/errors');
const { escapeRegex } = require('../utils/string');
const { recordAuditLog } = require('../middleware/auditLog');
const {
    ADMIN_SCOPE,
    DEMO_SCOPE,
    PERSONAL_SCOPE,
    buildScopeAssignment,
    buildAdminScopeQuery,
    buildExactScopeQuery,
} = require('../utils/libraryScope');
const {
    getNormalizedUserAssignment,
    getBatchNormalizedAssignments,
    saveUserAssignment,
    removeUserAssignments,
} = require('../utils/userAssignment');
const { cleanupAiAnalysesForDeletedUsers } = require('../utils/userDataCleanup');
const { saveCategoryQuestions } = require('../utils/questionBatchSave');
const {
    toSharePayload,
    generateUniqueShareCode,
    getAdminShareOwner,
} = require('../services/paperShareService');
const { generateQuestionAnalysis } = require('../services/aiAnalysisService');
const {
    buildActorKey,
    beforeSingleGeneration,
    afterSingleGeneration,
    beforeBatchGeneration,
} = require('../services/aiGenerationGuard');
const { buildCategoryAnalysis } = require('../utils/categoryAnalysis');
const {
    toQuestionListSort,
    getNextQuestionSortOrder,
} = require('../utils/questionOrder');

function buildFeedbackQuery({ status, keyword } = {}) {
    const query = {};

    if (status) {
        query.status = status;
    }

    if (keyword) {
        const safeKeyword = escapeRegex(keyword.trim());
        query.$or = [
            { title: { $regex: safeKeyword, $options: 'i' } },
            { content: { $regex: safeKeyword, $options: 'i' } },
            { contact: { $regex: safeKeyword, $options: 'i' } },
        ];
    }

    return query;
}

function formatStudyIdFromOpenid(openid) {
    return String(openid || '').slice(0, 8).toUpperCase();
}

function normalizeStudyId(value) {
    return String(value || '').trim().slice(0, 8).toUpperCase();
}

function normalizeManagedScope(scopeType) {
    return scopeType === DEMO_SCOPE ? DEMO_SCOPE : ADMIN_SCOPE;
}

function getManagedScopeType(req, fallback = ADMIN_SCOPE) {
    return normalizeManagedScope(req.body?.scopeType || req.query?.scopeType || fallback);
}

function buildManagedQuery(scopeType, extra = {}) {
    if (scopeType === DEMO_SCOPE) {
        return buildExactScopeQuery(DEMO_SCOPE, extra);
    }

    return buildAdminScopeQuery(extra);
}

function normalizeExamResultScope(scopeType) {
    return [ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE].includes(scopeType) ? scopeType : 'all';
}

function buildExamResultQuery(scopeType, extra = {}) {
    const normalizedScope = normalizeExamResultScope(scopeType);

    if (normalizedScope === ADMIN_SCOPE) {
        return buildAdminScopeQuery(extra);
    }

    if (normalizedScope === DEMO_SCOPE || normalizedScope === PERSONAL_SCOPE) {
        return buildExactScopeQuery(normalizedScope, extra);
    }

    return { ...extra };
}

function toAiAnalysisPayload(record) {
    return {
        _id: record._id,
        questionId: record.questionId,
        model: record.model,
        analysis: record.analysis,
        promptVersion: record.promptVersion,
        viewCount: record.viewCount || 0,
        lastGeneratedAt: record.lastGeneratedAt,
        lastUsedAt: record.lastUsedAt,
        createTime: record.createTime,
        updateTime: record.updateTime,
    };
}

function getCategoryMajorCategoryId(category) {
    const majorCategory = category.majorCategoryId;
    if (!majorCategory) {
        return null;
    }
    return majorCategory._id || majorCategory;
}

function buildOwnerUserMap(users = []) {
    return new Map(users.map((user) => [user.openid, user]));
}

function omitOwnerOpenid(record = {}) {
    const sanitized = { ...record };
    delete sanitized.ownerOpenid;
    return sanitized;
}

function sanitizeShareOrigin(shareOrigin) {
    if (!shareOrigin) return shareOrigin;

    const sanitized = { ...shareOrigin };
    delete sanitized.sourceOwnerOpenid;
    return sanitized;
}

function formatPersonalCategory(category, userMap = new Map()) {
    const ownerOpenid = category.ownerOpenid || '';
    const owner = userMap.get(ownerOpenid) || null;
    const safeCategory = omitOwnerOpenid(category);
    if (safeCategory.shareOrigin) {
        safeCategory.shareOrigin = sanitizeShareOrigin(safeCategory.shareOrigin);
    }
    const majorCategory = category.majorCategoryId && category.majorCategoryId._id
        ? {
            _id: category.majorCategoryId._id,
            name: category.majorCategoryId.name,
            sortOrder: category.majorCategoryId.sortOrder || 0,
        }
        : null;
    const isSharedCopy = Boolean(category.shareOrigin?.shareId);

    return {
        ...safeCategory,
        majorCategoryId: getCategoryMajorCategoryId(category),
        majorCategory,
        sourceType: isSharedCopy ? 'shared' : 'owned',
        sourceLabel: isSharedCopy ? '来自分享' : '用户创建',
        owner: {
            nickname: owner?.nickname || '',
            avatarUrl: owner?.avatarUrl || '',
            studyId: formatStudyIdFromOpenid(ownerOpenid),
        },
    };
}

function formatFeedbackForManagement(feedback, userMap = new Map()) {
    const ownerOpenid = feedback.ownerOpenid || '';
    const user = userMap.get(ownerOpenid) || null;
    const safeFeedback = omitOwnerOpenid(feedback);

    return {
        ...safeFeedback,
        ownerStudyId: formatStudyIdFromOpenid(ownerOpenid),
        user: {
            nickname: user?.nickname || '',
            avatarUrl: user?.avatarUrl || '',
            studyId: formatStudyIdFromOpenid(ownerOpenid),
        },
    };
}

async function findUsersForPersonalCategoryKeyword(keyword) {
    const safeKeyword = escapeRegex(keyword.trim());
    const studyId = normalizeStudyId(keyword);
    const orConditions = [
        { nickname: { $regex: safeKeyword, $options: 'i' } },
    ];

    if (studyId) {
        orConditions.push({
            openid: { $regex: `^${escapeRegex(studyId)}`, $options: 'i' },
        });
    }

    return User.find({
        $or: orConditions,
    })
        .select('openid')
        .limit(100)
        .lean();
}

async function buildPersonalCategoryQuery(filters = {}) {
    const {
        keyword,
        ownerStudyId,
        publishStatus = 'all',
        source = 'all',
    } = filters;
    const query = { scopeType: PERSONAL_SCOPE };
    const andConditions = [];

    if (ownerStudyId && ownerStudyId.trim()) {
        const safeStudyId = escapeRegex(normalizeStudyId(ownerStudyId));
        andConditions.push({
            ownerOpenid: { $regex: `^${safeStudyId}`, $options: 'i' },
        });
    }

    if (publishStatus === 'published') {
        query.isPublished = { $ne: false };
    } else if (publishStatus === 'hidden') {
        query.isPublished = false;
    }

    if (source === 'shared') {
        query['shareOrigin.shareId'] = { $exists: true, $ne: null };
    } else if (source === 'owned') {
        andConditions.push({
            $or: [
                { 'shareOrigin.shareId': null },
                { 'shareOrigin.shareId': { $exists: false } },
            ],
        });
    }

    if (keyword && keyword.trim()) {
        const safeKeyword = escapeRegex(keyword.trim());
        const matchedUsers = await findUsersForPersonalCategoryKeyword(keyword);
        andConditions.push({
            $or: [
                { name: { $regex: safeKeyword, $options: 'i' } },
                { ownerOpenid: { $in: matchedUsers.map((user) => user.openid) } },
            ],
        });
    }

    if (andConditions.length > 0) {
        query.$and = andConditions;
    }

    return query;
}

async function getPersonalCategoryOrFail(categoryId) {
    const category = await Category.findOne({
        _id: categoryId,
        scopeType: PERSONAL_SCOPE,
    })
        .select('-__v')
        .populate('majorCategoryId', '_id name sortOrder')
        .lean();

    if (!category) {
        throw new NotFoundError('个人题库不存在');
    }

    return category;
}

async function getPersonalCategoryOwnerMap(categories = []) {
    const openids = [...new Set(categories.map((item) => item.ownerOpenid).filter(Boolean))];
    const users = openids.length > 0
        ? await User.find({ openid: { $in: openids } }).select('openid nickname avatarUrl').lean()
        : [];
    return buildOwnerUserMap(users);
}

function auditPersonalCategoryRead(req, category, action) {
    recordAuditLog(req, {
        actorType: 'admin',
        routePath: `/api/manage/personal-categories/:id/${action}`,
        params: {
            id: String(category._id),
            ownerOpenid: category.ownerOpenid || '',
            categoryName: category.name || '',
        },
        query: {
            action,
        },
    });
}

exports.getAllQuestions = asyncHandler(async (req, res) => {
    const { categoryId, page = 1, limit = 20, pageSize } = req.query;
    const scopeType = getManagedScopeType(req);
    const actualLimit = parseInt(pageSize, 10) || parseInt(limit, 10);
    const actualPage = parseInt(page, 10);
    const query = buildManagedQuery(scopeType, categoryId ? { categoryId } : {});

    const [list, total] = await Promise.all([
        Question.find(query)
            .select('-__v')
            .populate('categoryId', 'name')
            .sort(toQuestionListSort(Boolean(categoryId)))
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        Question.countDocuments(query),
    ]);

    success(res, { list, total, scopeType });
});

exports.getQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const question = await Question.findOne(buildManagedQuery(scopeType, { _id: id })).select('_id').lean();
    if (!question) {
        throw new NotFoundError('题目不存在');
    }

    const record = await AiQuestionAnalysis.findOne({ questionId: String(id) })
        .select('_id questionId model analysis promptVersion viewCount lastGeneratedAt lastUsedAt createTime updateTime')
        .lean();

    success(res, record ? toAiAnalysisPayload(record) : null);
});

exports.deleteQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const question = await Question.findOne(buildManagedQuery(scopeType, { _id: id })).select('_id').lean();
    if (!question) {
        throw new NotFoundError('题目不存在');
    }

    await AiQuestionAnalysis.deleteOne({ questionId: String(id) });

    success(res, null, 'AI解析已删除');
});

exports.adoptQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const question = await Question.findOne(buildManagedQuery(scopeType, { _id: id })).select('_id').lean();
    if (!question) {
        throw new NotFoundError('题目不存在');
    }

    const record = await AiQuestionAnalysis.findOne({ questionId: String(id) }).lean();
    if (!record) {
        throw new NotFoundError('AI解析不存在');
    }

    const updated = await Question.findOneAndUpdate(
        buildManagedQuery(scopeType, { _id: id }),
        { analysis: record.analysis, analysisSource: 'ai' },
        { new: true, runValidators: true },
    ).lean();

    if (!updated) {
        throw new NotFoundError('题目不存在');
    }

    success(res, {
        _id: updated._id,
        analysis: updated.analysis || '',
        analysisSource: updated.analysisSource || 'manual',
    }, '已采纳为题库解析');
});

exports.generateCategoryAiAnalyses = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { limit = 10, forceRefresh = false, questionIds = [] } = req.body;
    const scopeType = getManagedScopeType(req);
    const actorKey = buildActorKey('admin', req.user.id || req.user.username);
    const selectedQuestionIds = [...new Set(questionIds.map((item) => String(item)))];
    const hasSelectedQuestions = selectedQuestionIds.length > 0;
    const actualLimit = Math.min(limit, config.ai.batchMaxPerRun);

    const category = await Category.findOne(buildManagedQuery(scopeType, { _id: id })).select('_id').lean();
    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    const questionQuery = buildManagedQuery(scopeType, {
        categoryId: id,
        ...(hasSelectedQuestions ? { _id: { $in: selectedQuestionIds } } : {}),
    });
    const questions = await Question.find(questionQuery)
        .select('_id categoryId scopeType ownerOpenid type content options answer analysis sortOrder')
        .sort(toQuestionListSort(true))
        .limit(1000)
        .lean();

    if (hasSelectedQuestions && questions.length !== selectedQuestionIds.length) {
        throw new NotFoundError('包含无效或无权访问的题目');
    }

    const targetQuestionIds = questions.map((question) => String(question._id));
    const existingRecords = forceRefresh || targetQuestionIds.length === 0
        ? []
        : await AiQuestionAnalysis.find({ questionId: { $in: targetQuestionIds } }).select('questionId').lean();
    const existingQuestionIdSet = new Set(existingRecords.map((item) => item.questionId));
    const availableTargets = forceRefresh
        ? questions
        : questions.filter((question) => !existingQuestionIdSet.has(String(question._id)));
    const targets = availableTargets.slice(0, actualLimit);

    const summary = {
        total: questions.length,
        generated: 0,
        skipped: questions.length - availableTargets.length,
        pending: Math.max(availableTargets.length - targets.length, 0),
        failed: 0,
        failures: [],
        selected: hasSelectedQuestions,
    };

    if (targets.length > 0) {
        await beforeBatchGeneration(actorKey);
    }

    for (const question of targets) {
        try {
            await generateQuestionAnalysis({
                question,
                forceRefresh,
                requesterOpenid: req.user.id,
                generationKey: actorKey,
                allowUpstream: true,
                beforeUpstream: () => beforeSingleGeneration(actorKey),
                afterUpstream: (result, reservation) => afterSingleGeneration(actorKey, result, reservation),
            });
            summary.generated += 1;
        } catch (error) {
            summary.failed += 1;
            if (summary.failures.length < 5) {
                summary.failures.push({
                    questionId: String(question._id),
                    message: error.message || '生成失败',
                });
            }
        }
    }

    success(res, summary, 'AI解析批量生成完成');
});

exports.createQuestion = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    const category = await Category.findOne(buildManagedQuery(scopeType, { _id: req.body.categoryId }));
    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    const question = await Question.create({
        ...req.body,
        ...buildScopeAssignment(scopeType),
        sortOrder: await getNextQuestionSortOrder(buildManagedQuery(scopeType, {
            categoryId: req.body.categoryId,
        })),
    });
    await Category.findByIdAndUpdate(question.categoryId, { $inc: { count: 1 } });
    success(res, question);
});

exports.updateQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const original = await Question.findOne(buildManagedQuery(scopeType, { _id: id }));
    if (!original) {
        throw new NotFoundError('题目不存在');
    }

    if (req.body.categoryId && String(req.body.categoryId) !== String(original.categoryId)) {
        const nextCategory = await Category.findOne(buildManagedQuery(scopeType, { _id: req.body.categoryId }));
        if (!nextCategory) {
            throw new NotFoundError('目标题库不存在');
        }
    }

    const nextCategoryId = req.body.categoryId ? String(req.body.categoryId) : String(original.categoryId);
    const nextSortOrder = String(original.categoryId) !== nextCategoryId
        ? await getNextQuestionSortOrder(buildManagedQuery(scopeType, { categoryId: nextCategoryId }))
        : original.sortOrder;
    const updated = await Question.findOneAndUpdate(
        buildManagedQuery(scopeType, { _id: id }),
        {
            ...req.body,
            ...buildScopeAssignment(scopeType),
            sortOrder: nextSortOrder,
            ...(Object.prototype.hasOwnProperty.call(req.body, 'analysis')
                && String(req.body.analysis || '').trim() !== String(original.analysis || '').trim()
                ? { analysisSource: 'manual' }
                : {}),
        },
        { new: true, runValidators: true },
    );

    if (String(original.categoryId) !== nextCategoryId) {
        await Promise.all([
            Category.findByIdAndUpdate(original.categoryId, { $inc: { count: -1 } }),
            Category.findByIdAndUpdate(nextCategoryId, { $inc: { count: 1 } }),
        ]);
    }

    success(res, updated);
});

exports.deleteQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const question = await Question.findOneAndDelete(buildManagedQuery(scopeType, { _id: id }));
    if (question) {
        await Promise.all([
            Category.findByIdAndUpdate(question.categoryId, { $inc: { count: -1 } }),
            AiQuestionAnalysis.deleteOne({ questionId: String(question._id) }),
        ]);
    }
    success(res);
});

exports.batchUpdateQuestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { questions: questionsToSave } = req.body;
    const scopeType = getManagedScopeType(req);

    const category = await Category.findOne(buildManagedQuery(scopeType, { _id: id }));
    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    const scopeAssignment = buildScopeAssignment(scopeType);
    await saveCategoryQuestions({
        questionsToSave,
        questionQuery: buildManagedQuery(scopeType, { categoryId: id }),
        categoryQuery: buildManagedQuery(scopeType, { _id: id }),
        categoryId: id,
        categoryUpdate: scopeAssignment,
        scopeAssignment,
        Category,
    });

    success(res, null, 'Batch update success');
});

exports.getExamResults = asyncHandler(async (req, res) => {
    const { categoryId, userId, page = 1, limit = 20 } = req.query;
    const scopeType = normalizeExamResultScope(req.query.scopeType);
    const actualLimit = parseInt(limit, 10);
    const actualPage = parseInt(page, 10);
    const query = buildExamResultQuery(scopeType);

    if (categoryId) query.categoryId = categoryId;
    if (userId) query.userId = userId;

    const [results, total] = await Promise.all([
        ExamResult.find(query)
            .select('_id userId categoryId categorySnapshot score correctCount totalCount createTime scopeType ownerOpenid')
            .populate('categoryId', 'name')
            .sort({ createTime: -1 })
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        ExamResult.countDocuments(query),
    ]);

    const userIds = [...new Set(results.map((item) => item.userId).filter(Boolean))];
    const users = await User.find({ openid: { $in: userIds } })
        .select('openid nickname avatarUrl')
        .lean();
    const userMap = {};
    for (const user of users) {
        userMap[user.openid] = user;
    }

    const formattedResults = results.map((item) => {
        const user = userMap[item.userId];
        return {
            ...item,
            categoryName: item.categorySnapshot?.name || item.categoryId?.name || '未命名试卷',
            nickname: user ? user.nickname : '未命名考生',
            avatarUrl: user ? user.avatarUrl : '',
        };
    });

    success(res, { list: formattedResults, total, scopeType });
});

exports.getCategoryAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const category = await Category.findOne(buildManagedQuery(scopeType, { _id: id })).lean();

    if (!category) {
        throw new NotFoundError('试卷不存在');
    }

    const analysis = await buildCategoryAnalysis({
        ExamResult,
        category,
        query: buildExamResultQuery(scopeType, { categoryId: id }),
    });

    success(res, analysis);
});

exports.deleteExamResults = asyncHandler(async (req, res) => {
    const { ids } = req.body;
    await ExamResult.deleteMany({ _id: { $in: ids } });
    success(res);
});

exports.getPersonalCategories = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        keyword,
        ownerStudyId,
        publishStatus,
        source,
    } = req.query;
    const actualPage = parseInt(page, 10);
    const actualLimit = parseInt(limit, 10);
    const query = await buildPersonalCategoryQuery({
        keyword,
        ownerStudyId,
        publishStatus,
        source,
    });

    const [list, total] = await Promise.all([
        Category.find(query)
            .select('-__v')
            .populate('majorCategoryId', '_id name sortOrder')
            .sort({ updateTime: -1, _id: -1 })
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        Category.countDocuments(query),
    ]);

    const userMap = await getPersonalCategoryOwnerMap(list);
    success(res, {
        list: list.map((item) => formatPersonalCategory(item, userMap)),
        total,
        page: actualPage,
        limit: actualLimit,
    });
});

exports.getPersonalCategoryById = asyncHandler(async (req, res) => {
    const category = await getPersonalCategoryOrFail(req.params.id);
    const [userMap, questionCount, practiceCount] = await Promise.all([
        getPersonalCategoryOwnerMap([category]),
        Question.countDocuments({
            categoryId: category._id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: category.ownerOpenid,
        }),
        ExamResult.countDocuments({
            categoryId: category._id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: category.ownerOpenid,
        }),
    ]);

    auditPersonalCategoryRead(req, category, 'inspect_personal_category');

    success(res, {
        category: formatPersonalCategory(category, userMap),
        stats: {
            questionCount,
            practiceCount,
        },
    });
});

exports.getPersonalCategoryQuestions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const actualPage = parseInt(page, 10);
    const actualLimit = parseInt(limit, 10);
    const category = await getPersonalCategoryOrFail(req.params.id);
    const query = {
        categoryId: category._id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid: category.ownerOpenid,
    };

    const [list, total, userMap] = await Promise.all([
        Question.find(query)
            .select('-__v')
            .sort(toQuestionListSort(true))
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        Question.countDocuments(query),
        getPersonalCategoryOwnerMap([category]),
    ]);

    auditPersonalCategoryRead(req, category, 'inspect_personal_questions');

    success(res, {
        category: formatPersonalCategory(category, userMap),
        list: list.map((item) => omitOwnerOpenid(item)),
        total,
        page: actualPage,
        limit: actualLimit,
    });
});

exports.getUsers = asyncHandler(async (req, res) => {
    const { keyword, page = 1, limit = 20 } = req.query;
    const actualLimit = parseInt(limit, 10);
    const actualPage = parseInt(page, 10);
    const query = {};

    if (keyword) {
        const safeKeyword = escapeRegex(keyword.trim());
        query.$or = [
            { nickname: { $regex: safeKeyword, $options: 'i' } },
            { openid: { $regex: safeKeyword, $options: 'i' } },
        ];
    }

    const [list, total] = await Promise.all([
        User.find(query)
            .select('openid nickname avatarUrl createTime lastActiveTime')
            .sort({ lastActiveTime: -1 })
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        User.countDocuments(query),
    ]);

    const openids = list.map((user) => user.openid);
    const [examCounts, assignmentRows] = openids.length > 0
        ? await Promise.all([
            ExamResult.aggregate([
                { $match: { userId: { $in: openids } } },
                { $group: { _id: '$userId', count: { $sum: 1 } } },
            ]),
            getBatchNormalizedAssignments(openids),
        ])
        : [[], []];

    const examCountMap = {};
    for (const item of examCounts) {
        examCountMap[item._id] = item.count;
    }

    const assignmentMap = {};
    for (const item of assignmentRows) {
        assignmentMap[item.userOpenid] = item;
    }

    const usersWithStats = list.map((user) => {
        const assignment = assignmentMap[user.openid] || {
            majorCategoryIds: [],
            categoryIds: [],
        };
        return {
            ...user,
            studyId: formatStudyIdFromOpenid(user.openid),
            examCount: examCountMap[user.openid] || 0,
            assignedMajorCategoryCount: assignment.majorCategoryIds.length,
            assignedCategoryCount: assignment.categoryIds.length,
        };
    });

    success(res, { list: usersWithStats, total });
});

exports.getFeedbacks = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, keyword } = req.query;
    const actualPage = parseInt(page, 10);
    const actualLimit = parseInt(limit, 10);
    const query = buildFeedbackQuery({ status, keyword });

    if (keyword) {
        const safeKeyword = escapeRegex(keyword.trim());
        const studyId = normalizeStudyId(keyword);
        const userConditions = [
            { nickname: { $regex: safeKeyword, $options: 'i' } },
        ];
        if (studyId) {
            userConditions.push({
                openid: { $regex: `^${escapeRegex(studyId)}`, $options: 'i' },
            });
        }
        const matchedUsers = await User.find({ $or: userConditions })
            .select('openid')
            .limit(100)
            .lean();
        if (matchedUsers.length > 0) {
            query.$or = query.$or || [];
            query.$or.push({ ownerOpenid: { $in: matchedUsers.map((user) => user.openid) } });
        }
    }

    const [list, total] = await Promise.all([
        Feedback.find(query)
            .select('-__v')
            .sort({ updateTime: -1, _id: -1 })
            .skip((actualPage - 1) * actualLimit)
            .limit(actualLimit)
            .lean(),
        Feedback.countDocuments(query),
    ]);

    const openids = [...new Set(list.map((item) => item.ownerOpenid).filter(Boolean))];
    const users = openids.length > 0
        ? await User.find({ openid: { $in: openids } }).select('openid nickname avatarUrl').lean()
        : [];
    const userMap = new Map(users.map((user) => [user.openid, user]));

    success(res, {
        list: list.map((item) => formatFeedbackForManagement(item, userMap)),
        total,
        page: actualPage,
        limit: actualLimit,
    });
});

exports.getFeedbackSummary = asyncHandler(async (req, res) => {
    const pendingCount = await Feedback.countDocuments({ status: 'open' });
    success(res, { pendingCount });
});

exports.replyFeedback = asyncHandler(async (req, res) => {
    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
        throw new NotFoundError('反馈不存在');
    }

    const now = new Date();
    feedback.replyContent = req.body.replyContent;
    feedback.repliedBy = req.user.id;
    feedback.repliedByName = req.user.username || '';
    feedback.repliedAt = now;
    feedback.replyReadAt = null;
    feedback.status = req.body.closeAfterReply ? 'closed' : 'replied';
    feedback.closedAt = req.body.closeAfterReply ? now : null;
    await feedback.save();

    success(res, feedback, '回复已保存');
});

exports.updateFeedbackStatus = asyncHandler(async (req, res) => {
    const update = {
        status: req.body.status,
        closedAt: req.body.status === 'closed' ? new Date() : null,
    };
    const feedback = await Feedback.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
    });

    if (!feedback) {
        throw new NotFoundError('反馈不存在');
    }

    success(res, feedback, '状态已更新');
});

exports.getUserDetails = asyncHandler(async (req, res) => {
    const { openid } = req.params;
    const user = await User.findOne({ openid })
        .select('openid nickname avatarUrl createTime lastActiveTime')
        .lean();

    if (!user) {
        throw new NotFoundError('用户不存在');
    }

    const scopeFilter = { userId: openid };

    const MAX_HISTORY = 200;

    const [aggregateResult, history] = await Promise.all([
        ExamResult.aggregate([
            { $match: scopeFilter },
            {
                $group: {
                    _id: null,
                    totalExams: { $sum: 1 },
                    avgScore: { $avg: '$score' },
                    highestScore: { $max: '$score' },
                    totalPass: {
                        $sum: {
                            $cond: [{ $gte: ['$score', 60] }, 1, 0],
                        },
                    },
                },
            },
        ]),
        ExamResult.find(scopeFilter)
            .select('categoryId categorySnapshot score correctCount totalCount createTime')
            .populate('categoryId', 'name')
            .sort({ createTime: -1 })
            .limit(MAX_HISTORY)
            .lean(),
    ]);

    const agg = aggregateResult[0] || { totalExams: 0, avgScore: 0, highestScore: 0, totalPass: 0 };
    const stats = {
        totalExams: agg.totalExams,
        avgScore: Math.round(agg.avgScore || 0),
        highestScore: agg.highestScore || 0,
        passRate: agg.totalExams > 0 ? Math.round((agg.totalPass / agg.totalExams) * 100) : 0,
    };

    const trendData = {
        labels: history.slice(0, 7).reverse().map((item) => new Date(item.createTime).toLocaleDateString()),
        scores: history.slice(0, 7).reverse().map((item) => item.score),
    };

    const formattedHistory = history.map((item) => ({
        ...item,
        categoryName: item.categorySnapshot?.name || item.categoryId?.name || '未命名试卷',
    }));

    success(res, {
        user: {
            ...user,
            studyId: formatStudyIdFromOpenid(user.openid),
        },
        stats,
        history: formattedHistory,
        trendData,
    });
});

exports.getUserAssignments = asyncHandler(async (req, res) => {
    const { openid } = req.params;
    const user = await User.findOne({ openid }).select('openid').lean();
    if (!user) {
        throw new NotFoundError('用户不存在');
    }

    const [assignment, majorCategories, categories] = await Promise.all([
        getNormalizedUserAssignment(openid),
        MajorCategory.find(buildAdminScopeQuery({}))
            .select('_id name sortOrder showOnHome')
            .sort({ sortOrder: 1, _id: 1 })
            .lean(),
        Category.find(buildAdminScopeQuery({ isPublished: { $ne: false } }))
            .select('_id name majorCategoryId isPublished count duration passingScore')
            .populate('majorCategoryId', 'name sortOrder showOnHome')
            .sort({ updateTime: -1, _id: -1 })
            .lean(),
    ]);

    success(res, {
        assignment,
        availableMajorCategories: majorCategories,
        availableCategories: categories,
    });
});

exports.updateUserAssignments = asyncHandler(async (req, res) => {
    const { openid } = req.params;
    const { majorCategoryIds = [], categoryIds = [] } = req.body;

    const user = await User.findOne({ openid }).select('openid').lean();
    if (!user) {
        throw new NotFoundError('用户不存在');
    }

    const [majorCount, categoryRows] = await Promise.all([
        majorCategoryIds.length > 0
            ? MajorCategory.countDocuments(buildAdminScopeQuery({ _id: { $in: majorCategoryIds } }))
            : 0,
        categoryIds.length > 0
            ? Category.find(buildAdminScopeQuery({ _id: { $in: categoryIds }, isPublished: { $ne: false } }))
                .select('_id majorCategoryId')
                .lean()
            : [],
    ]);

    if (majorCategoryIds.length > 0 && majorCount !== majorCategoryIds.length) {
        throw new AppError('包含无效的科目分配', 400);
    }

    if (categoryIds.length > 0 && categoryRows.length !== categoryIds.length) {
        throw new AppError('包含无效的试卷分配', 400);
    }

    const nextMajorIds = [...new Set(majorCategoryIds.map((item) => String(item)))];
    const nextCategoryIds = [...new Set(categoryRows.map((item) => String(item._id)))];
    const assignedMajorCategoryIds = [...new Set([
        ...nextMajorIds,
        ...categoryRows
            .map((item) => (item.majorCategoryId ? String(item.majorCategoryId) : ''))
            .filter(Boolean),
    ])];

    const assignment = await saveUserAssignment(openid, nextMajorIds, nextCategoryIds, {
        assignedMajorCategoryIds,
    });
    success(res, assignment, '分配保存成功');
});

exports.deleteUsers = asyncHandler(async (req, res) => {
    const { openids } = req.body;
    await cleanupAiAnalysesForDeletedUsers(openids);

    await Promise.all([
        User.deleteMany({ openid: { $in: openids } }),
        ConsoleAccount.deleteMany({ openid: { $in: openids } }),
        MajorCategory.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: { $in: openids } }),
        Category.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: { $in: openids } }),
        Question.deleteMany({ scopeType: PERSONAL_SCOPE, ownerOpenid: { $in: openids } }),
        PaperShare.deleteMany({ ownerOpenid: { $in: openids } }),
        PaperShareReceipt.deleteMany({
            $or: [
                { ownerOpenid: { $in: openids } },
                { recipientOpenid: { $in: openids } },
            ],
        }),
        Feedback.deleteMany({ ownerOpenid: { $in: openids } }),
        ExamResult.deleteMany({
            $or: [
                { userId: { $in: openids } },
                { ownerOpenid: { $in: openids } },
            ],
        }),
        ExamProgress.deleteMany({
            $or: [
                { userId: { $in: openids } },
                { ownerOpenid: { $in: openids } },
            ],
        }),
        UserQuestionState.deleteMany({ userId: { $in: openids } }),
        removeUserAssignments(openids),
    ]);
    success(res);
});

exports.clearUserRecords = asyncHandler(async (req, res) => {
    const { openid } = req.params;
    await Promise.all([
        ExamResult.deleteMany({ userId: openid }),
        ExamProgress.deleteMany({ userId: openid }),
        UserQuestionState.deleteMany({ userId: openid }),
    ]);
    success(res);
});

exports.getCategories = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    const list = await Category.find(buildManagedQuery(scopeType))
        .select('-__v')
        .populate('majorCategoryId', 'name')
        .sort({ updateTime: -1 })
        .lean();
    success(res, list);
});

exports.getCategoryById = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    const category = await Category.findOne(buildManagedQuery(scopeType, { _id: req.params.id }))
        .select('-__v')
        .lean();
    if (!category) {
        throw new NotFoundError('分类不存在');
    }
    success(res, category);
});

exports.createCategory = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    if (req.body.majorCategoryId) {
        const majorCategory = await MajorCategory.findOne(buildManagedQuery(scopeType, { _id: req.body.majorCategoryId }));
        if (!majorCategory) {
            throw new NotFoundError('大分类不存在');
        }
    }

    const category = await Category.create({
        ...req.body,
        majorCategoryId: req.body.majorCategoryId || null,
        ...buildScopeAssignment(scopeType),
    });
    success(res, category);
});

exports.updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);

    if (Object.prototype.hasOwnProperty.call(req.body, 'majorCategoryId') && req.body.majorCategoryId) {
        const majorCategory = await MajorCategory.findOne(buildManagedQuery(scopeType, { _id: req.body.majorCategoryId }));
        if (!majorCategory) {
            throw new NotFoundError('大分类不存在');
        }
    }

    const category = await Category.findOneAndUpdate(
        buildManagedQuery(scopeType, { _id: id }),
        {
            ...req.body,
            majorCategoryId: req.body.majorCategoryId || null,
            ...buildScopeAssignment(scopeType),
        },
        { new: true, runValidators: true },
    );

    if (!category) {
        throw new NotFoundError('分类不存在');
    }
    success(res, category);
});

exports.deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const oldQuestionIds = await Question.find(buildManagedQuery(scopeType, { categoryId: id }))
        .select('_id')
        .lean();
    await Question.deleteMany(buildManagedQuery(scopeType, { categoryId: id }));
    await ExamProgress.deleteMany(buildManagedQuery(scopeType, { categoryId: id }));
    await ExamResult.deleteMany(buildManagedQuery(scopeType, { categoryId: id }));
    await UserQuestionState.deleteMany({ categoryId: id });
    if (oldQuestionIds.length > 0) {
        await AiQuestionAnalysis.deleteMany({
            questionId: { $in: oldQuestionIds.map((question) => String(question._id)) },
        });
    }
    if (scopeType === ADMIN_SCOPE) {
        await PaperShare.deleteMany({ categoryId: id, sourceScopeType: ADMIN_SCOPE });
    }
    await Category.findOneAndDelete(buildManagedQuery(scopeType, { _id: id }));
    success(res);
});

exports.getPaperShares = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    if (scopeType !== ADMIN_SCOPE) {
        throw new AppError('示例题库不支持分享', 400);
    }

    const category = await Category.findOne(buildManagedQuery(ADMIN_SCOPE, { _id: id })).lean();
    if (!category) {
        throw new NotFoundError('试卷不存在');
    }

    const shares = await PaperShare.find({
        categoryId: id,
        ownerOpenid: getAdminShareOwner(req),
        sourceScopeType: ADMIN_SCOPE,
    })
        .sort({ createTime: -1, _id: -1 })
        .lean();

    success(res, shares.map((item) => toSharePayload(item, req)));
});

exports.createPaperShare = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    if (scopeType !== ADMIN_SCOPE) {
        throw new AppError('示例题库不支持分享', 400);
    }

    const category = await Category.findOne(buildManagedQuery(ADMIN_SCOPE, { _id: id })).lean();
    if (!category) {
        throw new NotFoundError('试卷不存在');
    }

    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new AppError('有效期必须晚于当前时间', 400);
    }

    const share = await PaperShare.create({
        shareCode: await generateUniqueShareCode(),
        categoryId: id,
        ownerOpenid: getAdminShareOwner(req),
        sourceScopeType: ADMIN_SCOPE,
        permission: req.body.permission || 'view',
        expiresAt,
        maxAcceptCount: req.body.maxAcceptCount || 0,
        note: req.body.note || '',
    });

    success(res, toSharePayload(share, req), '分享已生成');
});

exports.revokePaperShare = asyncHandler(async (req, res) => {
    const share = await PaperShare.findOneAndUpdate(
        {
            _id: req.params.id,
            ownerOpenid: getAdminShareOwner(req),
            sourceScopeType: ADMIN_SCOPE,
        },
        { status: 'revoked' },
        { new: true },
    );

    if (!share) {
        throw new NotFoundError('分享不存在');
    }

    success(res, toSharePayload(share, req), '分享已撤销');
});

exports.getMajorCategories = asyncHandler(async (req, res) => {
    const { all } = req.query;
    const scopeType = getManagedScopeType(req);
    const query = buildManagedQuery(scopeType, all === 'true' ? {} : { showOnHome: { $ne: false } });
    const list = await MajorCategory.find(query)
        .select('-__v')
        .sort({ sortOrder: 1 })
        .lean();
    success(res, list);
});

exports.createMajorCategory = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    const item = await MajorCategory.create({
        ...req.body,
        ...buildScopeAssignment(scopeType),
    });
    success(res, item);
});

exports.updateMajorCategory = asyncHandler(async (req, res) => {
    const scopeType = getManagedScopeType(req);
    const item = await MajorCategory.findOneAndUpdate(
        buildManagedQuery(scopeType, { _id: req.params.id }),
        {
            ...req.body,
            ...buildScopeAssignment(scopeType),
        },
        { new: true, runValidators: true },
    );

    if (!item) {
        throw new NotFoundError('大分类不存在');
    }
    success(res, item);
});

exports.deleteMajorCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scopeType = getManagedScopeType(req);
    const count = await Category.countDocuments(buildManagedQuery(scopeType, { majorCategoryId: id }));
    if (count > 0) {
        throw new AppError('无法删除：该大分类下还有子分类', 400);
    }

    await MajorCategory.findOneAndDelete(buildManagedQuery(scopeType, { _id: id }));
    success(res);
});
