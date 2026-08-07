const mongoose = require('mongoose');

const aliasSchema = new mongoose.Schema({
    id: { type: String, required: true },
    address: { type: String, required: true },
    normalizedAddress: { type: String, required: true },
    aliasType: { type: String, enum: ['plus', 'workspace', 'custom', 'other'], default: 'plus' },
    aliasStatus: { type: String, enum: ['candidate', 'confirmed', 'unavailable'], default: 'candidate' },
    openAiStatus: {
        type: String,
        enum: ['unregistered', 'registered', 'verification', 'abnormal', 'disabled', 'unknown'],
        default: 'unregistered'
    },
    registeredAt: { type: Number, default: null },
    lastVerifiedAt: { type: Number, default: null },
    note: { type: String, default: '' }
}, { _id: false, versionKey: false });

const accountSchema = new mongoose.Schema({
    id: { type: String, required: true },
    primaryEmail: { type: String, required: true },
    normalizedPrimaryEmail: { type: String, required: true },
    displayName: { type: String, default: '' },
    emailStatus: { type: String, enum: ['normal', 'attention', 'unavailable', 'unknown'], default: 'unknown' },
    note: { type: String, default: '' },
    lastCheckedAt: { type: Number, default: null },
    aliases: { type: [aliasSchema], default: [] }
}, { _id: false, versionKey: false });

const ledgerSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    accounts: { type: [accountSchema], default: [] },
    revision: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Number, default: Date.now }
}, { versionKey: false });

ledgerSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('GoogleAccountLedger', ledgerSchema);
