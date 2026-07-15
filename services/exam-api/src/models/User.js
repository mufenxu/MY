const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
    {
        openid: {
            type: String,
            required: [true, 'OpenID不能为空'],
            unique: true,
            index: true,
        },
        nickname: {
            type: String,
            default: '',
            trim: true,
            maxlength: [100, '昵称最长100个字符'],
        },
        avatarUrl: {
            type: String,
            default: '',
        },
        lastActiveTime: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

UserSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

UserSchema.index({ lastActiveTime: -1 });

module.exports = mongoose.model('User', UserSchema);
