const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    // Stores a SHA-256 digest. Legacy plaintext records remain readable during migration.
    token: { type: String, required: true, unique: true, index: true, select: false },
    userId: { type: String, required: true, index: true },
    familyId: {
        type: String,
        required: true,
        default: () => new mongoose.Types.ObjectId().toString(),
        index: true
    },
    status: { type: String, enum: ['active', 'used'], default: 'active', index: true },
    tokenVersion: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL 自动清理过期文档
    createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
