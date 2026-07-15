const express = require('express');
const router = express.Router();
const authScanController = require('../controllers/authScanController');
const authMiddleware = require('../middleware/auth');
const { scanLimiter, exchangeLimiter } = require('../middleware/rateLimit');

// QR Code Management（添加限流）
router.post('/qrcode/create', scanLimiter, authScanController.createQRCode);
router.post('/qrcode/create-wxacode', scanLimiter, authScanController.createWxacode);
router.get('/qrcode/status', scanLimiter, authScanController.checkStatus);
router.get('/qrcode/list', authMiddleware.verifyToken, authScanController.listQRCodes);

// Token Exchange（使用更严格的限流，防止暴力枚举）
router.post('/token/exchange', exchangeLimiter, authScanController.exchangeToken);
router.post('/token/exchange-admin', exchangeLimiter, authScanController.exchangeTokenAdmin);

// Logs
router.get('/logs', authMiddleware.verifyToken, authScanController.getAuditLogs);

module.exports = router;
