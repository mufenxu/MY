const mongoose = require('mongoose');

const UserQuestionStateSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        questionId: {
            type: String,
            required: true,
            index: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['needsReview', 'mastered'],
            default: 'needsReview',
            index: true,
        },
        favorite: {
            type: Boolean,
            default: false,
            index: true,
        },
        note: {
            type: String,
            default: '',
            trim: true,
            maxlength: 500,
        },
        wrongCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        correctStreak: {
            type: Number,
            default: 0,
            min: 0,
        },
        lastWrongAt: {
            type: Date,
            default: null,
        },
        lastCorrectAt: {
            type: Date,
            default: null,
        },
        masteredAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

UserQuestionStateSchema.index({ userId: 1, questionId: 1 }, { unique: true });
UserQuestionStateSchema.index({ userId: 1, categoryId: 1, status: 1, updateTime: -1 });

UserQuestionStateSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('UserQuestionState', UserQuestionStateSchema);
