const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Admin = require('../models/Admin');

async function resolvePlatformSsoAdmin({
    mappedUsername,
    AdminModel = Admin,
    hashPassword = (password) => bcrypt.hash(password, 12),
    randomPassword = () => crypto.randomBytes(32).toString('base64url'),
} = {}) {
    const username = String(mappedUsername || '').trim();
    if (!username) return null;

    const existing = await AdminModel.findOne({ username }).lean();
    if (existing) return existing;

    if (await AdminModel.countDocuments() > 0) return null;

    const password = await hashPassword(randomPassword());
    try {
        await AdminModel.create({
            username,
            password,
            displayName: 'Unified Platform Administrator',
        });
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }

    return AdminModel.findOne({ username }).lean();
}

module.exports = { resolvePlatformSsoAdmin };
