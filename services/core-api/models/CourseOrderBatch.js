const mongoose = require('mongoose');

const courseOrderBatchSchema = new mongoose.Schema({
    batchId: { type: String, required: true, unique: true },
    userId: { type: String, ref: 'User', required: true },
    idempotencyKeyHash: { type: String, required: true },
    requestDigest: { type: String, required: true },
    legacyKey: { type: Boolean, default: false },
    orderCount: { type: Number, required: true, min: 1, max: 20 },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now }
}, { versionKey: false });

courseOrderBatchSchema.index(
    { userId: 1, idempotencyKeyHash: 1 },
    { unique: true, name: 'course_batch_idempotency_unique' }
);
courseOrderBatchSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CourseOrderBatch', courseOrderBatchSchema);
