const mongoose = require('mongoose');

const AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) || 365;

const AuditLogSchema = new mongoose.Schema(
    {
        actorType: {
            type: String,
            enum: ['admin', 'console', 'user', 'unknown'],
            default: 'unknown',
            index: true,
        },
        actorId: {
            type: String,
            default: '',
            index: true,
        },
        actorName: {
            type: String,
            default: '',
        },
        method: {
            type: String,
            required: true,
            index: true,
        },
        path: {
            type: String,
            required: true,
            index: true,
        },
        routePath: {
            type: String,
            default: '',
        },
        statusCode: {
            type: Number,
            required: true,
        },
        params: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        query: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        bodyKeys: {
            type: [String],
            default: [],
        },
        ip: {
            type: String,
            default: '',
        },
        userAgent: {
            type: String,
            default: '',
        },
        durationMs: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: false },
    },
);

AuditLogSchema.index(
    { createTime: 1 },
    { expireAfterSeconds: AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 },
);
AuditLogSchema.index({ actorType: 1, actorId: 1, createTime: -1 });

AuditLogSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
