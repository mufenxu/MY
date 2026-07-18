const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

function protectSecretValue(value) {
    if (value === undefined || value === null) return value;
    return encrypt(String(value));
}

function revealSecretValue(value) {
    if (value === undefined || value === null) return value;
    return decrypt(String(value));
}

function protectSecretDocument(doc) {
    if (doc && doc.secret_value !== undefined) {
        doc.secret_value = protectSecretValue(doc.secret_value);
    }
}

function protectSecretUpdate(update) {
    if (!update) return;
    protectSecretDocument(update);
    protectSecretDocument(update.$set);
    protectSecretDocument(update.$setOnInsert);
}

const SecretCacheSchema = new mongoose.Schema({
    secret_name: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    secret_value: {
        type: String,
        default: '',
        get: revealSecretValue,
        set: protectSecretValue
    },
    updated_by: {
        type: String,
        default: 'unknown'
    }
}, {
    timestamps: { createdAt: 'create_time', updatedAt: 'updated_at' }
});

SecretCacheSchema.pre('save', function protectSecretCacheSave() {
    protectSecretDocument(this);
});

SecretCacheSchema.pre('insertMany', function protectSecretCacheInsertMany(docs) {
    for (const doc of docs || []) protectSecretDocument(doc);
});

SecretCacheSchema.pre('findOneAndUpdate', function protectSecretCacheFindOneAndUpdate() {
    protectSecretUpdate(this.getUpdate());
});

SecretCacheSchema.pre('updateOne', function protectSecretCacheUpdateOne() {
    protectSecretUpdate(this.getUpdate());
});

module.exports = mongoose.model('SecretCache', SecretCacheSchema);
