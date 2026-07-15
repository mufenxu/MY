const mongoose = require('mongoose');

const tuyaDeviceLogSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

// 建立复合索引优化历史曲线查询
tuyaDeviceLogSchema.index({ deviceId: 1, timestamp: -1 });

// TTL 索引：30 天后自动删除旧日志，防止集合无限增长
// MongoDB 后台线程每 60 秒检查一次并清理过期文档
tuyaDeviceLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('TuyaDeviceLog', tuyaDeviceLogSchema);
