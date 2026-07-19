const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const ExamProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: [true, '用户ID不能为空'],
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, '分类ID不能为空'],
        },
        mode: {
            type: String,
            default: 'exam',
            trim: true,
        },
        currentIndex: {
            type: Number,
            default: 0,
            min: 0,
        },
        answers: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        timeLeft: {
            type: Number,
            default: 0,
            min: 0,
        },
        attemptId: {
            type: String,
            default: null,
        },
        attemptRequestId: {
            type: String,
            default: null,
        },
        attemptStartedAt: {
            type: Date,
            default: null,
        },
        deadlineAt: {
            type: Date,
            default: null,
        },
        attemptDurationSeconds: {
            type: Number,
            default: 0,
            min: 0,
        },
        attemptSubmittedAt: {
            type: Date,
            default: null,
        },
        questionCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        reciteQueue: {
            type: [Number],
            default: [],
        },
        reciteMastery: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        reciteReviewTimes: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        isCleared: {
            type: Boolean,
            default: false,
            index: true,
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

ExamProgressSchema.index({ userId: 1, categoryId: 1, mode: 1 }, { unique: true });
ExamProgressSchema.index({ scopeType: 1, ownerOpenid: 1, updateTime: -1 });

ExamProgressSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        delete ret.attemptRequestId;
        return ret;
    },
});

module.exports = mongoose.model('ExamProgress', ExamProgressSchema);
