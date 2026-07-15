const Category = require('../models/Category');
const MajorCategory = require('../models/MajorCategory');
const {
    DEMO_SCOPE,
    PERSONAL_SCOPE,
    buildAdminScopeQuery,
    isAdminScopeValue,
} = require('./libraryScope');
const { hasAdminCatalogAccess } = require('./adminAccess');
const {
    getAssignedMajorCategories,
    getAssignedCategories,
    getAssignedCategoryById,
} = require('./userAssignment');

function isVisibleMajorCategory(majorCategory) {
    return !majorCategory || majorCategory.showOnHome !== false;
}

function isVisibleCategory(category) {
    if (!category) {
        return false;
    }

    return category.scopeType === DEMO_SCOPE
        && category.isPublished !== false
        && isVisibleMajorCategory(category.majorCategoryId);
}

function isOwnedCategory(category, ownerOpenid) {
    if (!category) {
        return false;
    }

    const major = category.majorCategoryId;

    return category.scopeType === PERSONAL_SCOPE
        && category.ownerOpenid === ownerOpenid
        && category.isPublished !== false
        && (!major || (major.scopeType === PERSONAL_SCOPE && major.ownerOpenid === ownerOpenid));
}

function normalizeMajorId(majorCategoryId) {
    if (!majorCategoryId) {
        return '';
    }

    if (typeof majorCategoryId === 'string') {
        return majorCategoryId;
    }

    return String(majorCategoryId._id || majorCategoryId);
}

function dedupeById(list = []) {
    const seen = new Set();
    const result = [];

    for (const item of list) {
        const id = item && item._id ? String(item._id) : '';
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        result.push(item);
    }

    return result;
}

function markLibrarySource(item, librarySource) {
    if (!item) {
        return item;
    }

    return {
        ...item,
        librarySource,
    };
}

async function getVisibleMajorCategories() {
    return MajorCategory.find({
        scopeType: DEMO_SCOPE,
        showOnHome: { $ne: false },
    })
        .sort({ sortOrder: 1 })
        .lean();
}

async function getPublicCategories(filters = {}) {
    const { majorCategoryId, categoryId } = filters;
    const query = {
        scopeType: DEMO_SCOPE,
        isPublished: { $ne: false },
    };

    if (majorCategoryId) {
        query.majorCategoryId = majorCategoryId;
    }

    if (categoryId) {
        query._id = categoryId;
    }

    const categories = await Category.find(query)
        .populate('majorCategoryId', '_id name showOnHome scopeType ownerOpenid')
        .lean();

    return categories.filter(isVisibleCategory);
}

async function getPublicCategoryById(categoryId) {
    const categories = await getPublicCategories({ categoryId });
    return categories[0] || null;
}

async function getOwnedMajorCategories(ownerOpenid, options = {}) {
    const { includeHidden = false } = options;
    const query = {
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
    };
    if (!includeHidden) {
        query.showOnHome = { $ne: false };
    }

    return MajorCategory.find(query)
        .sort({ sortOrder: 1, createTime: 1 })
        .lean();
}

async function getOwnedCategories(filters = {}) {
    const { ownerOpenid, majorCategoryId, categoryId } = filters;
    const query = {
        scopeType: PERSONAL_SCOPE,
        ownerOpenid,
        isPublished: { $ne: false },
    };

    if (majorCategoryId) {
        query.majorCategoryId = majorCategoryId;
    }

    if (categoryId) {
        query._id = categoryId;
    }

    const categories = await Category.find(query)
        .populate('majorCategoryId', '_id name scopeType ownerOpenid')
        .lean();

    return categories.filter((category) => isOwnedCategory(category, ownerOpenid));
}

async function getOwnedCategoryById(categoryId, ownerOpenid) {
    const categories = await getOwnedCategories({ ownerOpenid, categoryId });
    return categories[0] || null;
}

async function getBoundAdminMajorCategories(ownerOpenid) {
    if (!(await hasAdminCatalogAccess(ownerOpenid))) {
        return [];
    }

    return MajorCategory.find(buildAdminScopeQuery({
        showOnHome: { $ne: false },
    }))
        .sort({ sortOrder: 1, createTime: 1 })
        .lean();
}

