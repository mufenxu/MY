const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

function protectSecretDocument(doc) {
    if (doc?.secretKey !== undefined && doc.secretKey !== null) doc.secretKey = encrypt(String(doc.secretKey));
}

function protectSecretUpdate(update) {
    if (!update) return;
    protectSecretDocument(update);
    protectSecretDocument(update.$set);
    protectSecretDocument(update.$setOnInsert);
}

const platformConfigSchema = new mongoose.Schema({
    platformCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uid: { type: String, default: '' },
    secretKey: {
        type: String,
        default: '',
        get: (value) => value ? decrypt(String(value)) : value,
        set: (value) => value ? encrypt(String(value)) : value,
    },
    status: { type: Boolean, default: true },
    remark: { type: String, default: '' },
    queryCount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    createTime: { type: Number, default: Date.now },
    updateTime: { type: Number, default: Date.now },
}, { versionKey: false });

platformConfigSchema.pre('save', function protectPlatformConfigSave() {
    protectSecretDocument(this);
    this.updateTime = Date.now();
});

platformConfigSchema.pre('insertMany', function protectPlatformConfigInsertMany(docs) {
    for (const doc of docs || []) protectSecretDocument(doc);
});

platformConfigSchema.pre('findOneAndUpdate', function protectPlatformConfigFindOneAndUpdate() {
    protectSecretUpdate(this.getUpdate());
});

platformConfigSchema.pre('updateOne', function protectPlatformConfigUpdateOne() {
    protectSecretUpdate(this.getUpdate());
});

module.exports = mongoose.model('PlatformConfig', platformConfigSchema);
