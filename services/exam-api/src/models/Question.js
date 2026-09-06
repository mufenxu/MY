const mongoose = require('mongoose');
const { ADMIN_SCOPE, DEMO_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');
const { SEARCH_INITIALS_VERSION, buildQuestionSearchInitials } = require('../utils/pinyinSearch');

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
        searchInitials: {
            type: new mongoose.Schema({
                version: Number,
                content: String,
                analysis: String,
                options: [String],
            }, { _id: false }),
            select: false,
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
        revision: {
            type: Number,
            default: 1,
            min: 1,
        },
    },
    {
        timestamps: { createdAt: 'createTime', updatedAt: 'updateTime' },
    },
);

QuestionSchema.pre('validate', function () {
    if (this.isNew || !this.searchInitials || ['content', 'analysis', 'options'].some((field) => this.isModified(field))) {
        this.searchInitials = buildQuestionSearchInitials(this);
    }
});

QuestionSchema.statics.backfillSearchInitials = async function ({ signal } = {}) {
    let afterId = null;
    while (!signal?.aborted) {
        const batch = await this.find({
            'searchInitials.version': { $ne: SEARCH_INITIALS_VERSION },
            ...(afterId ? { _id: { $gt: afterId } } : {}),
        }).select('_id revision updateTime content analysis options').sort({ _id: 1 }).limit(200).lean();
        if (!batch.length || signal?.aborted) return;
        // Native writes preserve timestamps and revisions; guards avoid overwriting a concurrent edit.
        await this.collection.bulkWrite(batch.map((question) => ({ updateOne: {
            filter: {
                _id: question._id,
                revision: question.revision ?? { $exists: false },
                updateTime: question.updateTime ?? { $exists: false },
                'searchInitials.version': { $ne: SEARCH_INITIALS_VERSION },
            },
            update: { $set: { searchInitials: buildQuestionSearchInitials(question) } },
        } })), { ordered: false });
        afterId = batch[batch.length - 1]._id;
        await new Promise((resolve) => setImmediate(resolve));
    }
};

QuestionSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        delete ret.searchInitials;
        return ret;
    },
});

QuestionSchema.index({ categoryId: 1, sortOrder: 1, createTime: 1 });
QuestionSchema.index({ 'searchInitials.version': 1, _id: 1 });
QuestionSchema.index({ categoryId: 1, updateTime: -1 });
QuestionSchema.index({ scopeType: 1, ownerOpenid: 1, categoryId: 1, sortOrder: 1, createTime: 1 });
QuestionSchema.index({ scopeType: 1, ownerOpenid: 1, categoryId: 1, updateTime: -1 });
QuestionSchema.index({ scopeType: 1, ownerOpenid: 1, categoryId: 1, _id: 1 });

module.exports = mongoose.model('Question', QuestionSchema);
