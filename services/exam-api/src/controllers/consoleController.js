const jwt = require('jsonwebtoken');
const config = require('../config');
const Category = require('../models/Category');
const Question = require('../models/Question');
const MajorCategory = require('../models/MajorCategory');
const ExamResult = require('../models/ExamResult');
const ExamProgress = require('../models/ExamProgress');
const ConsoleAccount = require('../models/ConsoleAccount');
const User = require('../models/User');
const UserQuestionState = require('../models/UserQuestionState');
const PaperShare = require('../models/PaperShare');
const PaperShareReceipt = require('../models/PaperShareReceipt');
const Feedback = require('../models/Feedback');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const { asyncHandler } = require('../utils/exam');
const { success } = require('../utils/response');
const { AuthError, AppError, NotFoundError, ForbiddenError } = require('../utils/errors');
const {
    PERSONAL_SCOPE,
    buildScopeAssignment,
} = require('../utils/libraryScope');
const { consumeTempAuthCode } = require('../utils/scanLogin');
const { replaceCategoryQuestions } = require('../utils/questionBatchSave');
const { getAccessibleMyMajorCategories } = require('../utils/publicCatalog');
const {
    getAssignedCategories,
    getAssignedCategoryById,
    updateAssignedMajorCategoryPreference,
} = require('../utils/userAssignment');
const { buildCategoryAnalysis } = require('../utils/categoryAnalysis');
const { setConsoleAuthCookie } = require('../utils/authCookies');
const { buildCookieAuthPayload } = require('../utils/authResponse');
const {
    toQuestionListSort,
    getNextQuestionSortOrder,
    resolveAnalysisSourceOnSave,
    getInvalidatedAiAnalysisQuestionIds,
} = require('../utils/questionOrder');

function getRequestContext(req) {
    return {
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    };
}

function buildConsoleToken(account) {
    return jwt.sign(
        {
            openid: account.openid,
            role: 'console',
            consoleRole: account.role,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn },
    );
}

