const mongoose = require('mongoose');

const PaperShareReceiptSchema = new mongoose.Schema(
    {
        shareId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PaperShare',
            required: true,
            index: true,
        },
        shareCode: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            index: true,
        },
        sourceCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        newCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        ownerOpenid: {
            type: String,
            required: true,
            index: true,
        },
        recipientOpenid: {
            type: String,
            required: true,
            index: true,
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view',
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

PaperShareReceiptSchema.index({ shareId: 1, recipientOpenid: 1 }, { unique: true });
PaperShareReceiptSchema.index({ recipientOpenid: 1, createTime: -1 });

PaperShareReceiptSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('PaperShareReceipt', PaperShareReceiptSchema);
