const express = require('express');
const router = express.Router();
const secretController = require('../controllers/secretController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// 密钥管理接口 - 仅限 super_admin 访问
router.get('/', auth.verifyToken, authorize('super_admin'), secretController.getAllSecrets);
router.post('/update', auth.verifyToken, authorize('super_admin'), secretController.updateSecret);
router.delete('/:key', auth.verifyToken, authorize('super_admin'), secretController.deleteSecret);

module.exports = router;