async function ensureOwnedMajorCategory(majorCategoryId, ownerOpenid) {
    if (!majorCategoryId) {
        return null;
    }

    const majorCategory = await MajorCategory.findOne({
        _id: majorCategoryId,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!majorCategory) {
        throw new NotFoundError('题库分组不存在');
    }

    return majorCategory;
}

async function ensureOwnedCategory(categoryId, ownerOpenid) {
    const category = await Category.findOne({
        _id: categoryId,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    }).populate('majorCategoryId', 'name scopeType ownerOpenid');

    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    if (category.shareOrigin?.permission === 'view') {
        throw new ForbiddenError('只读分享试卷不能编辑题目内容');
    }

    return category;
}

async function ensureOwnedQuestion(questionId, ownerOpenid) {
    const question = await Question.findOne({
        _id: questionId,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!question) {
        throw new NotFoundError('题目不存在');
    }

    return question;
}

function markConsoleMajorCategory(item, ownerOpenid) {
    const readOnly = item.scopeType !== PERSONAL_SCOPE || item.ownerOpenid !== ownerOpenid;
    const accessType = item.librarySource || (readOnly ? 'assigned' : 'owned');
    return {
        ...item,
        readOnly,
        accessType,
        canUpdatePreferences: accessType === 'assigned',
    };
}

function markConsoleCategory(item, ownerOpenid) {
    const ownedByMe = item.scopeType === PERSONAL_SCOPE && item.ownerOpenid === ownerOpenid;
    const isSharedViewOnly = ownedByMe && item.shareOrigin?.permission === 'view';
    const readOnly = !ownedByMe || isSharedViewOnly;
    const isSharedCopy = ownedByMe && Boolean(item.shareOrigin?.shareId);
    return {
        ...item,
        readOnly,
        canMove: isSharedViewOnly,
        canDelete: ownedByMe,
        accessType: isSharedCopy ? 'shared' : (readOnly ? 'assigned' : 'owned'),
        shareAccess: isSharedCopy
            ? {
                permission: item.shareOrigin.permission,
                sourceCategoryId: item.shareOrigin.sourceCategoryId,
                sourceOwnerOpenid: item.shareOrigin.sourceOwnerOpenid,
                acceptedAt: item.shareOrigin.acceptedAt,
            }
            : null,
    };
}

function dedupeById(list = []) {
    const seen = new Set();
    return list.filter((item) => {
        const id = item?._id ? String(item._id) : '';
        if (!id || seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
}

function sortCategoriesForConsole(list = []) {
    return list.sort((a, b) => {
        const left = a.updateTime ? new Date(a.updateTime).getTime() : 0;
        const right = b.updateTime ? new Date(b.updateTime).getTime() : 0;
        if (left !== right) {
            return right - left;
        }
        return String(b._id).localeCompare(String(a._id));
    });
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

async function getConsoleCategories(ownerOpenid, filters = {}) {
    const ownedQuery = {
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    };
    if (filters.categoryId) {
        ownedQuery._id = filters.categoryId;
    }
    if (filters.majorCategoryId) {
        ownedQuery.majorCategoryId = filters.majorCategoryId;
    }

    const [ownedCategories, assignedCategories] = await Promise.all([
        Category.find(ownedQuery)
            .select('-__v')
            .populate('majorCategoryId', '_id name scopeType ownerOpenid')
            .lean(),
        getAssignedCategories({
            userOpenid: ownerOpenid,
            majorCategoryId: filters.majorCategoryId,
            categoryId: filters.categoryId,
        }),
    ]);

    return sortCategoriesForConsole(dedupeById([...ownedCategories, ...assignedCategories]));
}

async function getConsoleCategoryById(categoryId, ownerOpenid) {
    const [ownedCategory, assignedCategory] = await Promise.all([
        Category.findOne({
            _id: categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        })
            .select('-__v')
            .populate('majorCategoryId', '_id name scopeType ownerOpenid')
            .lean(),
        getAssignedCategoryById(categoryId, ownerOpenid),
    ]);

    return ownedCategory || assignedCategory || null;
}

const {
    normalizeShareCode,
    assertShareUsable,
    toSharePayload,
    generateUniqueShareCode,
    copySharedPaperToRecipient,
} = require('../services/paperShareService');
const { generateQuestionAnalysis } = require('../services/aiAnalysisService');
const {
    buildActorKey,
    beforeSingleGeneration,
    afterSingleGeneration,
    beforeBatchGeneration,
} = require('../services/aiGenerationGuard');

exports.wechatLogin = asyncHandler(async (req, res) => {
    const { tempAuthCode } = req.body;
    const { openid } = await consumeTempAuthCode(tempAuthCode, 'console_login', getRequestContext(req));
    const user = await User.findOne({ openid });
    if (!user) {
        throw new AuthError('请先在小程序完成登录后再扫码进入个人后台');
    }

    const now = new Date();

    let account = await ConsoleAccount.findOne({ openid });
    if (!account) {
        account = await ConsoleAccount.create({
            openid,
            role: 'creator',
            displayName: user.nickname || '我的题库',
            firstLoginAt: now,
            lastLoginAt: now,
            activatedByScan: true,
        });
    } else {
        if (account.status === 'disabled') {
            throw new ForbiddenError('该题库后台账号已被禁用');
        }

        if (!account.firstLoginAt) {
            account.firstLoginAt = now;
        }

        if (!account.displayName && user.nickname) {
            account.displayName = user.nickname;
        }

        account.lastLoginAt = now;
        await account.save();
    }

    const token = buildConsoleToken(account);
    setConsoleAuthCookie(res, token);

    success(res, {
        ...buildCookieAuthPayload(token),
        user: {
            openid,
            role: account.role,
            displayName: account.displayName || user.nickname || '我的题库',
            firstLoginAt: account.firstLoginAt,
            lastLoginAt: account.lastLoginAt,
            nickname: user.nickname || '',
        },
    }, '登录成功');
});

exports.getMe = asyncHandler(async (req, res) => {
    const account = await ConsoleAccount.findOne({ openid: req.user.openid });
    if (!account) {
        throw new NotFoundError('题库后台账号不存在');
    }

    const user = await User.findOne({ openid: req.user.openid }).lean();

    success(res, {
        openid: account.openid,
        role: account.role,
        displayName: account.displayName || user?.nickname || '我的题库',
        nickname: user?.nickname || '',
        firstLoginAt: account.firstLoginAt,
        lastLoginAt: account.lastLoginAt,
    });
});

exports.getOverview = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const [accessibleMajorCategories, accessibleCategories, practiceCount] = await Promise.all([
        getAccessibleMyMajorCategories(ownerOpenid, { includeHidden: true }),
        getConsoleCategories(ownerOpenid),
        ExamResult.countDocuments({ scopeType: PERSONAL_SCOPE, ownerOpenid }),
    ]);
    const questionCount = accessibleCategories.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const publishedCount = accessibleCategories.filter((item) => item.isPublished !== false).length;

    success(res, {
        counts: {
            majorCategories: accessibleMajorCategories.length,
            categories: accessibleCategories.length,
            questions: questionCount,
            publishedCategories: publishedCount,
            practiceRecords: practiceCount,
        },
    });
});

exports.getFeedbacks = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const query = { ownerOpenid };

    if (req.query.status) {
        query.status = req.query.status;
    }

    const [list, total] = await Promise.all([
        Feedback.find(query)
            .select('-__v')
            .sort({ updateTime: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Feedback.countDocuments(query),
    ]);

    success(res, { list, total, page, limit });
});

exports.getFeedbackSummary = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const unreadReplyCount = await Feedback.countDocuments({
        ownerOpenid,
        repliedAt: { $ne: null },
        $expr: {
            $lt: [
                { $ifNull: ['$replyReadAt', new Date(0)] },
                '$repliedAt',
            ],
        },
    });

    success(res, { unreadReplyCount });
});

exports.createFeedback = asyncHandler(async (req, res) => {
    const feedback = await Feedback.create({
        ownerOpenid: req.user.openid,
        category: req.body.category || 'other',
        title: req.body.title,
        content: req.body.content,
        contact: req.body.contact || '',
    });

    success(res, feedback, '反馈已提交');
});

exports.markFeedbackReplyRead = asyncHandler(async (req, res) => {
    const feedback = await Feedback.findOneAndUpdate(
        {
            _id: req.params.id,
            ownerOpenid: req.user.openid,
            repliedAt: { $ne: null },
        },
        { replyReadAt: new Date() },
        { new: true, runValidators: true },
    );

    if (!feedback) {
        throw new NotFoundError('反馈不存在或暂无新回复');
    }

    success(res, feedback, '已标记为已读');
});

exports.getMajorCategories = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const list = await getAccessibleMyMajorCategories(ownerOpenid, { includeHidden: true });

    success(res, list.map((item) => markConsoleMajorCategory(item, ownerOpenid)));
});

