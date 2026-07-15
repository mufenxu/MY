const express = require('express');
const router = express.Router();


// Auth Routes (Login)
router.use('/auth', require('./auth'));

// Auth Scan Routes (QR Code)
router.use('/auth', require('./authScanRoutes'));

// Other Business Routes
router.use('/users', require('./users'));
router.use('/todos', require('./todos'));
router.use('/settings', require('./settings'));
router.use('/resources', require('./resources'));
router.use('/notifications', require('./notifications'));
router.use('/github', require('./github'));
router.use('/iot', require('./iot'));
router.use('/tuya', require('./tuya'));
router.use('/audit-logs', require('./auditLogs'));
router.use('/news', require('./newsRoutes'));

router.use('/mp', require('./mpRoutes'));
router.use('/apps', require('./appRoutes'));
router.use('/cron', require('./cronRoutes'));
router.use('/ct8', require('./ct8Routes'));
router.use('/stats', require('./statsRoutes'));
router.use('/secrets', require('./secrets'));
router.use('/course-order', require('./courseOrderRoutes'));
router.use('/platform-config', require('./platformConfigRoutes'));
router.use('/course-category', require('./courseCategoryRoutes'));

module.exports = router;
