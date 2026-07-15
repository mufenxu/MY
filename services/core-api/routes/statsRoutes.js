const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/statsController');
const auth = require('../middleware/auth');

// 所有统计路由需要认证
router.use(auth);

// 获取仪表盘统计数据
router.get('/dashboard', getDashboardStats);

module.exports = router;
