const mongoose = require('mongoose');

const resourceConfigSchema = new mongoose.Schema({
    _id: String, // 'resource_' + safe(ownerId) or 'default'
    ownerId: String,
    servers: Array,
    domains: Array,
    globalConfig: {
        apiServers: { type: Array, default: [] }, // { name, url, isActive }
        images: { type: Array, default: [] }, // { key, url, description }
        cdns: { type: Array, default: [] }, // { name, url, isActive }
        constants: { type: Array, default: [] } // { key, value, description }
    },
    updatedAt: Number
}, { versionKey: false });

module.exports = mongoose.model('ResourceConfig', resourceConfigSchema);
