const crypto = require('crypto');
const CourseOrder = require('../models/CourseOrder');
const CourseCategory = require('../models/CourseCategory');
const mxPlatform = require('../utils/mxPlatform');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/crypto');

// 转义正则表达式特殊字符，防止 ReDoS 攻击
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 生成安全的订单号
function generateTradeNo() {
    return `WK${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * ===== 管理员专用接口部分 =====
 */

/**
 * 获取所有订单明细大盘 (带分页与搜索)
 */
exports.getAllOrdersForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const { tradeNo, status, account, school } = req.query;

        // 构建查询条件（使用 escapeRegex 防止 ReDoS）
        let query = {};
        if (tradeNo) query.tradeNo = new RegExp(escapeRegex(tradeNo), 'i');
        if (status) query.status = status;
        if (account) query.account = new RegExp(escapeRegex(account), 'i');
        if (school) query.school = new RegExp(escapeRegex(school), 'i');

        // 并行执行查询 + 计数
        const [rawOrders, total] = await Promise.all([
            CourseOrder.find(query)
                .sort({ createTime: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('userId', 'nickName avatarUrl')
                .lean(),
            CourseOrder.countDocuments(query)
        ]);

        // 密码脱敏处理：管理后台列表不返回真实密码
        const orders = rawOrders.map(order => {
            if (order.password) order.password = '***';
            return order;
        });

        res.json({ code: 200, data: { list: orders, total, page, limit } });
    } catch (error) {
        logger.error(`[AdminGetOrders] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
};

/**
 * 后台单条/批量刷新状态（并发执行，限制最多 5 个并发）
 */