async function getBoundAdminCategories(filters = {}) {
    const { ownerOpenid, majorCategoryId, categoryId } = filters;
    if (!(await hasAdminCatalogAccess(ownerOpenid))) {
        return [];
    }

    const query = buildAdminScopeQuery({
        isPublished: { $ne: false },
    });

    if (majorCategoryId) {
        query.majorCategoryId = majorCategoryId;
    }

    if (categoryId) {
        query._id = categoryId;
    }

    const categories = await Category.find(query)
        .populate('majorCategoryId', '_id name sortOrder showOnHome scopeType ownerOpenid')
        .sort({ updateTime: -1, _id: -1 })
        .lean();

    return categories.filter((category) => isVisibleMajorCategory(category.majorCategoryId));
}

async function getBoundAdminCategoryById(categoryId, ownerOpenid) {
    const categories = await getBoundAdminCategories({ ownerOpenid, categoryId });
    return categories[0] || null;
}

async function getAccessibleMyMajorCategories(ownerOpenid, options = {}) {
    const { includeHidden = false } = options;
    const [ownedMajorCategories, boundAdminMajorCategories, assignedMajorCategories] = await Promise.all([
        getOwnedMajorCategories(ownerOpenid, { includeHidden }),
        getBoundAdminMajorCategories(ownerOpenid),
        getAssignedMajorCategories(ownerOpenid, { includeHidden }),
    ]);

    return dedupeById([
        ...ownedMajorCategories.map((item) => markLibrarySource(item, 'owned')),
        ...boundAdminMajorCategories.map((item) => markLibrarySource(item, 'owned')),
        ...assignedMajorCategories.map((item) => markLibrarySource(item, 'assigned')),
    ]).sort((a, b) => {
        const left = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
        const right = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
        if (left !== right) {
            return left - right;
        }
        return String(a._id).localeCompare(String(b._id));
    });
}

async function getAccessibleMyCategories(filters = {}) {
    const { ownerOpenid, majorCategoryId, categoryId } = filters;
    const [ownedCategories, boundAdminCategories, assignedCategories] = await Promise.all([
        getOwnedCategories({ ownerOpenid, majorCategoryId, categoryId }),
        getBoundAdminCategories({ ownerOpenid, majorCategoryId, categoryId }),
        getAssignedCategories({ userOpenid: ownerOpenid, majorCategoryId, categoryId }),
    ]);

    return dedupeById([
        ...ownedCategories.map((item) => markLibrarySource(item, 'owned')),
        ...boundAdminCategories.map((item) => markLibrarySource(item, 'owned')),
        ...assignedCategories.map((item) => markLibrarySource(item, 'assigned')),
    ]);
}

async function getAccessibleMyCategoryById(categoryId, ownerOpenid) {
    const [ownedCategory, boundAdminCategory, assignedCategory] = await Promise.all([
        getOwnedCategoryById(categoryId, ownerOpenid),
        getBoundAdminCategoryById(categoryId, ownerOpenid),
        getAssignedCategoryById(categoryId, ownerOpenid),
    ]);

    return ownedCategory
        || (boundAdminCategory ? markLibrarySource(boundAdminCategory, 'owned') : null)
        || (assignedCategory ? markLibrarySource(assignedCategory, 'assigned') : null)
        || null;
}

async function getAccessiblePracticeCategory(categoryId, ownerOpenid) {
    const category = await Category.findById(categoryId)
        .populate('majorCategoryId', '_id name showOnHome scopeType ownerOpenid')
        .lean();

    if (!category) {
        return null;
    }

    if (category.scopeType === DEMO_SCOPE) {
        return isVisibleCategory(category) ? category : null;
    }

    if (isOwnedCategory(category, ownerOpenid)) {
        return category;
    }

    if (isAdminScopeValue(category.scopeType) && await hasAdminCatalogAccess(ownerOpenid)) {
        return markLibrarySource(category, 'owned');
    }

    const assigned = await getAssignedCategoryById(categoryId, ownerOpenid);
    if (!assigned) {
        return null;
    }

    const categoryMajorId = normalizeMajorId(category.majorCategoryId);
    const assignedMajorId = normalizeMajorId(assigned.majorCategoryId);
    return categoryMajorId === assignedMajorId || !assigned.majorCategoryId ? category : null;
}

module.exports = {
    isVisibleCategory,
    isVisibleMajorCategory,
    getVisibleMajorCategories,
    getPublicCategories,
    getPublicCategoryById,
    getOwnedMajorCategories,
    getOwnedCategories,
    getOwnedCategoryById,
    getAccessibleMyMajorCategories,
    getAccessibleMyCategories,
    getAccessibleMyCategoryById,
    getAccessiblePracticeCategory,
};
