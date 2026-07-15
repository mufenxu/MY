const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const MajorCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, '大分类名称不能为空'],
            trim: true,
            maxlength: [200, '大分类名称最长200个字符'],
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
        showOnHome: {
            type: Boolean,
            default: true,
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

MajorCategorySchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

MajorCategorySchema.index({ scopeType: 1, ownerOpenid: 1, sortOrder: 1 });
MajorCategorySchema.index({ showOnHome: 1, sortOrder: 1, scopeType: 1 });

module.exports = mongoose.model('MajorCategory', MajorCategorySchema);
