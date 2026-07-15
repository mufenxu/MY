const mongoose = require('mongoose');

const ScanLoginSessionSchema = new mongoose.Schema(
    {
        qrToken: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        pollToken: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        sceneToken: {
            type: String,
            default: null,
            index: true,
            sparse: true,
        },
        tempAuthCode: {
            type: String,
            default: null,
            index: true,
            sparse: true,
        },
        intent: {
            type: String,
            enum: ['manage_login', 'admin_login', 'console_login', 'admin_bind'],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'scanned', 'confirmed', 'consumed', 'expired', 'cancelled'],
            default: 'pending',
            index: true,
        },
        createdIp: {
            type: String,
            default: '',
        },
        createdUserAgent: {
            type: String,
            default: '',
        },
        scannedByOpenid: {
            type: String,
            default: null,
            index: true,
        },
        scannedIp: {
            type: String,
            default: '',
        },
        scannedUserAgent: {
            type: String,
            default: '',
        },
        scannedAt: {
            type: Date,
            default: null,
        },
        confirmedIp: {
            type: String,
            default: '',
        },
        confirmedUserAgent: {
            type: String,
            default: '',
        },
        confirmedAt: {
            type: Date,
            default: null,
        },
        consumedIp: {
            type: String,
            default: '',
        },
        consumedUserAgent: {
            type: String,
            default: '',
        },
        tempAuthCodeConsumedAt: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        tempAuthCodeExpiresAt: {
            type: Date,
            default: null,
            index: true,
        },
        cleanupAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

ScanLoginSessionSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

ScanLoginSessionSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('ScanLoginSession', ScanLoginSessionSchema);
