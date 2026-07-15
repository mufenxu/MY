const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { globalResourceSchema, userResourceSchema } = require('../schemas/resourceSchemas');

const ResourceConfig = require('../models/ResourceConfig');

function buildDocId(ownerId) {
    const safe = (ownerId || 'anonymous').replace(/[^a-zA-Z0-9_:\-]/g, '_');
    return `resource_${safe}`;
}

const CLIENT_ONLY_RESOURCE_KEYS = new Set(['__display']);

function setNoStoreHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function stripClientOnlyFields(value) {
    if (Array.isArray(value)) {
        return value.map(stripClientOnlyFields);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).reduce((result, key) => {
            if (CLIENT_ONLY_RESOURCE_KEYS.has(key) || key.startsWith('__')) {
                return result;
            }

            result[key] = stripClientOnlyFields(value[key]);
            return result;
        }, {});
    }

    return value;
}

function sanitizeResourceList(list) {
    return Array.isArray(list) ? stripClientOnlyFields(list) : [];
}

// Get Global App Resources
router.get('/global', async (req, res) => {
    try {
        const doc = await ResourceConfig.findById('default');
        const defaultGlobalConfig = { apiServers: [], images: [], cdns: [], constants: [] };
        res.json({ success: true, result: doc && doc.globalConfig ? doc.globalConfig : defaultGlobalConfig });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update Global App Resources (Admin only)
router.post('/global', auth, authorize('admin', 'super_admin'), validate(globalResourceSchema), async (req, res) => {
    try {
        const globalConfig = req.body;
        
        const result = await ResourceConfig.findByIdAndUpdate(
            'default',
            { 
                $set: { globalConfig, updatedAt: Date.now() },
                $setOnInsert: { ownerId: 'default', servers: [], domains: [] }
            },
            { upsert: true, new: true }
        );
        res.json({ success: true, result: result.globalConfig });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get Resources
router.get('/', auth, async (req, res) => {
    setNoStoreHeaders(res);

    try {
        const userId = req.user._id; // Use authenticated user's ID
        // The MP code logic is a bit complex with ownerId.
        // But essentially it loads the user's resource config.
        const id = buildDocId(userId);
        const doc = await ResourceConfig.findById(id);

        // If not found, maybe return default? MP code handles "not found" by returning empty.
        // But it also tries to sync to 'default'.
        // Let's just return what we find.
        res.json({ success: true, result: doc });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Save Resources
router.post('/', auth, validate(userResourceSchema), async (req, res) => {
    setNoStoreHeaders(res);

    try {
        const userId = req.user._id;
        const { servers, domains } = req.body;
        const id = buildDocId(userId);

        const doc = {
            _id: id,
            ownerId: userId,
            servers: sanitizeResourceList(servers),
            domains: sanitizeResourceList(domains),
            updatedAt: Date.now()
        };

        const result = await ResourceConfig.findByIdAndUpdate(
            id,
            { $set: doc },
            { upsert: true, new: true }
        );

        // Also update 'default' if needed? MP code does this.
        // "sync default document (doesn't affect usage)"
        // Let's replicate this behavior for now if it's intended for some global view.
        // But maybe 'default' should be a separate thing.
        // I'll skip updating 'default' for now unless requested, as it seems like a legacy or specific requirement.
        // Actually, let's just stick to user's own config.

        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
