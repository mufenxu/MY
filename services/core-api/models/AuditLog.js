const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    actorOpenid: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetId: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    result: { type: String, enum: ['success', 'failure'], default: 'success' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' },
    ts: { type: Number, default: Date.now, index: true }
}, { versionKey: false });

// 优化查询性能
auditLogSchema.index({ ts: -1 });
auditLogSchema.index({ actorOpenid: 1, ts: -1 });
auditLogSchema.index({ action: 1, ts: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
