const express = require('express');
const router = express.Router();
const courseCategoryController = require('../controllers/courseCategoryController');
const { verifyToken } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// 小程序端拉取正常运行的上游平台种类（需要登录但不需要管理员权限）
router.get('/active', verifyToken, courseCategoryController.getActiveCategories);

// =============== 管理后台（需管理员权限） ===============
router.get('/admin/list', verifyToken, authorize('admin', 'super_admin'), courseCategoryController.getAdminCategories);
router.post('/admin/save', verifyToken, authorize('admin', 'super_admin'), courseCategoryController.saveCategory);
router.delete('/admin/:id', verifyToken, authorize('admin', 'super_admin'), courseCategoryController.deleteCategory);

module.exports = router;
