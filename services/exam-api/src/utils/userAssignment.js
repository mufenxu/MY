const mongoose = require('mongoose');
const MajorCategory = require('../models/MajorCategory');
const Category = require('../models/Category');
const UserAssignment = require('../models/UserAssignment');
const { buildAdminScopeQuery } = require('./libraryScope');

function toObjectIdStrings(list = []) {
    return [...new Set(
        list
            .map((item) => (item ? String(item) : ''))
            .filter(Boolean),
    )];
}

function toObjectIds(list = []) {
    return toObjectIdStrings(list).map((item) => new mongoose.Types.ObjectId(item));
}

function normalizeMajorCategoryPrefs(list = []) {
    const result = [];
    const seen = new Set();

    for (const item of Array.isArray(list) ? list : []) {
        const majorCategoryId = item?.majorCategoryId?._id
            ? String(item.majorCategoryId._id)
            : (item?.majorCategoryId ? String(item.majorCategoryId) : '');
        if (!majorCategoryId || seen.has(majorCategoryId)) {
            continue;
        }

        const pref = { majorCategoryId };
        if (typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)) {
            pref.sortOrder = item.sortOrder;
        }
        if (typeof item.showOnHome === 'boolean') {
            pref.showOnHome = item.showOnHome;
        }

        seen.add(majorCategoryId);
        result.push(pref);
    }

    return result;
}

function toPreferenceSubdocs(list = []) {
    return normalizeMajorCategoryPrefs(list).map((item) => ({
        majorCategoryId: new mongoose.Types.ObjectId(item.majorCategoryId),
        ...(typeof item.sortOrder === 'number' ? { sortOrder: item.sortOrder } : {}),
        ...(typeof item.showOnHome === 'boolean' ? { showOnHome: item.showOnHome } : {}),
    }));
}

function getMajorCategoryPrefMap(list = []) {
    return new Map(normalizeMajorCategoryPrefs(list).map((item) => [item.majorCategoryId, item]));
}

function applyAssignedMajorCategoryPreference(item, prefMap) {
    const id = item?._id ? String(item._id) : '';
    const pref = prefMap.get(id);
    return {
        ...item,
        sortOrder: typeof pref?.sortOrder === 'number'
            ? pref.sortOrder
            : (typeof item.sortOrder === 'number' ? item.sortOrder : 0),
        showOnHome: typeof pref?.showOnHome === 'boolean'
            ? pref.showOnHome
            : true,
    };
}

function sortMajorCategories(list = []) {
    return list.sort((a, b) => {
        const left = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
        const right = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
        if (left !== right) {
            return left - right;
        }
        return String(a._id).localeCompare(String(b._id));
    });
}

async function getUserAssignmentRecord(userOpenid) {
    if (!userOpenid) {
        return null;
    }

    return UserAssignment.findOne({ userOpenid }).lean();
}

async function getNormalizedUserAssignment(userOpenid) {
    const record = await getUserAssignmentRecord(userOpenid);
    if (!record) {
        return {
            userOpenid,
            majorCategoryIds: [],
            categoryIds: [],
            majorCategoryPrefs: [],
        };
    }

    return {
        userOpenid,
        majorCategoryIds: toObjectIdStrings(record.majorCategoryIds),
        categoryIds: toObjectIdStrings(record.categoryIds),
        majorCategoryPrefs: normalizeMajorCategoryPrefs(record.majorCategoryPrefs),
    };
}

async function getBatchNormalizedAssignments(userOpenids = []) {
    if (!Array.isArray(userOpenids) || userOpenids.length === 0) {
        return [];
    }

    const records = await UserAssignment.find({ userOpenid: { $in: userOpenids } }).lean();
    const recordMap = {};
    for (const record of records) {
        recordMap[record.userOpenid] = record;
    }

    return userOpenids.map((openid) => {
        const record = recordMap[openid];
        return {
            userOpenid: openid,
            majorCategoryIds: record ? toObjectIdStrings(record.majorCategoryIds) : [],
            categoryIds: record ? toObjectIdStrings(record.categoryIds) : [],
        };
    });
}

