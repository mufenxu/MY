const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL 自动清理过期文档
    createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
