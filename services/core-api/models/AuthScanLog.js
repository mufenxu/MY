const mongoose = require('mongoose');

const authScanLogSchema = new mongoose.Schema({
    appId: { type: String, required: true },
    appName: { type: String, required: true },
    userId: { type: String, ref: 'User', required: true },
    actionStatus: { type: String, enum: ['SCANNED', 'CONFIRMED', 'REJECTED', 'EXPIRED'], required: true },
    ip: { type: String, default: '' },
    device: { type: String, default: '' },
    createTime: { type: Number, default: Date.now },
    updateTime: { type: Number, default: Date.now }
}, { versionKey: false });

// Index for easier querying
authScanLogSchema.index({ appId: 1 });
authScanLogSchema.index({ userId: 1 });
authScanLogSchema.index({ createTime: -1 });

module.exports = mongoose.model('AuthScanLog', authScanLogSchema);
