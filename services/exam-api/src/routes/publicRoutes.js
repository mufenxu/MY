const express = require('express');
const publicController = require('../controllers/publicController');
const scanLoginController = require('../controllers/scanLoginController');
const validate = require('../middleware/validate');
const { authLimiter, qrCreateLimiter, qrStatusLimiter } = require('../middleware/rateLimiter');
const pv = require('../validators/publicValidator');

const router = express.Router();

router.get('/runtime-config', publicController.getRuntimeConfig);
router.post('/scan-login/qrcode/create', qrCreateLimiter, validate(pv.createQrCode), scanLoginController.createQrCode);
router.get('/scan-login/qrcode/status', qrStatusLimiter, validate(pv.getQrCodeStatus), scanLoginController.getQrCodeStatus);
router.post('/scan-login/auth/login', authLimiter, validate(pv.wechatAuth), scanLoginController.wechatLogin);

module.exports = router;
