const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

const ADMIN_ROLES = ['admin', 'super_admin'];

function isUsableAdmin(user) {
    return Boolean(
        user
        && ADMIN_ROLES.includes(user.role)
        && (!user.status || user.status === 'active')
    );
}

function buildPlatformUserId(mappedUserId) {
    const digest = crypto.createHash('sha256').update(mappedUserId).digest('hex').slice(0, 32);
    return `platform_sso_${digest}`;
}

async function resolvePlatformSsoUser({
    mappedUserId,
    UserModel = User,
    hashPassword = (password) => bcrypt.hash(password, 12),
    randomPassword = () => crypto.randomBytes(32).toString('base64url'),
} = {}) {
    const normalizedUserId = String(mappedUserId || '').trim();
    if (!normalizedUserId) return null;

    const existing = await UserModel.findOne({ userId: normalizedUserId }).lean();
    if (existing) return isUsableAdmin(existing) ? existing : null;

    const adminCount = await UserModel.countDocuments({ role: { $in: ADMIN_ROLES } });
    if (adminCount > 0) return null;

    const password = await hashPassword(randomPassword());
    try {
        await UserModel.create({
            _id: buildPlatformUserId(normalizedUserId),
            userId: normalizedUserId,
            nickName: 'Unified Platform Administrator',
            role: 'super_admin',
            permissions: [],
            password,
            status: 'active',
        });
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }

    const created = await UserModel.findOne({ userId: normalizedUserId }).lean();
    return isUsableAdmin(created) ? created : null;
}

module.exports = { isUsableAdmin, resolvePlatformSsoUser };
