const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const QuestionSnapshotSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['single', 'multiple', 'judge', 'fill'],
            required: true,
        },
        content: { type: String, required: true },
        options: [{
            label: { type: String, required: true },
            value: { type: String, required: true },
            _id: false,
        }],
        answer: { type: [String], required: true },
        analysis: { type: String, default: '' },
        analysisSource: {
            type: String,
            enum: ['manual', 'ai'],
            default: 'manual',
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        sortOrder: { type: Number, default: 0 },
    },
    { _id: false },
);

const QuestionVersionSchema = new mongoose.Schema(
    {
        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
            required: true,
        },
        revision: { type: Number, required: true, min: 1 },
        scopeType: {
            type: String,
            enum: [ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE],
            required: true,
        },
        ownerOpenid: { type: String, default: null },
        snapshot: { type: QuestionSnapshotSchema, required: true },
        action: {
            type: String,
            enum: ['create', 'baseline', 'update', 'rollback'],
            required: true,
        },
        sourceRevision: { type: Number, default: null },
        changedFields: { type: [String], default: [] },
        actorType: {
            type: String,
            enum: ['admin', 'console', 'system'],
            default: 'system',
        },
        actorId: { type: String, default: '' },
        actorName: { type: String, default: '' },
        requestId: { type: String, default: '' },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: false },
    },
);

QuestionVersionSchema.index({ questionId: 1, revision: 1 }, { unique: true });
QuestionVersionSchema.index({ scopeType: 1, ownerOpenid: 1, questionId: 1, revision: -1 });
QuestionVersionSchema.index({ actorType: 1, actorId: 1, createTime: -1 });

QuestionVersionSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('QuestionVersion', QuestionVersionSchema);
