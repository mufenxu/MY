const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { notificationSchema, notificationUpdateSchema } = require('../schemas/notificationSchemas');

// Get active notifications (Public for Mini Program)
router.get('/active', async (req, res) => {
    try {
        // Only return published notifications
        const notifications = await Notification.find({ is_published: true })
            .sort({ createdAt: -1 })
            .limit(10); // Limit to recent ones

        // Format for Mini Program compatibility
        const items = notifications.map(n => ({
            id: n._id,
            title: n.title,
            content: n.content,
            level: n.level,
            audience: n.audience,
            publishedAt: Math.floor(n.createdAt / 1000), // Convert to seconds timestamp
            updatedAt: Math.floor(n.updatedAt / 1000)
        }));

        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get all notifications (Admin)
router.get('/', auth, authorize('admin', 'super_admin'), async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || req.query.limit, 10) || 10, 1), 100);
        const skip = (page - 1) * pageSize;

        const [items, total] = await Promise.all([
            Notification.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
            Notification.countDocuments()
        ]);

        res.json({
            success: true,
            items,
            total,
            page,
            pageSize
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create notification (Admin)
router.post('/', auth, authorize('admin', 'super_admin'), validate(notificationSchema), async (req, res) => {
    try {
        const { title, content, level, audience, is_published } = req.body;
        const notification = new Notification({
            title,
            content,
            level,
            audience,
            is_published: is_published !== undefined ? is_published : true,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        await notification.save();
        res.json({ success: true, item: notification });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update notification (Admin)
router.put('/:id', auth, authorize('admin', 'super_admin'), validate(notificationUpdateSchema), async (req, res) => {
    try {
        const { title, content, level, audience, is_published } = req.body;
        const updateData = { updatedAt: Date.now() };
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (level !== undefined) updateData.level = level;
        if (audience !== undefined) updateData.audience = audience;
        if (is_published !== undefined) updateData.is_published = is_published;

        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.json({ success: true, item: notification });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete notification (Admin)
router.delete('/:id', auth, authorize('admin', 'super_admin'), async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
