const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { 
    notifyConfigSchema, 
    adminInfoSchema, 
    cronConfigSchema, 
    appConfigSchema 
} = require('../schemas/settingSchemas');
const {
    getNotifyConfig,
    saveNotifyConfig,
    testNotify,
    getAdminInfo,
    updateAdminInfo,
    checkDue,
    getCronConfig,
    updateCronConfig,
    runTask
} = require('../controllers/settingsController');
const appConfigController = require('../controllers/appConfigController');
const multer = require('multer');
const backupController = require('../controllers/backupController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 限制 20MB
});

// Get Config
router.get('/notify', auth, authorize('super_admin'), getNotifyConfig);

// Save Config
router.post('/notify', auth, authorize('super_admin'), validate(notifyConfigSchema), saveNotifyConfig);

// Test Notify
router.post('/test-notify', auth, authorize('super_admin'), testNotify);

// Get current admin info - 仅限 super_admin
router.get('/admin', auth, authorize('super_admin'), getAdminInfo);

// Update admin username and password - 仅限 super_admin
router.post('/admin', auth, authorize('super_admin'), validate(adminInfoSchema), updateAdminInfo);

// Manual trigger for due reminder check
router.post('/check-due', auth, authorize('super_admin'), checkDue);

// Get Cron Config - 仅限 super_admin
router.get('/cron', auth, authorize('super_admin'), getCronConfig);

// Update Cron Config - 仅限 super_admin
router.post('/cron', auth, authorize('super_admin'), validate(cronConfigSchema), updateCronConfig);

// Manual trigger for tasks - 仅限 super_admin
router.post('/run-task', auth, authorize('super_admin'), runTask);

// App Config
router.get('/app-config/:key', auth, authorize('admin', 'super_admin'), appConfigController.getAppConfig);
router.post('/app-config', auth, authorize('admin', 'super_admin'), validate(appConfigSchema), appConfigController.saveAppConfig);

// 数据备份与恢复 (限 super_admin)
router.post('/backup', auth, authorize('super_admin'), backupController.exportBackup);
router.post('/restore', auth, authorize('super_admin'), upload.single('file'), backupController.importRestore);

module.exports = router;
