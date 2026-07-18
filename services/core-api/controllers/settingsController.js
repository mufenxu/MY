const settingsService = require('../services/settingsService');
const { runTaskNow, checkAndNotify } = require('../services/cronScheduler');
const asyncHandler = require('../middleware/asyncHandler');

exports.getNotifyConfig = asyncHandler(async (req, res) => {
    const result = await settingsService.getNotifyConfig();
    res.json({ success: true, result });
});

exports.saveNotifyConfig = asyncHandler(async (req, res) => {
    const result = await settingsService.saveNotifyConfig(req.body, req.user._id);
    res.json({ success: true, result });
});

exports.testNotify = asyncHandler(async (req, res) => {
    const { config, testChannel } = req.body;
    const result = await settingsService.testNotify(config, testChannel);
    res.json(result);
});

exports.getAdminInfo = asyncHandler(async (req, res) => {
    const result = await settingsService.getAdminInfo(req.user._id);
    res.json({ success: true, result });
});

exports.updateAdminInfo = asyncHandler(async (req, res) => {
    const result = await settingsService.updateAdminInfo(req.user._id, req.body);
    res.json({ success: true, result });
});

exports.checkDue = asyncHandler(async (req, res) => {
    const result = await checkAndNotify(true);
    res.json({ success: true, result });
});

exports.getCronConfig = asyncHandler(async (req, res) => {
    const result = await settingsService.getCronConfig(req.query.type);
    res.json({ success: true, result });
});

exports.updateCronConfig = asyncHandler(async (req, res) => {
    const { type, schedule, enabled } = req.body;
    const result = await settingsService.updateCronConfig(type, schedule, enabled);
    res.json({ success: true, result });
});

exports.runTask = asyncHandler(async (req, res) => {
    const { type } = req.body;
    if (!type) return res.status(400).json({ success: false, error: 'Missing type parameter' });
    const result = await runTaskNow(type);
    res.json({ success: true, result });
});
