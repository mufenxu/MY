const Category = require('../models/Category');
const Question = require('../models/Question');
const QuestionVersion = require('../models/QuestionVersion');
const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const { asyncHandler } = require('../utils/exam');
const { success } = require('../utils/response');
const { ForbiddenError, NotFoundError } = require('../utils/errors');
const {
    ADMIN_SCOPE,
    DEMO_SCOPE,
    PERSONAL_SCOPE,
    buildAdminScopeQuery,
    buildExactScopeQuery,
} = require('../utils/libraryScope');
const {
    buildQuestionSnapshot,
    updateQuestionWithVersion,
} = require('../services/questionVersionService');
const { scanQuestionQuality } = require('../services/questionQualityService');

function normalizeManagedScope(value) {
    return value === DEMO_SCOPE ? DEMO_SCOPE : ADMIN_SCOPE;
}

function buildManagedQuery(scopeType, extra = {}) {
    return scopeType === DEMO_SCOPE
        ? buildExactScopeQuery(DEMO_SCOPE, extra)
        : buildAdminScopeQuery(extra);
}

function getActor(req, mode) {
    if (mode === 'console') {
        return {
            actorType: 'console',
            actorId: req.user.openid,
            actorName: req.user.consoleRole,
            requestId: req.id,
        };
    }

    return {
        actorType: 'admin',
        actorId: req.user.id,
        actorName: req.user.username,
        requestId: req.id,
    };
}

function getQuestionQuery(req, mode, extra = {}) {
    if (mode === 'console') {
        return {
            ...extra,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: req.user.openid,
        };
    }

    return buildManagedQuery(normalizeManagedScope(req.query.scopeType), extra);
}

function getVersionScope(question) {
    const scopeType = question.scopeType || ADMIN_SCOPE;
    return {
        scopeType,
        ownerOpenid: scopeType === PERSONAL_SCOPE ? String(question.ownerOpenid || '') : null,
    };
}

async function findAccessibleQuestion(req, mode, { editable = false } = {}) {
    const question = await Question.findOne(getQuestionQuery(req, mode, { _id: req.params.id }));
    if (!question) throw new NotFoundError('题目不存在');

    if (editable && mode === 'console') {
        const category = await Category.findOne({
            _id: question.categoryId,
            scopeType: PERSONAL_SCOPE,
            ownerOpenid: req.user.openid,
        }).select('_id shareOrigin.permission').lean();
        if (!category) throw new NotFoundError('题库不存在');
        if (category.shareOrigin?.permission === 'view') {
            throw new ForbiddenError('只读分享试卷不能回滚题目');
        }
    }

    return question;
}

async function ensureTargetCategory(req, mode, categoryId) {
    const categoryQuery = mode === 'console'
        ? { _id: categoryId, scopeType: PERSONAL_SCOPE, ownerOpenid: req.user.openid }
        : buildManagedQuery(normalizeManagedScope(req.query.scopeType), { _id: categoryId });
    const category = await Category.findOne(categoryQuery).select('_id shareOrigin.permission').lean();
    if (!category) throw new NotFoundError('版本中的题库已不存在或无权访问');
    if (mode === 'console' && category.shareOrigin?.permission === 'view') {
        throw new ForbiddenError('只读分享试卷不能回滚题目');
    }
    return category;
}

