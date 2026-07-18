const mongoose = require('mongoose');
const config = require('../config');

const AiGenerationUsageSchema = new mongoose.Schema(
    {
        day: {
            type: String,
            required: true,
            index: true,
        },
        actorKey: {
            type: String,
            required: true,
            index: true,
        },
        generatedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        lastBatchAt: {
            type: Date,
            default: null,
        },
        lastGeneratedAt: {
            type: Date,
            default: null,
        },
        lastReservedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

AiGenerationUsageSchema.index({ day: 1, actorKey: 1 }, { unique: true });

if (config.ai.usageRetentionDays > 0) {
    AiGenerationUsageSchema.index(
        { createTime: 1 },
        { expireAfterSeconds: config.ai.usageRetentionDays * 24 * 60 * 60 },
    );
}

AiGenerationUsageSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('AiGenerationUsage', AiGenerationUsageSchema);