exports.createMajorCategory = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const item = await MajorCategory.create({
        ...req.body,
        ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
        showOnHome: req.body.showOnHome !== false,
    });

    success(res, item);
});

exports.updateMajorCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const item = await MajorCategory.findOneAndUpdate(
        {
            _id: id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        },
        req.body,
        { new: true, runValidators: true },
    );

    if (item) {
        return success(res, markConsoleMajorCategory(item.toJSON(), ownerOpenid));
    }

    const preferenceUpdates = {};
    if (typeof req.body.sortOrder === 'number') {
        preferenceUpdates.sortOrder = req.body.sortOrder;
    }
    if (typeof req.body.showOnHome === 'boolean') {
        preferenceUpdates.showOnHome = req.body.showOnHome;
    }

    const assignedItem = Object.keys(preferenceUpdates).length > 0
        ? await updateAssignedMajorCategoryPreference(ownerOpenid, id, preferenceUpdates)
        : null;
    if (!assignedItem) {
        throw new NotFoundError('题库分组不存在');
    }

    success(res, markConsoleMajorCategory({
        ...assignedItem,
        librarySource: 'assigned',
    }, ownerOpenid));
});

exports.deleteMajorCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;

    const count = await Category.countDocuments({
        majorCategoryId: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (count > 0) {
        throw new AppError('该分组下还有题库，不能直接删除', 400);
    }

    const deleted = await MajorCategory.findOneAndDelete({
        _id: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!deleted) {
        throw new NotFoundError('题库分组不存在');
    }

    success(res);
});

exports.getCategories = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const list = await getConsoleCategories(ownerOpenid);

    success(res, list.map((item) => markConsoleCategory(item, ownerOpenid)));
});