exports.adminRefreshProgress = async (req, res) => {
    try {
        const { orderIds } = req.body;
        
        if (!orderIds || orderIds.length === 0) {
            return res.json({ code: 400, message: "请选择需要刷新的订单" });
        }

        // 并发刷新：使用 Promise.allSettled 并行处理，限制并发数
        const MAX_CONCURRENT = 5;
        let success = 0;
        let fail = 0;

        // 分批处理
        for (let i = 0; i < orderIds.length; i += MAX_CONCURRENT) {
            const batch = orderIds.slice(i, i + MAX_CONCURRENT);
            const results = await Promise.allSettled(
                batch.map(tradeNo => _refreshSingleOrder(tradeNo))
            );

            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    success++;
                } else {
                    fail++;
                }
            });
        }

        res.json({ code: 200, message: `操作完成！成功刷新 ${success} 条，失败 ${fail} 条。` });

    } catch (error) {
        logger.error(`[AdminRefreshProgress] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
}

/**
 * 内部方法：刷新单个订单进度
 */
async function _refreshSingleOrder(tradeNo) {
    const order = await CourseOrder.findOne({ tradeNo });
    if (!order || (!order.remoteOrderId && !order.remoteOid)) {
        return false;
    }

    try {
        const category = await CourseCategory.findOne({ noun: order.platformId });
        if (!category) {
            logger.warn(`[AdminRefresh] Category not found for platformId: ${order.platformId}`);
            return false;
        }

        const mxRes = await mxPlatform.queryProgressEnhanced(order.account, category, order.remoteOid, order.remoteOrderId);
        if (mxRes && mxRes.code == 1 && mxRes.data && mxRes.data.length > 0) {
            const row = mxRes.data[0];
            order.statusText = row.status || order.statusText;
            order.progress = row.process || order.progress;
            order.remarks = row.remarks || order.remarks;

            if (row.status === '已完成') order.status = 'Completed';
            if (row.status === '异常') order.status = 'Failed';

            if (row.kcname) order.courseName = row.kcname;
            if (row.school) order.school = row.school;
            if (row.ptname) order.platformName = row.ptname;
            if (row.id) order.remoteOid = row.id;
            if (row.kcid) order.courseId = row.kcid;

            if (row.addtime) {
                const timeStr = row.addtime.replace(/-/g, '/');
                const remoteTime = new Date(timeStr).getTime();
                if (!isNaN(remoteTime)) {
                    order.createTime = remoteTime;
                }
            }

            await order.save();
            return true;
        }
        return false;
    } catch (err) {
        logger.error(`[AdminRefresh] Error refreshing ${tradeNo}: ${err.message}`);
        return false;
    }
}

/**
 * 后台删除订单或退款废弃
 */
exports.adminDeleteOrder = async (req, res) => {
    try {
        const { tradeNo } = req.params;
        await CourseOrder.deleteOne({ tradeNo });
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        logger.error(`[AdminDeleteOrder] ${e.message}`, { stack: e.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
}

/**
 * 管理员手动录入订单
 */
exports.adminCreateOrder = async (req, res) => {
    try {
        const {
            userId,
            account,
            password,
            categoryId,
            remoteOrderId,
            remoteOid,
            courseName,
            courseId,
            school,
            status,
            remarks
        } = req.body;

        if (!account || !password || !categoryId) {
            return res.status(400).json({
                code: 400,
                message: '账号、密码、网课分类为必填项'
            });
        }

        const category = await CourseCategory.findById(categoryId);
        if (!category) {
            return res.status(404).json({ code: 404, message: '无效的网课分类' });
        }

        const tradeNo = generateTradeNo();

        const orderData = {
            userId: userId || req.user._id,
            tradeNo,
            platformCode: category.docking || 'mx',
            platformId: category.noun,
            platformName: category.name || '未知平台',
            school: school || '',
            account,
            password: encrypt(password),
            courseId: courseId || '',
            courseName: courseName || '',
            remoteOrderId: remoteOrderId || '',
            remoteOid: remoteOid || '',
            status: status || 'Processing',
            statusText: status === 'Completed' ? '已完成' : (status === 'Failed' ? '异常' : '进行中'),
            progress: '0%',
            remarks: remarks || '管理员手动录入',
            isManual: true
        };

        const order = new CourseOrder(orderData);
        await order.save();

        res.json({
            code: 200,
            message: '订单录入成功',
            data: order
        });
    } catch (error) {
        logger.error(`[AdminCreateOrder] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
}

/**
 * 管理员编辑订单
 */
exports.adminUpdateOrder = async (req, res) => {
    try {
        const { tradeNo } = req.params;
        const updates = req.body;

        if (!tradeNo) {
            return res.status(400).json({ code: 400, message: '缺少订单号' });
        }

        const order = await CourseOrder.findOne({ tradeNo });
        if (!order) {
            return res.status(404).json({ code: 404, message: '订单不存在' });
        }

        // 允许修改的字段白名单
        const allowedFields = [
            'account', 'password', 'school', 'courseName', 'courseId',
            'remoteOrderId', 'remoteOid', 'platformCode', 'platformId', 'platformName',
            'status', 'statusText', 'progress', 'remarks', 'userId', 'isHidden'
        ];

        if (updates.categoryId) {
            const category = await CourseCategory.findById(updates.categoryId);
            if (category) {
                order.platformCode = category.docking || 'mx';
                order.platformId = category.noun;
                order.platformName = category.name || '未知平台';
            }
        }

        allowedFields.forEach(field => {
            if (updates[field] === undefined || updates[field] === null) {
                return;
            }

            if (field === 'password') {
                const rawPassword = String(updates.password).trim();
                // 编辑场景下忽略空值/占位值，避免把 "***" 写入数据库
                if (!rawPassword || rawPassword === '***') {
                    return;
                }
                order.password = encrypt(rawPassword);
                return;
            }

            order[field] = updates[field];
        });

        // 自动同步 statusText
        if (updates.status && !updates.statusText) {
            const statusTextMap = {
                'Pending': '待处理',
                'Processing': '进行中',
                'Completed': '已完成',
                'Failed': '异常',
                'Cancelled': '已取消',
                'Refushing': '补刷中'
            };
            order.statusText = statusTextMap[updates.status] || order.statusText;
        }

        await order.save();

        res.json({ code: 200, message: '订单已更新', data: order });
    } catch (error) {
        logger.error(`[AdminUpdateOrder] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
}
