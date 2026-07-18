const User = require('../models/User');

const ACCESS_CACHE_TTL_MS = Number(process.env.AUTHZ_CACHE_TTL_MS || 30000);
const accessCache = new Map();

function normalizeList(values) {
    if (!values) return [];
    return Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);
}

async function getUserAccess(req) {
    if (req.userAccess) return req.userAccess;

    // verifyToken already loaded the current database-backed authorization state.
    // Reuse it so permission removals cannot be hidden by this middleware's cache.
    if (req.user && req.user.role && Array.isArray(req.user.permissions) && req.user.status) {
        req.userAccess = {
            role: req.user.role,
            permissions: req.user.permissions,
            status: req.user.status,
        };
        return req.userAccess;
    }

    const userId = req.user && (req.user._id || req.user.id);
    if (!userId) return null;

    const now = Date.now();
    const cached = accessCache.get(String(userId));
    if (cached && now - cached.ts < ACCESS_CACHE_TTL_MS) {
        req.userAccess = cached.access;
        return cached.access;
    }

    const user = await User.findById(userId).select('role permissions status').lean();
    if (!user) return null;

    const access = {
        role: user.role || (req.user && req.user.role) || 'user',
        permissions: Array.isArray(user.permissions) ? user.permissions : [],
        status: user.status || 'active',
    };

    if (accessCache.size >= 1000) {
        const oldestKey = accessCache.keys().next().value;
        if (oldestKey !== undefined) {
            accessCache.delete(oldestKey);
        }
    }
    accessCache.set(String(userId), { access, ts: now });
    req.userAccess = access;
    return access;
}

function authorizeAccess(options = {}) {
    const allowedRoles = normalizeList(options.roles);
    const allowedPermissions = normalizeList(options.permissions);

    return async (req, res, next) => {
        try {
            const access = await getUserAccess(req);
            if (!access || access.status !== 'active') {
                return res.status(403).json({
                    success: false,
                    error: '账号无效或已被禁用',
                });
            }

            if (allowedRoles.includes(access.role)) {
                return next();
            }

            const permissions = new Set(access.permissions || []);
            const hasPermission = allowedPermissions.some(permission => permissions.has(permission));
            if (hasPermission) {
                return next();
            }

            return res.status(403).json({
                success: false,
                error: '权限不足',
            });
        } catch (err) {
            next(err);
        }
    };
}

function clearUserAccessCache(userId) {
    if (userId) {
        accessCache.delete(String(userId));
    }
}

function clearAllAccessCache() {
    accessCache.clear();
}

module.exports = authorizeAccess;
module.exports.clearCache = clearUserAccessCache;
module.exports.clearAll = clearAllAccessCache;
