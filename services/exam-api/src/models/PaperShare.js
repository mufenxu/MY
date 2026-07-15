const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const PaperShareSchema = new mongoose.Schema(
    {
        shareCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
            index: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
            index: true,
        },
        ownerOpenid: {
            type: String,
            required: true,
            index: true,
        },
        sourceScopeType: {
            type: String,
            enum: [ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE],
            default: PERSONAL_SCOPE,
            index: true,
        },
        permission: {
            type: String,
            enum: ['view', 'edit'],
            default: 'view',
            index: true,
        },
        expiresAt: {
            type: Date,
            default: null,
            index: true,
        },
        maxAcceptCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        acceptedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        lastAcceptedAt: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ['active', 'revoked'],
            default: 'active',
            index: true,
        },
        note: {
            type: String,
            default: '',
            trim: true,
            maxlength: 200,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

PaperShareSchema.index({ ownerOpenid: 1, categoryId: 1, createTime: -1 });
PaperShareSchema.index({ shareCode: 1, status: 1 });

PaperShareSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('PaperShare', PaperShareSchema);
