const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // openid or custom ID
    openid: { type: String, default: '', index: true },
    userId: { type: String, default: '', index: true },
    nickName: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    role: { type: String, default: 'user', enum: ['user', 'admin', 'super_admin'] },
    permissions: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
    password: { type: String, select: false }, // Hashed password for web login
    status: { type: String, default: 'active' },
    // 暴力破解防护
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Number, default: 0, select: false },
    lastLoginAt: { type: Number, default: Date.now },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now }
}, { _id: false, versionKey: false });

userSchema.index({ updatedAt: -1 });
userSchema.index({ status: 1, updatedAt: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
