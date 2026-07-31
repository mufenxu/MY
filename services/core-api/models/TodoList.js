const mongoose = require('mongoose');

const todoTaskSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    completed: { type: Boolean, default: false },
    dueAt: { type: Number, default: null },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
    courseRef: {
        _id: false,
        id: { type: String, default: '' },
        name: { type: String, default: '' }
    },
    reminderAt: { type: Number, default: null },
    reminderStatus: { type: String, enum: ['pending', 'sent', 'dismissed'], default: 'pending' },
    remindedAt: { type: Number, default: null },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true }
}, { _id: false, versionKey: false });

const todoListSchema = new mongoose.Schema({
    _id: String, // userId
    tasks: { type: [todoTaskSchema], default: [] },
    revision: { type: Number, default: 0, min: 0 },
    updatedAt: Number,
    ownerName: String,
    pendingCount: Number,
    lastNotifiedAt: Number
}, { versionKey: false });

todoListSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('TodoList', todoListSchema);