async function saveUserAssignment(userOpenid, majorCategoryIds = [], categoryIds = [], options = {}) {
    const nextMajorCategoryIds = toObjectIds(majorCategoryIds);
    const nextCategoryIds = toObjectIds(categoryIds);
    const update = {
        userOpenid,
        majorCategoryIds: nextMajorCategoryIds,
        categoryIds: nextCategoryIds,
    };

    if (Array.isArray(options.assignedMajorCategoryIds)) {
        const allowedMajorIds = new Set(toObjectIdStrings(options.assignedMajorCategoryIds));
        const existing = await getUserAssignmentRecord(userOpenid);
        const nextPrefs = normalizeMajorCategoryPrefs(existing?.majorCategoryPrefs)
            .filter((item) => allowedMajorIds.has(item.majorCategoryId));
        update.majorCategoryPrefs = toPreferenceSubdocs(nextPrefs);
    }

    const record = await UserAssignment.findOneAndUpdate(
        { userOpenid },
        update,
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        },
    ).lean();

    return {
        userOpenid,
        majorCategoryIds: toObjectIdStrings(record.majorCategoryIds),
        categoryIds: toObjectIdStrings(record.categoryIds),
        majorCategoryPrefs: normalizeMajorCategoryPrefs(record.majorCategoryPrefs),
    };
}

async function removeUserAssignments(userOpenids = []) {
    if (!Array.isArray(userOpenids) || userOpenids.length === 0) {
        return;
    }

    await UserAssignment.deleteMany({ userOpenid: { $in: userOpenids } });
}

async function buildAssignedCategoryAccess(userOpenid, options = {}) {
    const { includeHiddenMajorCategories = true } = options;
    const assignment = await getNormalizedUserAssignment(userOpenid);
    const assignedMajorCategoryIds = assignment.majorCategoryIds;
    const assignedCategoryIds = assignment.categoryIds;

    if (assignedMajorCategoryIds.length === 0 && assignedCategoryIds.length === 0) {
        return {
            assignment,
            majorCategories: [],
            categories: [],
        };
    }

    const adminCategoryScopeQuery = buildAdminScopeQuery();
    const categoryFilters = [];
    if (assignedCategoryIds.length > 0) {
        categoryFilters.push({ _id: { $in: toObjectIds(assignedCategoryIds) } });
    }
    if (assignedMajorCategoryIds.length > 0) {
        categoryFilters.push({ majorCategoryId: { $in: toObjectIds(assignedMajorCategoryIds) } });
    }

    const categoryQuery = {
        isPublished: { $ne: false },
        $and: [
            { $or: adminCategoryScopeQuery.$or },
            { $or: categoryFilters },
        ],
    };

    const categories = await Category.find(categoryQuery)
        .populate('majorCategoryId', '_id name sortOrder showOnHome scopeType ownerOpenid')
        .sort({ updateTime: -1, _id: -1 })
        .lean();

    const majorIdSet = new Set(assignedMajorCategoryIds);
    const attachedMajorIds = new Set();

    for (const category of categories) {
        const majorId = category.majorCategoryId?._id
            ? String(category.majorCategoryId._id)
            : (category.majorCategoryId ? String(category.majorCategoryId) : '');
        if (majorId) {
            attachedMajorIds.add(majorId);
        }
    }

    const allMajorIds = [...new Set([...majorIdSet, ...attachedMajorIds])];

    const prefMap = getMajorCategoryPrefMap(assignment.majorCategoryPrefs);
    const majorCategories = allMajorIds.length > 0
        ? await MajorCategory.find(buildAdminScopeQuery({
            _id: { $in: toObjectIds(allMajorIds) },
        }))
            .sort({ sortOrder: 1, _id: 1 })
            .lean()
        : [];
    const decoratedMajorCategories = sortMajorCategories(
        majorCategories
            .map((item) => applyAssignedMajorCategoryPreference(item, prefMap))
            .filter((item) => includeHiddenMajorCategories || item.showOnHome !== false),
    );
    const decoratedMajorMap = new Map(decoratedMajorCategories.map((item) => [String(item._id), item]));
    const decoratedCategories = categories.map((category) => {
        const majorId = category.majorCategoryId?._id
            ? String(category.majorCategoryId._id)
            : (category.majorCategoryId ? String(category.majorCategoryId) : '');
        const decoratedMajor = decoratedMajorMap.get(majorId)
            || (majorId ? applyAssignedMajorCategoryPreference(category.majorCategoryId, prefMap) : category.majorCategoryId);

        return {
            ...category,
            majorCategoryId: decoratedMajor,
        };
    });

    return {
        assignment,
        majorCategories: decoratedMajorCategories,
        categories: decoratedCategories,
    };
}

