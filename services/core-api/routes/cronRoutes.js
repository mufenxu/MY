const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { runTaskNow, TASKS } = require('../services/cronScheduler');

// 手动触发定时任务会发通知/跑外部工作流，与 /settings 下的同类操作一样仅限超级管理员
router.post('/run-now', auth.verifyToken, authorize('super_admin'), async (req, res, next) => {
    try {
        const taskId = req.body?.taskId ?? req.body?.type;
        if (typeof taskId !== 'string' || !Object.hasOwn(TASKS, taskId)) {
            return res.status(400).json({ success: false, error: '未知任务' });
        }
        const result = await runTaskNow(taskId);
        res.json({ success: true, result });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
