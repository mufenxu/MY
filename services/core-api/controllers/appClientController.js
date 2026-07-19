const AppClient = require('../models/AppClient');
const crypto = require('crypto');
const corsService = require('../services/corsService');
const logAudit = require('../utils/auditLogger');

const SECRET_MASK = '********';

function publicApp(app, { includeSecretStatus = false } = {}) {
    const source = typeof app?.toObject === 'function' ? app.toObject() : { ...(app || {}) };
    const configured = Boolean(source.secret);
    delete source.secret;
    if (includeSecretStatus) {
        source.secretConfigured = configured;
        source.secret = configured ? SECRET_MASK : '';
    }
    return source;
}

// List all apps
exports.listApps = async (req, res) => {
    try {
        const list = await AppClient.find().sort({ createdAt: -1 });
        res.json({ success: true, list });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create new app
exports.createApp = async (req, res) => {
    try {
        const { appName, domain, description } = req.body;
        if (!appName) return res.status(400).json({ message: 'Missing appName' });

        // Generate ID and Secret
        const appId = crypto.randomBytes(4).toString('hex'); // simple 8 char id
        const secret = crypto.randomBytes(16).toString('hex');

        const newApp = await AppClient.create({
            appId,
            appName,
            domain,
            secret,
            description,
            createdAt: Date.now()
        });

        // 刷新 CORS 白名单缓存
        await corsService.refreshCache();

        res.json({ success: true, data: publicApp(newApp, { includeSecretStatus: true }) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Creation failed' });
    }
};

// Update app
exports.updateApp = async (req, res) => {
    try {
        const { id } = req.params; // _id or appId? let's use _id for unique
        const updates = req.body;
        delete updates._id;
        delete updates.appId; // Immutable
        delete updates.secret; // Immutable directly

        updates.updatedAt = Date.now();

        const result = await AppClient.findByIdAndUpdate(id, updates, { new: true });
        if (!result) return res.status(404).json({ message: 'App not found' });

        // 刷新 CORS 白名单缓存
        await corsService.refreshCache();

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete app
exports.deleteApp = async (req, res) => {
    try {
        const { id } = req.params;
        await AppClient.findByIdAndDelete(id);

        // 刷新 CORS 白名单缓存
        await corsService.refreshCache();

        res.json({ success: true, message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Regular reads expose only whether a secret is configured.
exports.getSecretMetadata = async (req, res) => {
    try {
        const { id } = req.params;
        const app = await AppClient.findById(id).select('+secret');
        if (!app) return res.status(404).json({ message: 'App not found' });

        const configured = Boolean(app.secret);
        res.json({ success: true, configured, secret: configured ? SECRET_MASK : '' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Plaintext disclosure is a separately authorized, reauthenticated and audited action.
exports.revealSecret = async (req, res) => {
    try {
        const { id } = req.params;
        const app = await AppClient.findById(id).select('+secret');
        if (!app) return res.status(404).json({ message: 'App not found' });

        await logAudit(req, { action: 'APP_SECRET_REVEAL', targetId: id });
        return res.json({ success: true, secret: app.secret || '' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Reset App Secret
exports.resetSecret = async (req, res) => {
    try {
        const { id } = req.params;
        const newSecret = crypto.randomBytes(16).toString('hex');

        const app = await AppClient.findByIdAndUpdate(id, {
            secret: newSecret,
            updatedAt: Date.now()
        }, { new: true });

        if (!app) return res.status(404).json({ message: 'App not found' });

        await logAudit(req, { action: 'APP_SECRET_RESET', targetId: id });
        res.json({ success: true, secret: newSecret });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
