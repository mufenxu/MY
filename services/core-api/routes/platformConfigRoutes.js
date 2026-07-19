const express = require('express');
const router = express.Router();
const platformConfigController = require('../controllers/platformConfigController');
const { verifyToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// 仅管理员可操作平台配置
router.get('/list', verifyToken, authorize('admin', 'super_admin'), platformConfigController.getAllConfigs);
router.post('/save', verifyToken, authorize('super_admin'), platformConfigController.saveConfig);
router.delete('/:platformCode', verifyToken, authorize('super_admin'), platformConfigController.deleteConfig);

module.exports = router;
