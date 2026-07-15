const mongoose = require('mongoose');

const ConsoleAccountSchema = new mongoose.Schema(
    {
        openid: {
            type: String,
            required: [true, 'OpenID 不能为空'],
            unique: true,
            index: true,
        },
        role: {
            type: String,
            enum: ['creator', 'ops_admin', 'super_admin'],
            default: 'creator',
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'disabled'],
            default: 'active',
            index: true,
        },
        displayName: {
            type: String,
            default: '',
            trim: true,
            maxlength: [100, '显示名称最长 100 个字符'],
        },
        firstLoginAt: {
            type: Date,
            default: null,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
        activatedByScan: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

ConsoleAccountSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('ConsoleAccount', ConsoleAccountSchema);
