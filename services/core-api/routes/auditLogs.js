const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

router.use(auth);

// 审计日志 - 仅限管理员查看
router.get('/', authorize('admin', 'super_admin'), getAuditLogs);

module.exports = router;
