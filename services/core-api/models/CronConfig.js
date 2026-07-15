const mongoose = require('mongoose');

const cronConfigSchema = new mongoose.Schema({
    _id: String, // 'default'
    schedule: String, // Cron 表达式
    enabled: Boolean,
    updatedAt: Number
}, { versionKey: false });

module.exports = mongoose.models.CronConfig || mongoose.model('CronConfig', cronConfigSchema);

