const mongoose = require('mongoose');

const CohortSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, default: '', trim: true, maxlength: 500 },
        memberOpenids: { type: [String], default: [] },
        status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
        createdBy: { type: String, default: '' },
        updatedBy: { type: String, default: '' },
    },
    { timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' } },
);

CohortSchema.index({ name: 1 });
CohortSchema.index({ memberOpenids: 1 });

CohortSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('Cohort', CohortSchema);
