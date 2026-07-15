const AppClient = require('../models/AppClient');
const crypto = require('crypto');
const corsService = require('../services/corsService');

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

        res.json({ success: true, data: newApp });
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

// Get App Secret (Admin only)
exports.getSecret = async (req, res) => {
    try {
        const { id } = req.params;
        // explicitly select secret
        const app = await AppClient.findById(id).select('+secret');
        if (!app) return res.status(404).json({ message: 'App not found' });

        res.json({ success: true, secret: app.secret });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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

        res.json({ success: true, secret: newSecret });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
