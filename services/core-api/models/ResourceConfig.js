const mongoose = require('mongoose');
const { prepareResourceList } = require('../utils/resourceSecrets');

const resourceConfigSchema = new mongoose.Schema({
    _id: String, // 'resource_' + safe(ownerId) or 'default'
    ownerId: String,
    servers: Array,
    domains: Array,
    updatedAt: Number
}, { versionKey: false });

function protectResourceDocument(doc) {
    if (!doc) return;
    if (doc.servers !== undefined) doc.servers = prepareResourceList(doc.servers);
    if (doc.domains !== undefined) doc.domains = prepareResourceList(doc.domains);
}

resourceConfigSchema.pre('save', function protectResourceSave() {
    protectResourceDocument(this);
});

resourceConfigSchema.pre('insertMany', function protectResourceInsertMany(docs) {
    for (const doc of docs || []) protectResourceDocument(doc);
});

resourceConfigSchema.pre('findOneAndUpdate', function protectResourceUpdate() {
    const update = this.getUpdate() || {};
    const target = update.$set || update;
    protectResourceDocument(target);
});

module.exports = mongoose.model('ResourceConfig', resourceConfigSchema);
