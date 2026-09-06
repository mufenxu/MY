const mongoose = require('mongoose');

const AiGenerationJobSchema = new mongoose.Schema({
    actorKey: { type: String, required: true },
    categoryId: { type: String, required: true },
    scopeType: { type: String, required: true },
    ownerOpenid: { type: String, default: '' },
    requesterOpenid: { type: String, default: '' },
    questionIds: [String],
    forceRefresh: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    status: { type: String, enum: ['queued', 'running', 'completed'], default: 'queued' },
    processed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    generated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    selected: { type: Boolean, default: false },
    failures: [{ _id: false, questionId: String, message: String }],
    questionStartedAt: { type: Date, default: null },
    leaseToken: { type: String, default: '' },
    leaseUntil: { type: Date, default: () => new Date(0) },
    expiresAt: { type: Date, default: null },
}, { timestamps: true });

AiGenerationJobSchema.index({ actorKey: 1 }, { unique: true, partialFilterExpression: { active: true } });
AiGenerationJobSchema.index({ active: 1, leaseUntil: 1, createdAt: 1 });
AiGenerationJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AiGenerationJob', AiGenerationJobSchema);
