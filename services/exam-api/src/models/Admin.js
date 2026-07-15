const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, '用户名不能为空'],
            unique: true,
            trim: true,
            maxlength: [50, '用户名最长50个字符'],
        },
        password: {
            type: String,
            required: [true, '密码不能为空'],
            select: false, // 查询时默认不返回密码字段
        },
        displayName: {
            type: String,
            trim: true,
            maxlength: [100, '显示名称最长100个字符'],
            default: '',
        },
        wechatOpenId: {
            type: String,
            default: null,
            sparse: true, // 允许多个 null 值的唯一索引
        },
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
        },
        failedLoginCount: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        lockedUntil: {
            type: Date,
            default: null,
            select: false,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

// 查询时移除 __v
AdminSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        delete ret.password;
        delete ret.failedLoginCount;
        delete ret.lockedUntil;
        return ret;
    },
});

module.exports = mongoose.model('Admin', AdminSchema);
