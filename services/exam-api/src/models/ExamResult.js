const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const QuestionSnapshotSchema = new mongoose.Schema(
    {
        questionId: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        options: [
            {
                label: { type: String, required: true },
                value: { type: String, required: true },
            },
        ],
        analysis: {
            type: String,
            default: '',
        },
        correctAnswer: {
            type: [String],
            default: [],
        },
        userAnswer: {
            type: [String],
            default: [],
        },
        isCorrect: {
            type: Boolean,
            default: false,
        },
    },
    { _id: false },
);

const CategorySnapshotSchema = new mongoose.Schema(
    {
        categoryId: {
            type: String,
            default: '',
        },
        name: {
            type: String,
            default: '',
        },
        majorCategoryId: {
            type: String,
            default: '',
        },
        passingScore: {
            type: Number,
            default: 60,
        },
        duration: {
            type: Number,
            default: 0,
        },
        scopeType: {
            type: String,
            enum: [ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE],
            default: ADMIN_SCOPE,
        },
        ownerOpenid: {
            type: String,
            default: null,
        },
    },
    { _id: false },
);

const ExamResultSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: [true, '用户ID不能为空'],
            index: true,
        },
        attemptId: {
            type: String,
            default: null,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, '分类ID不能为空'],
            index: true,
        },
        score: {
            type: Number,
            required: [true, '分数不能为空'],
            min: [0, '分数不能为负数'],
            max: [100, '分数不能超过100'],
        },
        correctCount: {
            type: Number,
            required: true,
            min: 0,
        },
        totalCount: {
            type: Number,
            required: true,
            min: 0,
        },
        answers: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        categorySnapshot: {
            type: CategorySnapshotSchema,
            default: null,
        },
        details: {
            type: [QuestionSnapshotSchema],
            default: [],
        },
        scopeType: {
            type: String,
            enum: [ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE],
            default: ADMIN_SCOPE,
            index: true,
        },
        ownerOpenid: {
            type: String,
            default: null,
            index: true,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

ExamResultSchema.index({ userId: 1, createTime: -1 });
ExamResultSchema.index(
    { userId: 1, categoryId: 1, attemptId: 1 },
    { unique: true, partialFilterExpression: { attemptId: { $type: 'string' } } },
);
ExamResultSchema.index({ categoryId: 1, createTime: -1 });
ExamResultSchema.index({ scopeType: 1, ownerOpenid: 1, createTime: -1 });
ExamResultSchema.index({ createTime: -1 });

ExamResultSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('ExamResult', ExamResultSchema);
