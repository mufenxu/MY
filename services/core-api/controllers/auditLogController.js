const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get audit logs
// @route   GET /api/audit-logs
// @access  Private (Admin only)
exports.getAuditLogs = asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 20, action, targetId } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const filter = {};

    if (action) filter.action = action;
    if (targetId) filter.targetId = targetId;

    const [total, logs] = await Promise.all([
        AuditLog.countDocuments(filter),
        AuditLog.find(filter)
            .sort({ ts: -1 })
            .skip((pageNum - 1) * pageSizeNum)
            .limit(pageSizeNum)
            .lean()
    ]);

    // Optional: Populate actor info if you have a User model and actorOpenid links to it
    // For now, we just return the raw logs. In a real app, you might want to aggregate with Users.

    res.json({ success: true, items: logs, total });
});
