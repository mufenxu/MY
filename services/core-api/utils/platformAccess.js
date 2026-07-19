const CENTRAL_ROLE_LEVEL = Object.freeze({ viewer: 0, operator: 1, super_admin: 2 });
const LOCAL_ROLE_LEVEL = Object.freeze({ user: 0, admin: 1, super_admin: 2 });
const LOCAL_ROLE_BY_LEVEL = Object.freeze(['user', 'admin', 'super_admin']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function platformRoleAllowsRequest(role, method = 'GET') {
    if (!Object.hasOwn(CENTRAL_ROLE_LEVEL, role)) return false;
    return role !== 'viewer' || SAFE_METHODS.has(String(method || 'GET').toUpperCase());
}

function intersectPlatformAccess(platformRole, localUser = {}) {
    const centralLevel = CENTRAL_ROLE_LEVEL[platformRole];
    const localLevel = LOCAL_ROLE_LEVEL[localUser.role];
    if (!Number.isInteger(centralLevel) || !Number.isInteger(localLevel)) return null;

    const effectiveCentralLevel = platformRole === 'viewer' && localLevel >= LOCAL_ROLE_LEVEL.admin
        ? LOCAL_ROLE_LEVEL.admin
        : centralLevel;
    const role = LOCAL_ROLE_BY_LEVEL[Math.min(effectiveCentralLevel, localLevel)];
    const localPermissions = Array.isArray(localUser.permissions) ? localUser.permissions : [];
    return {
        role,
        localRole: localUser.role,
        centralRole: platformRole,
        permissions: platformRole === 'viewer'
            ? localPermissions.filter((permission) => String(permission).startsWith('view_'))
            : localPermissions,
    };
}

function applyEffectiveAccessToProfile(user, requestUser = {}) {
    const profile = typeof user?.toObject === 'function' ? user.toObject() : { ...(user || {}) };
    if (!requestUser.centralRole) return profile;
    return {
        ...profile,
        role: requestUser.role,
        permissions: requestUser.permissions || [],
        centralRole: requestUser.centralRole,
        localRole: requestUser.localRole,
    };
}

module.exports = { applyEffectiveAccessToProfile, intersectPlatformAccess, platformRoleAllowsRequest };
