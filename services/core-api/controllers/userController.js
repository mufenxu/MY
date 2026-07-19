const User = require('../models/User');
const Counter = require('../models/Counter');
const logAudit = require('../utils/auditLogger');
const asyncHandler = require('../middleware/asyncHandler');
const { escapeRegex } = require('../utils/helpers');
const { clearCache } = require('../middleware/authorizeAccess');
const { revokeAllRefreshTokens } = require('../services/authService');
const { acquirePrivilegedMutationLock } = require('../utils/privilegedMutationLock');
const { applyEffectiveAccessToProfile } = require('../utils/platformAccess');

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

async function ensureAnotherActiveSuperAdmin(targetId) {
    const count = await User.countDocuments({
        _id: { $ne: targetId },
        role: 'super_admin',
        $or: [
            { status: 'active' },
            { status: { $exists: false } },
            { status: null }
        ]
    });

    if (count === 0) {
        const error = new Error('Cannot remove or disable the last active super_admin.');
        error.statusCode = 409;
        throw error;
    }
}

// @desc    Get all users
// @route   GET /api/users
// @access  Private
exports.getUsers = asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 20, role, status, q } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (q) {
        const safeQ = escapeRegex(String(q));
        filter.$or = [
            { nickName: { $regex: safeQ, $options: 'i' } },
            { _id: { $regex: safeQ, $options: 'i' } },
            { userId: { $regex: safeQ, $options: 'i' } }
        ];
    }

    const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
            .sort({ updatedAt: -1 })
            .skip((pageNum - 1) * pageSizeNum)
            .limit(pageSizeNum)
            .select('_id openid userId nickName avatarUrl role permissions status lastLoginAt createdAt updatedAt')
            .lean()
    ]);

    res.json({ success: true, items: users, total });
});

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    res.json({ success: true, user: applyEffectiveAccessToProfile(user, req.user) });
});

// @desc    Update current user profile
// @route   PUT /api/users/me
// @access  Private
exports.updateMe = asyncHandler(async (req, res) => {
    const { nickName, avatarUrl } = req.body;
    const updateData = { updatedAt: Date.now() };
    if (nickName) updateData.nickName = nickName;
    if (avatarUrl) updateData.avatarUrl = avatarUrl;

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updateData }, { new: true });
    res.json({ success: true, user });
});

// @desc    Update user (Admin)
// @route   PUT /api/users/:id
// @access  Private
exports.updateUser = asyncHandler(async (req, res) => {
    const { role, status, nickName, permissions } = req.body;
    const actor = req.user;
    const targetId = req.params.id;
    const roleRequested = hasOwn(req.body, 'role');
    const permissionsRequested = hasOwn(req.body, 'permissions');

    if (actor.role !== 'super_admin' && (roleRequested || permissionsRequested)) {
        res.status(403);
        throw new Error('Only super_admin can change roles or permissions.');
    }

    const releaseMutationLock = await acquirePrivilegedMutationLock();
    let updateData;
    let user;
    try {
        const targetUser = await User.findById(targetId);
        if (!targetUser) {
            res.status(404);
            throw new Error('User not found.');
        }

        if (actor.role !== 'super_admin' && targetUser.role === 'super_admin') {
            res.status(403);
            throw new Error('Cannot modify super_admin.');
        }

        updateData = { updatedAt: Date.now() };

        if (roleRequested) updateData.role = role;
        if (hasOwn(req.body, 'status')) updateData.status = status;
        if (hasOwn(req.body, 'nickName')) updateData.nickName = nickName;
        if (permissionsRequested) updateData.permissions = permissions;

        const roleChanged = roleRequested && role !== targetUser.role;
        const currentStatus = targetUser.status || 'active';
        const statusChanged = hasOwn(req.body, 'status') && status !== currentStatus;
        const permissionsChanged = permissionsRequested
            && JSON.stringify(permissions || []) !== JSON.stringify(targetUser.permissions || []);
        const securityChanged = roleChanged || statusChanged || permissionsChanged;

        const removesActiveSuperAdmin = targetUser.role === 'super_admin'
            && currentStatus === 'active'
            && ((roleChanged && role !== 'super_admin') || (statusChanged && status !== 'active'));
        if (removesActiveSuperAdmin) {
            await ensureAnotherActiveSuperAdmin(targetId);
        }

        // UID Auto-fix: if current user doesn't have a numeric userId or it's too short (legacy '1', '2'), assign a new one
        if (!targetUser.userId || targetUser.userId.length < 5 || isNaN(Number(targetUser.userId))) {
            let counter = await Counter.findByIdAndUpdate(
                'userId',
                { $inc: { seq: 1 } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );

            // Self-healing: reset if low
            if (counter.seq < 10000) {
                counter = await Counter.findByIdAndUpdate(
                    'userId',
                    { $set: { seq: 10001 } },
                    { new: true }
                );
            }
            updateData.userId = String(counter.seq);
        }

        const update = { $set: updateData };
        if (securityChanged) update.$inc = { tokenVersion: 1 };
        user = await User.findByIdAndUpdate(targetId, update, { new: true });

        if (securityChanged) {
            await revokeAllRefreshTokens(targetId);
        }
    } finally {
        await releaseMutationLock();
    }

    // 主动清空鉴权缓存以使角色/权限变更立即生效
    clearCache(targetId);

    // Audit Log
    await logAudit(req, {
        action: 'USER_UPDATE',
        targetId,
        payload: updateData
    });

    res.json({ success: true, user });
});

// @desc    Delete user (Admin)
// @route   DELETE /api/users/:id
// @access  Private
exports.deleteUser = asyncHandler(async (req, res) => {
    const actor = req.user;
    const targetId = req.params.id;

    // Permission check: only super_admin can delete users
    if (actor.role !== 'super_admin') {
        res.status(403);
        throw new Error('Only super_admin can delete users.');
    }

    const releaseMutationLock = await acquirePrivilegedMutationLock();
    let targetUser;
    try {
        // Check if target user exists
        targetUser = await User.findById(targetId);
        if (!targetUser) {
            res.status(404);
            throw new Error('User not found.');
        }

        // Deleting a super admin is allowed only when another active one remains.
        if (targetUser.role === 'super_admin') {
            await ensureAnotherActiveSuperAdmin(targetId);
        }

        // Prevent self-deletion
        if (targetId === actor._id) {
            res.status(403);
            throw new Error('Cannot delete yourself.');
        }

        // Delete user
        await User.findByIdAndDelete(targetId);
        await revokeAllRefreshTokens(targetId);
    } finally {
        await releaseMutationLock();
    }

    // 清除已删除用户的鉴权缓存
    clearCache(targetId);

    // Audit Log
    await logAudit(req, {
        action: 'USER_DELETE',
        targetId,
        payload: { deletedUser: targetUser.nickName }
    });

    res.json({ success: true, message: 'User deleted successfully' });
});
