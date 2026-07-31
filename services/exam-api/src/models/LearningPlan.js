const mongoose = require('mongoose');

const LearningPlanSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, default: '', trim: true, maxlength: 1000 },
        categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
        cohortIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' }],
        directUserOpenids: { type: [String], default: [] },
        userOpenids: { type: [String], default: [] },
        dueAt: { type: Date, default: null, index: true },
        targetScore: { type: Number, min: 0, max: 100, default: 60 },
        status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
        assignedAt: { type: Date, default: Date.now },
        createdBy: { type: String, default: '' },
        updatedBy: { type: String, default: '' },
    },
    { timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' } },
);

LearningPlanSchema.index({ userOpenids: 1, status: 1, dueAt: 1 });
LearningPlanSchema.index({ cohortIds: 1, status: 1 });

LearningPlanSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('LearningPlan', LearningPlanSchema);
