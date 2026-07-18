const mongoose = require('mongoose');

const tuyaMessageReceiptSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    processedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
}, { versionKey: false });

tuyaMessageReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TuyaMessageReceipt', tuyaMessageReceiptSchema);
