const mongoose = require('mongoose');

const notifyConfigSchema = new mongoose.Schema({
    _id: String, // 'default'
    emailEnabled: Boolean,
    smtpUser: String,
    smtpPass: String,
    smtpHost: String,
    smtpPort: String,
    toList: String,
    qywxEnabled: Boolean,
    qywxApiKey: String,
    qywxToUser: String,
    qywxToParty: String,
    qywxToTag: String,
    qywxAgentId: String,
    advanceDays: String,
    updatedAt: Number,
    lastSentAt: Number
}, { versionKey: false });

module.exports = mongoose.model('NotifyConfig', notifyConfigSchema);
