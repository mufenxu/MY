const mongoose = require('mongoose');

const SecretCacheSchema = new mongoose.Schema({
    secret_name: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    secret_value: {
        type: String,
        default: ''
    },
    updated_by: {
        type: String,
        default: 'unknown'
    }
}, {
    timestamps: { createdAt: 'create_time', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('SecretCache', SecretCacheSchema);
