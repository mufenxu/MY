const express = require('express');
const router = express.Router();
const courseOrderController = require('../controllers/courseOrderController');
const adminCourseOrderController = require('../controllers/adminCourseOrderController');
const { verifyToken } = require('../middleware/auth');
const { publicSearchLimiter, publicRefreshLimiter } = require('../middleware/rateLimit');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { queryCourseSchema, submitOrderSchema } = require('../schemas/courseOrderSchemas');

router.get('/public-search', publicSearchLimiter, courseOrderController.publicSearch);
router.post('/public-refresh', publicRefreshLimiter, courseOrderController.publicRefresh);
router.post('/query', verifyToken, validate(queryCourseSchema), courseOrderController.queryCourseList);
router.post('/submit', verifyToken, validate(submitOrderSchema), courseOrderController.submitOrder);
router.get('/batch/:batchId', verifyToken, courseOrderController.getOrderBatchStatus);
router.get('/my-orders', verifyToken, courseOrderController.getMyOrders);
router.post('/refresh', verifyToken, courseOrderController.refreshProgress);
router.post('/retry', verifyToken, courseOrderController.retryOrder);

// 管理后台专用 API 路由（需管理员权限）
router.get('/admin/list', verifyToken, authorize('admin', 'super_admin'), adminCourseOrderController.getAllOrdersForAdmin);
router.post('/admin/refresh', verifyToken, authorize('admin', 'super_admin'), adminCourseOrderController.adminRefreshProgress);
router.post('/admin/create', verifyToken, authorize('admin', 'super_admin'), adminCourseOrderController.adminCreateOrder);
router.put('/admin/:tradeNo', verifyToken, authorize('admin', 'super_admin'), adminCourseOrderController.adminUpdateOrder);
router.delete('/admin/:tradeNo', verifyToken, authorize('admin', 'super_admin'), adminCourseOrderController.adminDeleteOrder);

module.exports = router;
