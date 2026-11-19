const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    connected: { type: Boolean, default: false },
    maskedPhone: { type: String, default: '' },
    session: { type: String, default: '', select: false },
    draft: { type: String, default: '', select: false },
    draftExpiresAt: { type: Number, default: 0 },
    lastSmsAt: { type: Number, default: 0 },
    busyUntil: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('UnicomAccount', schema);