exports.getCategoryById = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const category = await getConsoleCategoryById(req.params.id, ownerOpenid);

    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    success(res, markConsoleCategory(category, ownerOpenid));
});

exports.getCategoryAnalysis = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;
    const category = await getConsoleCategoryById(req.params.id, ownerOpenid);

    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    const analysis = await buildCategoryAnalysis({
        ExamResult,
        category,
        query: {
            categoryId: req.params.id,
            userId: ownerOpenid,
        },
    });

    success(res, analysis);
});

exports.createCategory = asyncHandler(async (req, res) => {
    const ownerOpenid = req.user.openid;

    if (req.body.majorCategoryId) {
        await ensureOwnedMajorCategory(req.body.majorCategoryId, ownerOpenid);
    }

    const category = await Category.create({
        ...req.body,
        majorCategoryId: req.body.majorCategoryId || null,
        ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
    });

    success(res, category);
});

exports.updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;

    if (Object.prototype.hasOwnProperty.call(req.body, 'majorCategoryId') && req.body.majorCategoryId) {
        await ensureOwnedMajorCategory(req.body.majorCategoryId, ownerOpenid);
    }

    const current = await Category.findOne({
        _id: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!current) {
        throw new NotFoundError('题库不存在');
    }

    if (current.shareOrigin?.permission === 'view') {
        const invalidKeys = Object.keys(req.body).filter((key) => key !== 'majorCategoryId');
        if (invalidKeys.length > 0) {
            throw new ForbiddenError('只读分享试卷只能调整所属分组，不能修改试卷内容');
        }
    }

    const updatePayload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updatePayload, 'majorCategoryId')) {
        updatePayload.majorCategoryId = updatePayload.majorCategoryId || null;
    }

    const category = await Category.findOneAndUpdate(
        {
            _id: id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        },
        updatePayload,
        { new: true, runValidators: true },
    );

    success(res, category);
});

exports.deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;

    const oldQuestionIds = await Question.find({ categoryId: id, scopeType: PERSONAL_SCOPE, ownerOpenid })
        .select('_id')
        .lean();

    const category = await Category.findOneAndDelete({
        _id: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!category) {
        throw new NotFoundError('题库不存在');
    }

    await Promise.all([
        Question.deleteMany({ categoryId: id, scopeType: PERSONAL_SCOPE, ownerOpenid }),
        ExamProgress.deleteMany({ categoryId: id, scopeType: PERSONAL_SCOPE, ownerOpenid }),
        ExamResult.deleteMany({ categoryId: id, scopeType: PERSONAL_SCOPE, ownerOpenid }),
        UserQuestionState.deleteMany({ categoryId: id, userId: ownerOpenid }),
        PaperShare.deleteMany({ categoryId: id, ownerOpenid, sourceScopeType: PERSONAL_SCOPE }),
        PaperShareReceipt.deleteMany({ newCategoryId: id, recipientOpenid: ownerOpenid }),
        oldQuestionIds.length > 0
            ? AiQuestionAnalysis.deleteMany({
                questionId: { $in: oldQuestionIds.map((question) => String(question._id)) },
            })
            : Promise.resolve(),
    ]);

    success(res);
});

exports.getPaperShares = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const category = await Category.findOne({
        _id: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    }).lean();

    if (!category) {
        throw new NotFoundError('题库不存在');
    }
    if (category.shareOrigin?.permission === 'view') {
        throw new ForbiddenError('只读分享试卷不能继续分享');
    }

    const shares = await PaperShare.find({ categoryId: id, ownerOpenid, sourceScopeType: PERSONAL_SCOPE })
        .sort({ createTime: -1, _id: -1 })
        .lean();

    success(res, shares.map((item) => toSharePayload(item, req)));
});