function listVersions(mode) {
    return asyncHandler(async (req, res) => {
        const question = await findAccessibleQuestion(req, mode);
        const { page = 1, limit = 20 } = req.query;
        const query = {
            questionId: question._id,
            ...getVersionScope(question),
        };
        const [list, total] = await Promise.all([
            QuestionVersion.find(query)
                .sort({ revision: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            QuestionVersion.countDocuments(query),
        ]);

        success(res, {
            list,
            total,
            page,
            limit,
            currentRevision: Number(question.revision) || 1,
            historyStarted: total > 0,
        });
    });
}

function getVersion(mode) {
    return asyncHandler(async (req, res) => {
        const question = await findAccessibleQuestion(req, mode);
        const version = await QuestionVersion.findOne({
            questionId: question._id,
            revision: req.params.revision,
            ...getVersionScope(question),
        }).lean();
        if (!version) throw new NotFoundError('题目版本不存在');
        success(res, version);
    });
}

function restoreVersion(mode) {
    return asyncHandler(async (req, res) => {
        const question = await findAccessibleQuestion(req, mode, { editable: true });
        const version = await QuestionVersion.findOne({
            questionId: question._id,
            revision: req.params.revision,
            ...getVersionScope(question),
        }).lean();
        if (!version) throw new NotFoundError('题目版本不存在');

        await ensureTargetCategory(req, mode, version.snapshot.categoryId);
        const previousCategoryId = String(question.categoryId);
        const nextCategoryId = String(version.snapshot.categoryId);
        const targetCategoryQuery = mode === 'console'
            ? { _id: nextCategoryId, scopeType: PERSONAL_SCOPE, ownerOpenid: req.user.openid }
            : buildManagedQuery(normalizeManagedScope(req.query.scopeType), { _id: nextCategoryId });
        const updated = await updateQuestionWithVersion({
            query: getQuestionQuery(req, mode, { _id: question._id }),
            update: buildQuestionSnapshot(version.snapshot),
            actor: getActor(req, mode),
            action: 'rollback',
            sourceRevision: Number(version.revision),
            afterUpdate: async ({ session }) => {
                const sessionOptions = session ? { session } : {};
                const targetCategory = previousCategoryId === nextCategoryId
                    ? await Category.findOne(targetCategoryQuery).session(session || null).select('_id').lean()
                    : await Category.findOneAndUpdate(
                        targetCategoryQuery,
                        { $inc: { count: 1 } },
                        sessionOptions,
                    );
                if (!targetCategory) throw new NotFoundError('版本中的题库已不存在或无权访问');

                if (previousCategoryId !== nextCategoryId) {
                    const previousCategory = await Category.findByIdAndUpdate(
                        previousCategoryId,
                        { $inc: { count: -1 } },
                        sessionOptions,
                    );
                    if (!previousCategory) throw new NotFoundError('题目原所属题库已不存在');
                }
                await AiQuestionAnalysis.deleteOne(
                    { questionId: String(question._id) },
                    sessionOptions,
                );
            },
        });
        if (!updated) throw new NotFoundError('题目不存在');

        success(res, updated, `已回滚到版本 ${version.revision}`);
    });
}

function getQuality(mode) {
    return asyncHandler(async (req, res) => {
        const {
            categoryId,
            page = 1,
            limit = 20,
            issue = '',
            staleDays = 365,
            scanLimit = 2000,
        } = req.query;

        if (categoryId) {
            const categoryQuery = mode === 'console'
                ? { _id: categoryId, scopeType: PERSONAL_SCOPE, ownerOpenid: req.user.openid }
                : buildManagedQuery(normalizeManagedScope(req.query.scopeType), { _id: categoryId });
            const category = await Category.findOne(categoryQuery).select('_id').lean();
            if (!category) throw new NotFoundError('题库不存在');
        }

        const query = getQuestionQuery(req, mode, categoryId ? { categoryId } : {});
        const result = await scanQuestionQuality({
            query,
            page,
            limit,
            issue,
            staleDays,
            scanLimit,
        });

        success(res, {
            ...result,
            scopeType: mode === 'console'
                ? PERSONAL_SCOPE
                : normalizeManagedScope(req.query.scopeType),
        });
    });
}

module.exports = {
    listManagedVersions: listVersions('manage'),
    getManagedVersion: getVersion('manage'),
    restoreManagedVersion: restoreVersion('manage'),
    getManagedQuality: getQuality('manage'),
    listConsoleVersions: listVersions('console'),
    getConsoleVersion: getVersion('console'),
    restoreConsoleVersion: restoreVersion('console'),
    getConsoleQuality: getQuality('console'),
};
