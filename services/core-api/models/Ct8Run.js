const mongoose = require('mongoose');

const Ct8RunSchema = new mongoose.Schema({
    run_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    workflow: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['running', 'success', 'failed', 'partial'],
        default: 'running'
    },
    start_time: {
        type: Date,
        default: Date.now
    },
    end_time: {
        type: Date
    },
    stats: {
        total: { type: Number, default: 0 },
        success: { type: Number, default: 0 },
        failed: { type: Number, default: 0 }
    },
    auto_resolved: {
        type: Boolean,
        default: false
    },
    callback_status: {
        type: String,
        enum: ['pending', 'received', 'empty', 'missing'],
        default: 'pending'
    },
    callback_received_at: {
        type: Date
    },
    callback_error: {
        type: String
    },
    workflow_conclusion: {
        type: String
    },
    details: [{
        host: String,
        user: String,
        port: Number,
        ipify_ip: String,
        out_ip: String,
        proxy: String,
        expiry_text: String,
        expiry_unix: Number,
        success: Boolean,
        login_time: Date
    }]
}, {
    timestamps: { createdAt: 'create_time', updatedAt: 'update_time' }
});

module.exports = mongoose.model('Ct8Run', Ct8RunSchema);
