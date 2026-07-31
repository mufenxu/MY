const ExamResult = require('../models/ExamResult');
const Cohort = require('../models/Cohort');
const LearningPlan = require('../models/LearningPlan');

function uniqueStrings(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
}

async function resolvePlanAssignees({ directUserOpenids = [], cohortIds = [] } = {}) {
    const normalizedCohortIds = uniqueStrings(cohortIds);
    const cohorts = normalizedCohortIds.length > 0
        ? await Cohort.find({ _id: { $in: normalizedCohortIds }, status: 'active' })
            .select('_id memberOpenids')
            .lean()
        : [];
    const cohortMembers = cohorts.flatMap((cohort) => cohort.memberOpenids || []);
    return {
        cohortIds: cohorts.map((cohort) => String(cohort._id)),
        directUserOpenids: uniqueStrings(directUserOpenids),
        userOpenids: uniqueStrings([...directUserOpenids, ...cohortMembers]),
    };
}

async function refreshPlansForCohort(cohortId) {
    const plans = await LearningPlan.find({ cohortIds: cohortId, status: 'active' });
    await Promise.all(plans.map(async (plan) => {
        const assignees = await resolvePlanAssignees({
            directUserOpenids: plan.directUserOpenids,
            cohortIds: plan.cohortIds,
        });
        plan.directUserOpenids = assignees.directUserOpenids;
        plan.userOpenids = assignees.userOpenids;
        await plan.save();
    }));
    return plans.length;
}

async function removeUsersFromLearningOperations(openids = []) {
    const normalized = uniqueStrings(openids);
    if (normalized.length === 0) return;
    await Promise.all([
        Cohort.updateMany(
            { memberOpenids: { $in: normalized } },
            { $pull: { memberOpenids: { $in: normalized } } },
        ),
        LearningPlan.updateMany(
            {
                $or: [
                    { directUserOpenids: { $in: normalized } },
                    { userOpenids: { $in: normalized } },
                ],
            },
            {
                $pull: {
                    directUserOpenids: { $in: normalized },
                    userOpenids: { $in: normalized },
                },
            },
        ),
    ]);
}

function summarizeLearningPlan(plan, resultRows = [], now = new Date(), includeUsers = false) {
    const categoryIds = uniqueStrings((plan.categoryIds || []).map((category) => category?._id || category));
    const userOpenids = uniqueStrings(plan.userOpenids);
    const targetScore = Number(plan.targetScore) || 0;
    const bestScoreMap = new Map();

    resultRows.forEach((result) => {
        const userOpenid = String(result.userId || '');
        const categoryId = String(result.categoryId?._id || result.categoryId || '');
        if (!userOpenid || !categoryId) return;
        const key = `${userOpenid}:${categoryId}`;
        bestScoreMap.set(key, Math.max(bestScoreMap.get(key) || 0, Number(result.score) || 0));
    });

    const dueAt = plan.dueAt ? new Date(plan.dueAt) : null;
    const duePassed = Boolean(dueAt && Number.isFinite(dueAt.getTime()) && dueAt.getTime() < now.getTime());
    const userProgress = userOpenids.map((userOpenid) => {
        const categories = categoryIds.map((categoryId) => {
            const bestScore = bestScoreMap.get(`${userOpenid}:${categoryId}`) || 0;
            return { categoryId, bestScore, completed: bestScore >= targetScore };
        });
        const completedCategoryCount = categories.filter((item) => item.completed).length;
        const progressPercent = categoryIds.length > 0
            ? Math.round((completedCategoryCount / categoryIds.length) * 100)
            : 0;
        const completed = categoryIds.length > 0 && completedCategoryCount === categoryIds.length;
        return {
            userOpenid,
            completedCategoryCount,
            totalCategoryCount: categoryIds.length,
            progressPercent,
            completed,
            overdue: duePassed && !completed,
            ...(includeUsers ? { categories } : {}),
        };
    });
    const completedCount = userProgress.filter((item) => item.completed).length;
    const overdueCount = userProgress.filter((item) => item.overdue).length;
    const averageProgress = userProgress.length > 0
        ? Math.round(userProgress.reduce((sum, item) => sum + item.progressPercent, 0) / userProgress.length)
        : 0;

    return {
        assignedCount: userOpenids.length,
        completedCount,
        overdueCount,
        averageProgress,
        state: plan.status === 'archived'
            ? 'archived'
            : (userProgress.length > 0 && completedCount === userProgress.length
                ? 'completed'
                : (overdueCount > 0 ? 'overdue' : 'active')),
        ...(includeUsers ? { users: userProgress } : {}),
    };
}

async function enrichLearningPlan(plan, { includeUsers = false, userOpenid = '' } = {}) {
    const plain = typeof plan.toObject === 'function' ? plan.toObject() : { ...plan };
    const userOpenids = userOpenid ? [userOpenid] : uniqueStrings(plain.userOpenids);
    const categoryIds = uniqueStrings((plain.categoryIds || []).map((category) => category?._id || category));
    const assignedAt = plain.assignedAt || plain.createTime || new Date(0);
    const results = userOpenids.length > 0 && categoryIds.length > 0
        ? await ExamResult.find({
            userId: { $in: userOpenids },
            categoryId: { $in: categoryIds },
            createTime: { $gte: assignedAt },
        }).select('userId categoryId score').lean()
        : [];
    const progressInput = { ...plain, userOpenids };
    return {
        ...plain,
        progress: summarizeLearningPlan(progressInput, results, new Date(), includeUsers),
    };
}

async function enrichLearningPlans(plans, options = {}) {
    return Promise.all(plans.map((plan) => enrichLearningPlan(plan, options)));
}

module.exports = {
    enrichLearningPlan,
    enrichLearningPlans,
    refreshPlansForCohort,
    removeUsersFromLearningOperations,
    resolvePlanAssignees,
    summarizeLearningPlan,
    uniqueStrings,
};
