const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const QuestionSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: {
                values: ['single', 'multiple', 'judge', 'fill'],
                message: '题目类型必须是 single/multiple/judge/fill 之一',
            },
            required: [true, '题目类型不能为空'],
        },
        content: {
            type: String,
            required: [true, '题目内容不能为空'],
            trim: true,
        },
        options: [
            {
                label: { type: String, required: true },
                value: { type: String, required: true },
            },
        ],
        answer: {
            type: [String],
            required: [true, '答案不能为空'],
            validate: {
                validator: (v) => v.length > 0,
                message: '至少需要一个答案',
            },
        },
        analysis: {
            type: String,
            default: '',
            trim: true,
        },
        analysisSource: {
            type: String,
            enum: ['manual', 'ai'],
            default: 'manual',
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, '所属分类不能为空'],
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
        sortOrder: {
            type: Number,
            default: 0,
            index: true,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

QuestionSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

QuestionSchema.index({ categoryId: 1, sortOrder: 1, createTime: 1 });
QuestionSchema.index({ categoryId: 1, updateTime: -1 });
QuestionSchema.index({ scopeType: 1, ownerOpenid: 1, categoryId: 1, sortOrder: 1, createTime: 1 });
QuestionSchema.index({ scopeType: 1, ownerOpenid: 1, categoryId: 1, updateTime: -1 });

module.exports = mongoose.model('Question', QuestionSchema);
