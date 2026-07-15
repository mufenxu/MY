const mongoose = require('mongoose');

const todoListSchema = new mongoose.Schema({
    _id: String, // userId
    tasks: Array,
    updatedAt: Number,
    ownerName: String,
    pendingCount: Number,
    lastNotifiedAt: Number
}, { versionKey: false });

module.exports = mongoose.model('TodoList', todoListSchema);
