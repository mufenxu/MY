const express = require('express');
const router = express.Router();
const authScanController = require('../controllers/authScanController');
const appConfigController = require('../controllers/appConfigController');
const authMiddleware = require('../middleware/auth');

// Mini-program Auth
router.post('/auth/scan', authMiddleware.verifyToken, authScanController.scanQRCode);
router.post('/auth/confirm', authMiddleware.verifyToken, authScanController.confirmLogin);
router.post('/auth/reject', authMiddleware.verifyToken, authScanController.rejectLogin);

// App Config (Public)
router.get('/config/:key', appConfigController.getPublicAppConfig);


module.exports = router;