exports.createPaperShare = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    await ensureOwnedCategory(id, ownerOpenid);

    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new AppError('有效期必须晚于当前时间', 400);
    }

    const share = await PaperShare.create({
        shareCode: await generateUniqueShareCode(),
        categoryId: id,
        ownerOpenid,
        sourceScopeType: PERSONAL_SCOPE,
        permission: req.body.permission || 'view',
        expiresAt,
        maxAcceptCount: req.body.maxAcceptCount || 0,
        note: req.body.note || '',
    });

    success(res, toSharePayload(share, req), '分享已生成');
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

    success(res, {
        created: result.created,
        share: toSharePayload(latestShare || share, req),
        category: markConsoleCategory(
            result.category.toObject ? result.category.toObject() : result.category,
            req.user.openid,
        ),
    }, result.created ? '分享接收成功' : '你已接收过该分享');
});

exports.revokePaperShare = asyncHandler(async (req, res) => {
    const share = await PaperShare.findOneAndUpdate(
        {
            _id: req.params.id,
            ownerOpenid: req.user.openid,
            sourceScopeType: PERSONAL_SCOPE,
        },
        { status: 'revoked' },
        { new: true },
    );

    if (!share) {
        throw new NotFoundError('分享不存在');
    }

    success(res, toSharePayload(share, req), '分享已撤销');
});

exports.getAllQuestions = asyncHandler(async (req, res) => {
    const { categoryId, page = 1, limit = 20, pageSize } = req.query;
    const actualLimit = parseInt(pageSize, 10) || parseInt(limit, 10);
    const actualPage = parseInt(page, 10);
    const ownerOpenid = req.user.openid;
    let query = {
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    };

    if (categoryId) {
        const category = await getConsoleCategoryById(categoryId, ownerOpenid);
        if (!category) {
            throw new NotFoundError('题库不存在');
        }

        query = { categoryId };
    }

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

    success(res, { list, total });
});

exports.getQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await ensureOwnedQuestion(id, req.user.openid);

    const record = await AiQuestionAnalysis.findOne({ questionId: String(id) })
        .select('_id questionId model analysis promptVersion viewCount lastGeneratedAt lastUsedAt createTime updateTime')
        .lean();

    success(res, record ? toAiAnalysisPayload(record) : null);
});

exports.deleteQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const question = await ensureOwnedQuestion(id, ownerOpenid);
    await ensureOwnedCategory(question.categoryId, ownerOpenid);

    await AiQuestionAnalysis.deleteOne({ questionId: String(id) });

    success(res, null, 'AI解析已删除');
});

exports.adoptQuestionAiAnalysis = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const question = await ensureOwnedQuestion(id, ownerOpenid);
    await ensureOwnedCategory(question.categoryId, ownerOpenid);

    const record = await AiQuestionAnalysis.findOne({ questionId: String(id) }).lean();
    if (!record) {
        throw new NotFoundError('AI解析不存在');
    }

    const updated = await Question.findOneAndUpdate(
        {
            _id: id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        },
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
    if (!['ops_admin', 'super_admin'].includes(req.user.consoleRole)) {
        throw new ForbiddenError('无权限批量生成 AI 解析');
    }

    const { id } = req.params;
    const { limit = 10, forceRefresh = false, questionIds = [] } = req.body;
    const ownerOpenid = req.user.openid;
    const actorKey = buildActorKey('console', ownerOpenid);
    const selectedQuestionIds = [...new Set(questionIds.map((item) => String(item)))];
    const hasSelectedQuestions = selectedQuestionIds.length > 0;
    const actualLimit = Math.min(limit, config.ai.batchMaxPerRun);
    await ensureOwnedCategory(id, ownerOpenid);

    const questions = await Question.find({
        categoryId: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
        ...(hasSelectedQuestions ? { _id: { $in: selectedQuestionIds } } : {}),
    })
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
                requesterOpenid: ownerOpenid,
                allowUpstream: true,
                beforeUpstream: () => beforeSingleGeneration(actorKey),
                afterUpstream: (result) => afterSingleGeneration(actorKey, result),
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
    const ownerOpenid = req.user.openid;
    await ensureOwnedCategory(req.body.categoryId, ownerOpenid);

    const question = await Question.create({
        ...req.body,
        ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
        sortOrder: await getNextQuestionSortOrder({
            categoryId: req.body.categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        }),
    });

    await Category.findByIdAndUpdate(question.categoryId, { $inc: { count: 1 } });
    success(res, question);
});