async function getAssignedMajorCategories(userOpenid, options = {}) {
    const { majorCategories } = await buildAssignedCategoryAccess(userOpenid, {
        includeHiddenMajorCategories: options.includeHidden !== false,
    });
    return majorCategories;
}

async function getAssignedCategories(filters = {}) {
    const { userOpenid, majorCategoryId, categoryId } = filters;
    const { categories } = await buildAssignedCategoryAccess(userOpenid);

    return categories.filter((category) => {
        const currentCategoryId = String(category._id);
        const currentMajorId = category.majorCategoryId?._id
            ? String(category.majorCategoryId._id)
            : (category.majorCategoryId ? String(category.majorCategoryId) : '');

        if (majorCategoryId && currentMajorId !== String(majorCategoryId)) {
            return false;
        }

        if (categoryId && currentCategoryId !== String(categoryId)) {
            return false;
        }

        return true;
    });
}

async function getAssignedCategoryById(categoryId, userOpenid) {
    const list = await getAssignedCategories({ userOpenid, categoryId });
    return list[0] || null;
}

async function getAssignedMajorCategoryById(majorCategoryId, userOpenid) {
    const list = await getAssignedMajorCategories(userOpenid, { includeHidden: true });
    return list.find((item) => String(item._id) === String(majorCategoryId)) || null;
}

async function updateAssignedMajorCategoryPreference(userOpenid, majorCategoryId, updates = {}) {
    const assignedMajorCategory = await getAssignedMajorCategoryById(majorCategoryId, userOpenid);
    if (!assignedMajorCategory) {
        return null;
    }

    const record = await UserAssignment.findOne({ userOpenid }).select('majorCategoryPrefs');
    if (!record) {
        return null;
    }

    const id = String(majorCategoryId);
    const prefs = normalizeMajorCategoryPrefs(record.majorCategoryPrefs);
    const currentIndex = prefs.findIndex((item) => item.majorCategoryId === id);
    const nextPref = currentIndex >= 0
        ? { ...prefs[currentIndex] }
        : { majorCategoryId: id };

    if (typeof updates.sortOrder === 'number' && Number.isFinite(updates.sortOrder)) {
        nextPref.sortOrder = updates.sortOrder;
    }
    if (typeof updates.showOnHome === 'boolean') {
        nextPref.showOnHome = updates.showOnHome;
    }

    if (currentIndex >= 0) {
        prefs[currentIndex] = nextPref;
    } else {
        prefs.push(nextPref);
    }

    record.majorCategoryPrefs = toPreferenceSubdocs(prefs);
    await record.save();

    return getAssignedMajorCategoryById(majorCategoryId, userOpenid);
}

module.exports = {
    getUserAssignmentRecord,
    getNormalizedUserAssignment,
    getBatchNormalizedAssignments,
    saveUserAssignment,
    removeUserAssignments,
    getAssignedMajorCategories,
    getAssignedMajorCategoryById,
    getAssignedCategories,
    getAssignedCategoryById,
    updateAssignedMajorCategoryPreference,
};
