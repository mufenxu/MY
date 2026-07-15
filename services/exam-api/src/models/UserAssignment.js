const mongoose = require('mongoose');

const UserAssignmentSchema = new mongoose.Schema(
    {
        userOpenid: {
            type: String,
            required: true,
        },
        majorCategoryIds: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'MajorCategory',
            }],
            default: [],
        },
        categoryIds: {
            type: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Category',
            }],
            default: [],
        },
        majorCategoryPrefs: {
            type: [{
                _id: false,
                majorCategoryId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'MajorCategory',
                    required: true,
                },
                sortOrder: {
                    type: Number,
                    default: undefined,
                },
                showOnHome: {
                    type: Boolean,
                    default: true,
                },
            }],
            default: [],
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

UserAssignmentSchema.index({ userOpenid: 1 }, { unique: true });

UserAssignmentSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('UserAssignment', UserAssignmentSchema);
