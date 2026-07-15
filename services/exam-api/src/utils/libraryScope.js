const ADMIN_SCOPE = 'admin';
const DEMO_SCOPE = 'demo';
const PERSONAL_SCOPE = 'personal';

function buildScopeAssignment(scopeType, ownerOpenid = null) {
    return {
        scopeType,
        ownerOpenid: scopeType === PERSONAL_SCOPE ? ownerOpenid : null,
    };
}

function buildScopedQuery(scopeType, ownerOpenid = null) {
    const query = { scopeType };

    if (scopeType === PERSONAL_SCOPE) {
        query.ownerOpenid = ownerOpenid;
    }

    return query;
}

function buildAdminScopeQuery(extra = {}) {
    return {
        ...extra,
        $or: [
            { scopeType: ADMIN_SCOPE },
            { scopeType: null },
            { scopeType: { $exists: false } },
        ],
    };
}

function isAdminScopeValue(scopeType) {
    return scopeType === ADMIN_SCOPE || scopeType === null || scopeType === undefined;
}

function buildExactScopeQuery(scopeType, extra = {}) {
    return {
        scopeType,
        ...extra,
    };
}

module.exports = {
    ADMIN_SCOPE,
    DEMO_SCOPE,
    PERSONAL_SCOPE,
    buildScopeAssignment,
    buildScopedQuery,
    buildAdminScopeQuery,
    isAdminScopeValue,
    buildExactScopeQuery,
};
