const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    audience: { type: String, enum: ['all', 'admin', 'super_admin'], default: 'all' },
    is_published: { type: Boolean, default: true },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now }
}, { versionKey: false });

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ is_published: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
