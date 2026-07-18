const mongoose = require('mongoose');

const privilegedMutationLockSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    holder: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true }
}, { versionKey: false });

module.exports = mongoose.model('PrivilegedMutationLock', privilegedMutationLockSchema);
