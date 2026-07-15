const mongoose = require('mongoose');

const FEEDBACK_CATEGORIES = ['bug', 'feature', 'content', 'account', 'other'];
const FEEDBACK_STATUSES = ['open', 'replied', 'closed'];

const FeedbackSchema = new mongoose.Schema(
    {
        ownerOpenid: {
            type: String,
            required: [true, '反馈用户不能为空'],
            index: true,
        },
        category: {
            type: String,
            enum: FEEDBACK_CATEGORIES,
            default: 'other',
            index: true,
        },
        title: {
            type: String,
            required: [true, '反馈标题不能为空'],
            trim: true,
            maxlength: [100, '反馈标题最长100个字符'],
        },
        content: {
            type: String,
            required: [true, '反馈内容不能为空'],
            trim: true,
            maxlength: [2000, '反馈内容最长2000个字符'],
        },
        contact: {
            type: String,
            trim: true,
            maxlength: [120, '联系方式最长120个字符'],
            default: '',
        },
        status: {
            type: String,
            enum: FEEDBACK_STATUSES,
            default: 'open',
            index: true,
        },
        replyContent: {
            type: String,
            trim: true,
            maxlength: [2000, '回复内容最长2000个字符'],
            default: '',
        },
        repliedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        repliedByName: {
            type: String,
            trim: true,
            maxlength: [100, '回复人名称最长100个字符'],
            default: '',
        },
        repliedAt: {
            type: Date,
            default: null,
        },
        replyReadAt: {
            type: Date,
            default: null,
        },
        closedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

FeedbackSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

FeedbackSchema.index({ ownerOpenid: 1, updateTime: -1 });
FeedbackSchema.index({ status: 1, updateTime: -1 });
FeedbackSchema.index({ ownerOpenid: 1, repliedAt: -1, replyReadAt: -1 });

module.exports = mongoose.model('Feedback', FeedbackSchema);
module.exports.FEEDBACK_CATEGORIES = FEEDBACK_CATEGORIES;
module.exports.FEEDBACK_STATUSES = FEEDBACK_STATUSES;
