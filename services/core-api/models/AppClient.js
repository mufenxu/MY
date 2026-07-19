const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

function protectSecretDocument(doc) {
    if (doc?.secret !== undefined && doc.secret !== null) doc.secret = encrypt(String(doc.secret));
}

function protectSecretUpdate(update) {
    if (!update) return;
    protectSecretDocument(update);
    protectSecretDocument(update.$set);
    protectSecretDocument(update.$setOnInsert);
}

const appClientSchema = new mongoose.Schema({
    appId: { type: String, required: true, unique: true }, // e.g., 'admin-web'
    appName: { type: String, required: true }, // e.g., '管理后台'
    domain: { type: String, default: '' }, // Allowed origin for CORS/Security
    secret: {
        type: String,
        select: false,
        get: (value) => value ? decrypt(String(value)) : value,
        set: (value) => value ? encrypt(String(value)) : value,
    }, // Client Secret for signature (future use)
    status: { type: String, default: 'active', enum: ['active', 'disabled'] },
    description: { type: String, default: '' },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now }
}, { versionKey: false });

appClientSchema.pre('save', function protectAppClientSave() {
    protectSecretDocument(this);
});

appClientSchema.pre('insertMany', function protectAppClientInsertMany(docs) {
    for (const doc of docs || []) protectSecretDocument(doc);
});

appClientSchema.pre('findOneAndUpdate', function protectAppClientFindOneAndUpdate() {
    protectSecretUpdate(this.getUpdate());
});

appClientSchema.pre('updateOne', function protectAppClientUpdateOne() {
    protectSecretUpdate(this.getUpdate());
});

module.exports = mongoose.model('AppClient', appClientSchema);