exports.updateQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const question = await ensureOwnedQuestion(id, ownerOpenid);
    await ensureOwnedCategory(question.categoryId, ownerOpenid);

    if (req.body.categoryId && String(req.body.categoryId) !== String(question.categoryId)) {
        await ensureOwnedCategory(req.body.categoryId, ownerOpenid);
    }

    const prevCategoryId = String(question.categoryId);
    const nextCategoryId = req.body.categoryId ? String(req.body.categoryId) : prevCategoryId;
    const nextSortOrder = prevCategoryId !== nextCategoryId
        ? await getNextQuestionSortOrder({
            categoryId: nextCategoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        })
        : question.sortOrder;

    const updated = await Question.findOneAndUpdate(
        {
            _id: id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        },
        {
            ...req.body,
            ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
            sortOrder: nextSortOrder,
            ...(Object.prototype.hasOwnProperty.call(req.body, 'analysis')
                && String(req.body.analysis || '').trim() !== String(question.analysis || '').trim()
                ? { analysisSource: 'manual' }
                : {}),
        },
        { new: true, runValidators: true },
    );

    if (!updated) {
        throw new NotFoundError('题目不存在');
    }

    if (prevCategoryId !== nextCategoryId) {
        await Promise.all([
            Category.findByIdAndUpdate(prevCategoryId, { $inc: { count: -1 } }),
            Category.findByIdAndUpdate(nextCategoryId, { $inc: { count: 1 } }),
        ]);
    }

    success(res, updated);
});

exports.deleteQuestion = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const question = await Question.findOne({
        _id: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    });

    if (!question) {
        throw new NotFoundError('题目不存在');
    }

    await ensureOwnedCategory(question.categoryId, ownerOpenid);
    await Promise.all([
        Question.deleteOne({ _id: id, scopeType: PERSONAL_SCOPE, ownerOpenid }),
        Category.findByIdAndUpdate(question.categoryId, { $inc: { count: -1 } }),
        AiQuestionAnalysis.deleteOne({ questionId: String(question._id) }),
    ]);
    success(res);
});

exports.batchUpdateQuestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ownerOpenid = req.user.openid;
    const { questions: questionsToSave } = req.body;

    await ensureOwnedCategory(id, ownerOpenid);

    const oldQuestions = await Question.find({
        categoryId: id,
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    })
        .select('_id type content options answer analysis analysisSource')
        .lean();
    const oldQuestionMap = new Map(oldQuestions.map((question) => [String(question._id), question]));
    const oldQuestionIdSet = new Set(oldQuestionMap.keys());

    const newQuestions = questionsToSave.map((q, index) => {
        const oldQuestion = q._id && oldQuestionIdSet.has(String(q._id))
            ? oldQuestionMap.get(String(q._id))
            : null;
        const nextQuestion = {
            ...(oldQuestion ? { _id: q._id } : {}),
            type: q.type,
            content: q.content,
            options: q.options,
            answer: q.answer,
            analysis: q.analysis,
            categoryId: id,
            sortOrder: index,
            ...buildScopeAssignment(PERSONAL_SCOPE, ownerOpenid),
        };

        return {
            ...nextQuestion,
            analysisSource: resolveAnalysisSourceOnSave(oldQuestion, nextQuestion),
        };
    });

    await replaceCategoryQuestions({
        questionQuery: {
            categoryId: id,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid,
        },
        categoryQuery: { _id: id, scopeType: PERSONAL_SCOPE, ownerOpenid },
        categoryUpdate: { count: newQuestions.length },
        questions: newQuestions,
        Category,
    });

    const invalidatedAiQuestionIds = getInvalidatedAiAnalysisQuestionIds(oldQuestions, newQuestions);
    if (invalidatedAiQuestionIds.length > 0) {
        await AiQuestionAnalysis.deleteMany({
            questionId: { $in: invalidatedAiQuestionIds },
        });
    }

    success(res, null, '批量保存成功');
});
