const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const CategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, '分类名称不能为空'],
            trim: true,
            maxlength: [200, '分类名称最长200个字符'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [300, '试卷说明最长300个字符'],
            default: '',
        },
        count: {
            type: Number,
            default: 0,
            min: [0, '题目数量不能为负数'],
        },
        duration: {
            type: Number,
            default: 0,
            min: [0, '考试时长不能为负数'],
        },
        passingScore: {
            type: Number,
            default: 60,
            min: [0, '及格分数不能为负数'],
            max: [100, '及格分数不能超过100'],
        },
        isPublished: {
            type: Boolean,
            default: true,
            index: true,
        },
        majorCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MajorCategory',
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
        shareOrigin: {
            shareId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'PaperShare',
                default: null,
            },
            sourceCategoryId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Category',
                default: null,
            },
            sourceOwnerOpenid: {
                type: String,
                default: '',
            },
            permission: {
                type: String,
                enum: ['view', 'edit', null],
                default: null,
            },
            acceptedAt: {
                type: Date,
                default: null,
            },
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

CategorySchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

CategorySchema.index({ scopeType: 1, ownerOpenid: 1, majorCategoryId: 1, updateTime: -1 });
CategorySchema.index({ 'shareOrigin.shareId': 1, ownerOpenid: 1 });

module.exports = mongoose.model('Category', CategorySchema);
