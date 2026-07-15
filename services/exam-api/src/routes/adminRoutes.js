/**
 * 管理员路由
 */
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auditMutations } = require('../middleware/auditLog');
const authenticateAdmin = require('../middleware/auth');
const requireCsrfToken = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const adminValidator = require('../validators/adminValidator');

// 公开路由（需限流）
router.post('/login', authLimiter, validate(adminValidator.login), adminController.login);
router.post('/auth/wechat/login', authLimiter, validate(adminValidator.wechatAuth), adminController.wechatLogin);
router.post('/logout', adminController.logout);

// 需要认证的路由
router.use(authenticateAdmin);
router.use(requireCsrfToken);
router.use(auditMutations({ actorType: 'admin' }));
router.get('/me', adminController.getMe);
router.post('/change-password', validate(adminValidator.changePassword), adminController.changePassword);
router.post('/auth/wechat/bind', validate(adminValidator.wechatAuth), adminController.wechatBind);
router.post('/auth/wechat/unbind', adminController.wechatUnbind);
router.get('/stats', adminController.getStats);

module.exports = router;
