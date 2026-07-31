const Category = require('../models/Category');
const Cohort = require('../models/Cohort');
const LearningPlan = require('../models/LearningPlan');
const User = require('../models/User');
const { asyncHandler } = require('../utils/exam');
const { AppError, NotFoundError } = require('../utils/errors');
const { buildAdminScopeQuery } = require('../utils/libraryScope');
const { success } = require('../utils/response');
const {
    enrichLearningPlans,
    refreshPlansForCohort,
    resolvePlanAssignees,
    uniqueStrings,
} = require('../services/learningPlanService');

function actorId(req) {
    return String(req.user?.username || req.user?.id || '').trim();
}

function requestedStatus(value) {
    return value && value !== 'all' ? value : null;
}

function toCohortPayload(cohort, memberMap = new Map()) {
    const plain = typeof cohort.toObject === 'function' ? cohort.toObject() : { ...cohort };
    const memberOpenids = uniqueStrings(plain.memberOpenids);
    return {
        ...plain,
        memberOpenids,
        memberCount: memberOpenids.length,
        members: memberOpenids.map((openid) => memberMap.get(openid) || {
            openid,
            nickname: '',
            studyId: openid.slice(0, 8).toUpperCase(),
        }),
    };
}

async function loadMemberMap(cohorts) {
    const openids = uniqueStrings(cohorts.flatMap((cohort) => cohort.memberOpenids || []));
    if (openids.length === 0) return new Map();
    const users = await User.find({ openid: { $in: openids } })
        .select('openid nickname avatarUrl')
        .lean();
    return new Map(users.map((user) => [user.openid, {
        ...user,
        studyId: user.openid.slice(0, 8).toUpperCase(),
    }]));
}

async function assertUsersExist(openids) {
    const normalized = uniqueStrings(openids);
    if (normalized.length === 0) return normalized;
    const existing = await User.find({ openid: { $in: normalized } }).select('openid').lean();
    if (existing.length !== normalized.length) {
        throw new AppError('成员列表包含不存在的考生', 400);
    }
    return normalized;
}

async function assertCategoriesExist(categoryIds) {
    const normalized = uniqueStrings(categoryIds);
    if (normalized.length === 0) {
        throw new AppError('学习计划至少需要一份试卷', 400);
    }
    const categories = await Category.find(buildAdminScopeQuery({
        _id: { $in: normalized },
        isPublished: { $ne: false },
    })).select('_id').lean();
    if (categories.length !== normalized.length) {
        throw new AppError('学习计划包含不存在或未发布的试卷', 400);
    }
    return normalized;
}

async function buildPlanAssignments(input) {
    const directUserOpenids = await assertUsersExist(input.directUserOpenids || []);
    const requestedCohortIds = uniqueStrings(input.cohortIds || []);
    const assignees = await resolvePlanAssignees({ directUserOpenids, cohortIds: requestedCohortIds });
    if (assignees.cohortIds.length !== requestedCohortIds.length) {
        throw new AppError('学习计划包含不存在或已归档的班组', 400);
    }
    if (assignees.userOpenids.length === 0) {
        throw new AppError('学习计划至少需要一位考生', 400);
    }
    return assignees;
}

exports.getOptions = asyncHandler(async (req, res) => {
    const [categories, cohorts, users] = await Promise.all([
        Category.find(buildAdminScopeQuery({ isPublished: { $ne: false } }))
            .select('_id name majorCategoryId count passingScore')
            .populate('majorCategoryId', 'name sortOrder')
            .sort({ updateTime: -1, _id: -1 })
            .lean(),
        Cohort.find({ status: 'active' }).select('_id name memberOpenids').sort({ name: 1 }).lean(),
        User.find({}).select('openid nickname avatarUrl lastActiveTime').sort({ lastActiveTime: -1 }).limit(500).lean(),
    ]);
    success(res, {
        categories,
        cohorts: cohorts.map((cohort) => ({ ...cohort, memberCount: cohort.memberOpenids.length })),
        users: users.map((user) => ({
            ...user,
            studyId: user.openid.slice(0, 8).toUpperCase(),
        })),
    });
});

exports.listCohorts = asyncHandler(async (req, res) => {
    const status = requestedStatus(req.query.status);
    const cohorts = await Cohort.find(status ? { status } : {})
        .sort({ status: 1, updateTime: -1 })
        .lean();
    const memberMap = await loadMemberMap(cohorts);
    success(res, cohorts.map((cohort) => toCohortPayload(cohort, memberMap)));
});

