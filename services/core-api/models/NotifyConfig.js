const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const NOTIFY_SECRET_FIELDS = ['smtpPass', 'qywxApiKey'];

function protectSecretValue(value) {
    if (value === undefined || value === null) return value;
    return encrypt(String(value));
}

function revealSecretValue(value) {
    if (value === undefined || value === null) return value;
    return decrypt(String(value));
}

function protectNotifyDocument(doc) {
    if (!doc) return;
    for (const field of NOTIFY_SECRET_FIELDS) {
        if (doc[field] !== undefined) doc[field] = protectSecretValue(doc[field]);
    }
}

function protectNotifyUpdate(update) {
    if (!update) return;
    protectNotifyDocument(update);
    protectNotifyDocument(update.$set);
    protectNotifyDocument(update.$setOnInsert);
}

const protectedString = {
    type: String,
    default: '',
    get: revealSecretValue,
    set: protectSecretValue
};

const notifyConfigSchema = new mongoose.Schema({
    _id: String, // 'default'
    ownerId: { type: String, default: '', index: true },
    emailEnabled: Boolean,
    smtpUser: String,
    smtpPass: protectedString,
    smtpHost: String,
    smtpPort: String,
    toList: String,
    qywxEnabled: Boolean,
    qywxApiKey: protectedString,
    qywxToUser: String,
    qywxToParty: String,
    qywxToTag: String,
    qywxAgentId: String,
    advanceDays: String,
    updatedAt: Number,
    lastSentAt: Number
}, {
    versionKey: false,
    // Reminder jobs use toObject(); expose plaintext only inside the process.
    // Lean queries, including backup export, continue to receive ciphertext.
    toObject: { getters: true }
});

notifyConfigSchema.pre('save', function protectNotifySave() {
    protectNotifyDocument(this);
});

notifyConfigSchema.pre('insertMany', function protectNotifyInsertMany(docs) {
    for (const doc of docs || []) protectNotifyDocument(doc);
});

notifyConfigSchema.pre('findOneAndUpdate', function protectNotifyFindOneAndUpdate() {
    protectNotifyUpdate(this.getUpdate());
});

notifyConfigSchema.pre('updateOne', function protectNotifyUpdateOne() {
    protectNotifyUpdate(this.getUpdate());
});

module.exports = mongoose.model('NotifyConfig', notifyConfigSchema);
