const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { userResourceSchema } = require('../schemas/resourceSchemas');

const ResourceConfig = require('../models/ResourceConfig');
const { prepareResourceList, revealResourcePasswords } = require('../utils/resourceSecrets');

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

function toExpirySummary(type, item, index) {
    if (!item || typeof item !== 'object' || !item.expiresAt) return null;
    return {
        id: String(item.resourceId || `${type}-${index}`),
        type,
        name: String(item.name || item.host || item.siteUrl || (type === 'domain' ? '未命名域名' : '未命名服务器')),
        expiresAt: String(item.expiresAt),
        advanceNoticeDays: Math.max(0, Number.parseInt(item.advanceNoticeDays, 10) || 0)
    };
}

// Passwords and connection details are intentionally excluded from this mobile-safe summary.
router.get('/expiry-summary', auth, async (req, res) => {
    setNoStoreHeaders(res);
    try {
        const doc = await ResourceConfig.findById(buildDocId(req.user._id)).lean();
        const items = [
            ...(doc?.servers || []).map((item, index) => toExpirySummary('server', item, index)),
            ...(doc?.domains || []).map((item, index) => toExpirySummary('domain', item, index))
        ].filter(Boolean);
        return res.json({ success: true, data: items, generatedAt: new Date().toISOString() });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
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

        if (!doc) {
            return res.json({ success: true, result: null });
        }

        const stored = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        const servers = prepareResourceList(stored.servers, stored.servers);
        const domains = prepareResourceList(stored.domains, stored.domains);

        // Transparently migrate plaintext legacy values and add stable item IDs.
        if (JSON.stringify(servers) !== JSON.stringify(stored.servers || [])
            || JSON.stringify(domains) !== JSON.stringify(stored.domains || [])) {
            await ResourceConfig.findByIdAndUpdate(id, {
                $set: { servers, domains, updatedAt: stored.updatedAt || Date.now() }
            });
        }

        return res.json({
            success: true,
            result: revealResourcePasswords({ ...stored, servers, domains })
        });
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
        const existingDoc = await ResourceConfig.findById(id);
        const existing = existingDoc
            ? (typeof existingDoc.toObject === 'function' ? existingDoc.toObject() : existingDoc)
            : {};

        const doc = {
            _id: id,
            ownerId: userId,
            servers: prepareResourceList(sanitizeResourceList(servers), existing.servers),
            domains: prepareResourceList(sanitizeResourceList(domains), existing.domains),
            updatedAt: Date.now()
        };

        const result = await ResourceConfig.findByIdAndUpdate(
            id,
            { $set: doc },
            { upsert: true, new: true }
        );

        const stored = typeof result.toObject === 'function' ? result.toObject() : result;
        res.json({ success: true, result: revealResourcePasswords(stored) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