exports.createCohort = asyncHandler(async (req, res) => {
    const memberOpenids = await assertUsersExist(req.body.memberOpenids || []);
    const cohort = await Cohort.create({
        name: req.body.name,
        description: req.body.description || '',
        memberOpenids,
        status: req.body.status || 'active',
        createdBy: actorId(req),
        updatedBy: actorId(req),
    });
    const memberMap = await loadMemberMap([cohort]);
    success(res, toCohortPayload(cohort, memberMap), '班组已创建');
});

exports.updateCohort = asyncHandler(async (req, res) => {
    const cohort = await Cohort.findById(req.params.id);
    if (!cohort) throw new NotFoundError('班组不存在');
    if (Object.prototype.hasOwnProperty.call(req.body, 'memberOpenids')) {
        cohort.memberOpenids = await assertUsersExist(req.body.memberOpenids);
    }
    ['name', 'description', 'status'].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) cohort[field] = req.body[field];
    });
    cohort.updatedBy = actorId(req);
    await cohort.save();
    await refreshPlansForCohort(cohort._id);
    const memberMap = await loadMemberMap([cohort]);
    success(res, toCohortPayload(cohort, memberMap), '班组已更新');
});

exports.archiveCohort = asyncHandler(async (req, res) => {
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, {
        status: 'archived',
        updatedBy: actorId(req),
    }, { new: true, runValidators: true });
    if (!cohort) throw new NotFoundError('班组不存在');
    await refreshPlansForCohort(cohort._id);
    success(res, cohort, '班组已归档');
});

exports.listLearningPlans = asyncHandler(async (req, res) => {
    const status = requestedStatus(req.query.status);
    const plans = await LearningPlan.find(status ? { status } : {})
        .populate('categoryIds', 'name count passingScore majorCategoryId')
        .populate('cohortIds', 'name status memberOpenids')
        .sort({ status: 1, dueAt: 1, updateTime: -1 })
        .limit(100)
        .lean();
    success(res, await enrichLearningPlans(plans));
});

exports.createLearningPlan = asyncHandler(async (req, res) => {
    const categoryIds = await assertCategoriesExist(req.body.categoryIds);
    const assignees = await buildPlanAssignments(req.body);
    const plan = await LearningPlan.create({
        title: req.body.title,
        description: req.body.description || '',
        categoryIds,
        ...assignees,
        dueAt: req.body.dueAt || null,
        targetScore: req.body.targetScore ?? 60,
        status: req.body.status || 'active',
        assignedAt: new Date(),
        createdBy: actorId(req),
        updatedBy: actorId(req),
    });
    success(res, plan, '学习计划已创建');
});

exports.updateLearningPlan = asyncHandler(async (req, res) => {
    const plan = await LearningPlan.findById(req.params.id);
    if (!plan) throw new NotFoundError('学习计划不存在');

    if (Object.prototype.hasOwnProperty.call(req.body, 'categoryIds')) {
        plan.categoryIds = await assertCategoriesExist(req.body.categoryIds);
    }
    const assignmentChanged = ['cohortIds', 'directUserOpenids']
        .some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (assignmentChanged) {
        const assignees = await buildPlanAssignments({
            cohortIds: req.body.cohortIds ?? plan.cohortIds,
            directUserOpenids: req.body.directUserOpenids ?? plan.directUserOpenids,
        });
        plan.cohortIds = assignees.cohortIds;
        plan.directUserOpenids = assignees.directUserOpenids;
        plan.userOpenids = assignees.userOpenids;
    }
    ['title', 'description', 'dueAt', 'targetScore', 'status'].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) plan[field] = req.body[field];
    });
    plan.updatedBy = actorId(req);
    await plan.save();
    success(res, plan, '学习计划已更新');
});

exports.archiveLearningPlan = asyncHandler(async (req, res) => {
    const plan = await LearningPlan.findByIdAndUpdate(req.params.id, {
        status: 'archived',
        updatedBy: actorId(req),
    }, { new: true, runValidators: true });
    if (!plan) throw new NotFoundError('学习计划不存在');
    success(res, plan, '学习计划已归档');
});

exports.listMyLearningPlans = asyncHandler(async (req, res) => {
    const plans = await LearningPlan.find({
        status: 'active',
        userOpenids: req.user.openid,
    })
        .select('-directUserOpenids -userOpenids -createdBy -updatedBy')
        .populate('categoryIds', 'name count duration passingScore majorCategoryId')
        .populate('cohortIds', 'name')
        .sort({ dueAt: 1, createTime: -1 })
        .lean();
    success(res, await enrichLearningPlans(plans, {
        includeUsers: true,
        userOpenid: req.user.openid,
    }));
});
