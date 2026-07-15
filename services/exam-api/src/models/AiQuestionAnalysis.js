const mongoose = require('mongoose');

const AiQuestionAnalysisSchema = new mongoose.Schema(
    {
        questionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        categoryId: {
            type: String,
            default: '',
            index: true,
        },
        scopeType: {
            type: String,
            default: '',
            index: true,
        },
        ownerOpenid: {
            type: String,
            default: '',
            index: true,
        },
        model: {
            type: String,
            required: true,
            trim: true,
        },
        promptVersion: {
            type: Number,
            required: true,
            default: 5,
        },
        questionSignature: {
            type: String,
            default: '',
            index: true,
        },
        analysis: {
            type: String,
            required: true,
        },
        generatedByOpenid: {
            type: String,
            default: '',
        },
        lastGeneratedAt: {
            type: Date,
            default: Date.now,
        },
        lastUsedAt: {
            type: Date,
            default: Date.now,
        },
        viewCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        sourceSnapshot: {
            type: {
                type: String,
                default: '',
            },
            content: {
                type: String,
                default: '',
            },
            options: [{
                _id: false,
                label: {
                    type: String,
                    default: '',
                },
                value: {
                    type: String,
                    default: '',
                },
            }],
            answer: [{
                type: String,
            }],
            analysis: {
                type: String,
                default: '',
            },
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

AiQuestionAnalysisSchema.index({ categoryId: 1, updateTime: -1 });
AiQuestionAnalysisSchema.index({ scopeType: 1, ownerOpenid: 1, updateTime: -1 });

AiQuestionAnalysisSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('AiQuestionAnalysis', AiQuestionAnalysisSchema);
