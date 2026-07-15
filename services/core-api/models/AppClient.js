const mongoose = require('mongoose');

const appClientSchema = new mongoose.Schema({
    appId: { type: String, required: true, unique: true }, // e.g., 'admin-web'
    appName: { type: String, required: true }, // e.g., '管理后台'
    domain: { type: String, default: '' }, // Allowed origin for CORS/Security
    secret: { type: String, select: false }, // Client Secret for signature (future use)
    status: { type: String, default: 'active', enum: ['active', 'disabled'] },
    description: { type: String, default: '' },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('AppClient', appClientSchema);
