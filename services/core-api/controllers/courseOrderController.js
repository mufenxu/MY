const crypto = require('crypto');
const CourseOrder = require('../models/CourseOrder');
const CourseCategory = require('../models/CourseCategory');
const PlatformConfig = require('../models/PlatformConfig');
const mxPlatform = require('../utils/mxPlatform');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/crypto');
const { escapeRegex } = require('../utils/helpers');

// 全局记录正在进行的查课账号（同分类同账号防止并发多次向第三方发起请求）
const activeQueries = new Set();


// 生成安全的订单号（crypto 随机，防碰撞）
function generateTradeNo() {
    return `WK${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

async function runWithConcurrency(items, limit, handler) {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.min(limit, items.length);

    const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) break;
            results[index] = await handler(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}

function serializeOrderForClient(order) {
    const source = order && typeof order.toObject === 'function'
        ? order.toObject({ versionKey: false })
        : (order || {});
    const canRefresh = Boolean(source.remoteOrderId || source.remoteOid);

    return {
        _id: source._id,
        tradeNo: source.tradeNo,
        platformCode: source.platformCode,
        platformId: source.platformId,
        platformName: source.platformName,
        school: source.school,
        account: source.account,
        courseId: source.courseId,
        courseName: source.courseName,
        duration: source.duration,
        status: source.status,
        statusText: source.statusText,
        progress: source.progress,
        remarks: source.remarks,
        price: source.price,
        isMiaoshua: source.isMiaoshua,
        isManual: source.isManual,
        canRefresh,
        canRetry: Boolean(source.remoteOrderId),
        createTime: source.createTime,
        updateTime: source.updateTime
    };
}

/**
 * 查课功能 (直接透传给mx工具，不存数据库)
 * 请求参数: { school, user, pass, categoryId }
 */
exports.queryCourseList = async (req, res) => {
    try {
        const { school, user, pass, categoryId } = req.body;
        if (!user || !pass || !categoryId) {
            return res.status(400).json({ code: 400, message: '缺少账号、密码或者平台信息' });
        }

        const category = await CourseCategory.findById(categoryId);
        if (!category) {
            return res.status(404).json({ code: 404, message: '无效的网课分类' });
        }
        
        const platformId = category.getnoun; 
        
        // 并发锁防刷逻辑
        const queryKey = `${categoryId}:${user}`;
        if (activeQueries.has(queryKey)) {
            return res.status(429).json({ code: 429, message: '该账号正在查询中，请勿重复提交' });
        }
        activeQueries.add(queryKey);
        
        try {
            const mxResult = await mxPlatform.queryCourses(school, user, pass, category);
            
            // 归一化处理：MX 平台返回的数据结构比较杂，有的是 {data: []}，有的是 {0: {}, 1: {}}
            let normalizedData = [];
            
            if (mxResult) {
                let rawList = mxResult.data || mxResult;
                
                if (typeof rawList === 'string') {
                    try { rawList = JSON.parse(rawList); } catch(e) {}
                }

                if (rawList && typeof rawList === 'object' && !Array.isArray(rawList)) {
                    if (rawList.data && Array.isArray(rawList.data)) {
                        normalizedData = rawList.data;
                    } else {
                        const keys = Object.keys(rawList).filter(k => !isNaN(k));
                        if (keys.length > 0) {
                            normalizedData = keys.map(k => rawList[k]);
                        } else if (!rawList.code && !rawList.msg) {
                            normalizedData = [rawList];
                        }
                    }
                } else if (Array.isArray(rawList)) {
                    normalizedData = rawList;
                }
            }

            if (normalizedData.length > 0) {
                 const stats = await PlatformConfig.findOne({ platformCode: category.docking || 'mx' });
                 let warning = '';
                 if (stats && stats.queryCount > 20) {
                     const ratio = (stats.orderCount / stats.queryCount) * 100;
                     if (ratio < 2) {
                         warning = `\n\n⚠️ 警告：当前平台[下单/查课]比例为 ${ratio.toFixed(2)}%，已低于安全阈值(2%)。继续查询每单将扣除0.1积分。`;
                     }
                 }

                 res.json({ 
                     code: 200, 
                     message: '查课成功' + warning, 
                     data: normalizedData,
                     _raw: mxResult
                 });
            } else {
                 const errorMsg = mxResult?.msg || mxResult?.message || '该账号下未查询到有效课程';
                 res.json({ code: 400, message: errorMsg });
            }
        } finally {
            // 确保并发锁一定会释放
            activeQueries.delete(queryKey);
        }
    } catch (error) {
        logger.error(`[QueryCourse] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
};

/**
 * 提交订单 (本地生成订单 -> 向上游请求 -> 写入 remoteOrderId)
 */
exports.submitOrder = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { school, user, pass, categoryId, courseList, duration } = req.body;

        if (!courseList || !courseList.length) {
            return res.status(400).json({ code: 400, message: '请至少选择一门课程' });
        }

        const category = await CourseCategory.findById(categoryId);
        if (!category) {
            return res.status(404).json({ code: 404, message: '系统不存在此网课' });
        }
        
        const platformId = category.noun; 
        
        const configuredConcurrency = Number(process.env.ORDER_SUBMIT_CONCURRENCY || 3);
        const concurrency = Number.isFinite(configuredConcurrency)
            ? Math.min(Math.max(Math.floor(configuredConcurrency), 1), 10)
            : 3;

        const submitResults = await runWithConcurrency(courseList, concurrency, async (course) => {
            const tradeNo = generateTradeNo();

            const orderRecord = new CourseOrder({
                userId,
                tradeNo,
                platformCode: category.docking || 'mx',
                platformId: platformId,
                platformName: category.name || category.title || '未知平台',
                school,
                account: user,
                password: encrypt(pass),
                courseId: course.id || course.kcid,
                courseName: course.name || course.kcname,
                duration: duration || 30,
                status: 'Pending',
                statusText: '请求中'
            });
            await orderRecord.save();

            try {
                const mxRes = await mxPlatform.submitOrder({
                    school, user, pass, category,
                    courseId: course.id || course.kcid,
                    courseName: course.name || course.kcname,
                    duration
                });

                if (mxRes && mxRes.code == 0) {
                    orderRecord.remoteOrderId = mxRes.id || mxRes.yid;
                    orderRecord.status = 'Processing';
                    orderRecord.statusText = '进行中';
                    orderRecord.remarks = '第三方受理成功';
                    await orderRecord.save();
                    return true;
                } else {
                    orderRecord.status = 'Failed';
                    orderRecord.statusText = '异常';
                    orderRecord.remarks = mxRes.msg || '第三方受理失败';
                    await orderRecord.save();
                    return false;
                }
            } catch (err) {
                orderRecord.status = 'Failed';
                orderRecord.statusText = '网络错误';
                orderRecord.remarks = err.message;
                await orderRecord.save();
                return false;
            }
        });

        const successCount = submitResults.filter(Boolean).length;
        const failCount = submitResults.length - successCount;

        res.json({
            code: 200,
            message: `提交完毕！成功: ${successCount} 单，失败: ${failCount} 单。`
        });

    } catch (error) {
        logger.error(`[SubmitOrder] ${error.message}`, { stack: error.stack });
        res.status(500).json({ 
            code: 500, 
            message: '订单提交失败，请稍后重试'
        });
    }
};

/**
 * 获取我的全部订单清单
 */
exports.getMyOrders = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const keyword = req.query.keyword ? req.query.keyword.trim() : '';
        const searchField = req.query.searchField ? req.query.searchField.trim() : '';

        const match = { userId, isHidden: { $ne: true }, account: { $ne: '' } };
        if (keyword) {
            const safeKeyword = escapeRegex(keyword);
            const regex = new RegExp(safeKeyword, 'i');

            // 支持精确字段搜索：当 searchField 指定时，只搜索对应字段
            const allowedSearchFields = ['account', 'platformName', 'courseName', 'tradeNo'];
            if (searchField && allowedSearchFields.includes(searchField)) {
                match[searchField] = regex;
            } else {
                // 通用搜索模式：搜索多个字段
                const matchedCategories = await CourseCategory.find({
                    $or: [{ name: regex }, { title: regex }, { noun: regex }]
                }).lean();
                const matchedNouns = matchedCategories.map(c => c.noun);

                match.$or = [
                    { account: regex },
                    { platformName: regex },
                    { platformId: regex },
                    { platformId: { $in: matchedNouns } },
                    { platformCode: regex },
                    { courseName: regex },
                    { tradeNo: regex }
                ];
            }
        }

        // 并行执行查询 + 计数，提升性能
        const [orders, total] = await Promise.all([
            CourseOrder.find(match)
                .select('tradeNo platformCode platformId platformName school account courseId courseName duration status statusText progress remarks price isMiaoshua isManual createTime updateTime remoteOrderId remoteOid')
                .lean()
                .sort({ createTime: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            CourseOrder.countDocuments(match)
        ]);

        // 兼容历史订单的显示
        const nouns = [...new Set(orders.map(o => o.platformId))];
        const categories = await CourseCategory.find({ noun: { $in: nouns } }).lean();
        const categoryMap = {};
        categories.forEach(c => { categoryMap[c.noun] = c.name });

        const enrichedOrders = orders.map(order => {
            return serializeOrderForClient({
                ...order,
                platformName: order.platformName || categoryMap[order.platformId] || order.platformCode
            });
        });

        res.json({ code: 200, data: { list: enrichedOrders, total } });
    } catch (error) {
        logger.error(`[GetMyOrders] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
};

/**
 * 查询单笔订单进度 (触发第三方实时接口，将结果覆写回本地数据库)
 */
exports.refreshProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { tradeNo } = req.body;

        const order = await CourseOrder.findOne({ tradeNo, userId });
        if (!order) {
            return res.status(404).json({ code: 404, message: '找不到订单，或无权操作此订单' });
        }

        if (!order.remoteOrderId && !order.remoteOid) {
            return res.json({ code: 400, message: '该订单为无底单异常流，无法查到远程进度' });
        }

        const category = await CourseCategory.findOne({ noun: order.platformId });
        const orderId = order.remoteOid || order.remoteOrderId;
        const mxRes = await mxPlatform.queryProgress(order.account, category, orderId);

        if (mxRes && mxRes.code == 1 && mxRes.data && mxRes.data.length > 0) {
            const row = mxRes.data[0];
            order.statusText = row.status || order.statusText;
            
            let rawProgress = row.process;
            if (rawProgress === 'NAN%' || !rawProgress) {
                const progressMatch = (row.remarks || '').match(/进度:(\d+)\/100/);
                if (progressMatch) rawProgress = progressMatch[1] + '%';
            }
            order.progress = (rawProgress && rawProgress !== 'NAN%') ? rawProgress : order.progress;
            order.remarks = row.remarks || order.remarks;

            if (row.status === '已完成' || row.status === '已完结') order.status = 'Completed';
            if (row.status === '异常' || row.status === '失败') order.status = 'Failed';
            
            if (order.isManual) {
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
                        order.markModified('createTime');
                    }
                }
            } else {
                if (!order.courseName && row.kcname) order.courseName = row.kcname;
                if (!order.school && row.school) order.school = row.school;
                if (!order.platformName && row.ptname) order.platformName = row.ptname;
                if (!order.remoteOid && row.id) order.remoteOid = row.id;
            }

            await order.save();
            return res.json({ code: 200, message: '进度已刷新', data: serializeOrderForClient(order) });
        } else {
            return res.json({ code: 200, message: mxRes?.msg || '已请求刷新，请稍后再试', data: serializeOrderForClient(order) });
        }

    } catch (error) {
        logger.error(`[RefreshProgress] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
};

/**
 * 补刷订单
 */
exports.retryOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { tradeNo } = req.body;

        const order = await CourseOrder.findOne({ tradeNo, userId });
        if (!order) {
            return res.status(404).json({ code: 404, message: '找不到订单，或无权操作此订单' });
        }

        if (!order.remoteOrderId) {
            return res.json({ code: 400, message: '该订单为无底单异常流，无法远程补刷' });
        }

        const mxRes = await mxPlatform.retryOrder(order.account, decrypt(order.password), order.remoteOrderId, order.platformCode);

        if (mxRes && (mxRes.code == 1 || mxRes.code == 0)) {
            order.status = 'Processing';
            order.statusText = '已补刷';
            order.remarks = mxRes.msg || '操作成功，请稍后再查进度';
            await order.save();
            return res.json({ code: 200, message: '补单提交成功', data: serializeOrderForClient(order) });
        } else {
            return res.json({ code: 400, message: mxRes?.msg || '操作失败' });
        }
    } catch (error) {
        logger.error(`[RetryOrder] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器内部错误，请稍后重试' });
    }
};

/**
 * 极简公开查询 (免登录)
 * 只展示核心进度，隐藏密码和上游平台详情
 */
exports.publicSearch = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json({ code: 400, message: '请输入有效的订单号或下单账号' });
        }

        const safeQuery = escapeRegex(q.trim());
        const regex = new RegExp(`^${safeQuery}$`, 'i'); // 默认精确匹配提升安全性

        // 查询条件：订单号或账号
        const match = { 
            $or: [{ tradeNo: regex }, { account: regex }],
            isHidden: { $ne: true }
        };

        const orders = await CourseOrder.find(match)
            .select('tradeNo account courseName statusText progress remarks updateTime createTime') // 明确排除平台等敏感字段
            .sort({ createTime: -1 })
            .limit(10)
            .lean();

        if (orders.length === 0) {
            return res.json({ code: 404, message: '未找到相关订单信息，请核对输入' });
        }

        // 数据脱敏
        const safeOrders = orders.map(order => {
            // 账号脱敏 (例如: 138****8888)
            const acc = order.account || '';
            const maskedAccount = acc.length > 7 
                ? acc.substring(0, 3) + '****' + acc.substring(acc.length - 4)
                : acc.length > 2 
                    ? acc.substring(0, 2) + '***'
                    : '***';
            
            return {
                tradeNo: order.tradeNo,
                account: maskedAccount,
                courseName: order.courseName,
                statusText: order.statusText || '进行中',
                progress: order.progress || '0%',
                remarks: order.remarks || '正在努力更新进度...',
                updateTime: order.updateTime,
                createTime: order.createTime
            };
        });

        res.json({ code: 200, data: safeOrders });
    } catch (error) {
        logger.error(`[PublicSearch] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '系统繁忙，请稍后再试' });
    }
};

/**
 * 公开强制刷新 (免登录)
 * 为单笔订单触发上游同步
 */
exports.publicRefresh = async (req, res) => {
    try {
        const { tradeNo } = req.body;
        if (!tradeNo) {
            return res.status(400).json({ code: 400, message: '无效的订单号' });
        }

        // 仅根据订单号查询，且未隐藏的
        const order = await CourseOrder.findOne({ tradeNo, isHidden: { $ne: true } });
        if (!order) {
            return res.status(404).json({ code: 404, message: '未找到该订单，无法刷新' });
        }

        if (!order.remoteOrderId && !order.remoteOid) {
            return res.json({ code: 400, message: '该订单为无底单异常流，无法获取远程进度' });
        }

        // 调用第三方同步逻辑 (与 refreshProgress 复用同样逻辑，但不带 userId 校验)
        const category = await CourseCategory.findOne({ noun: order.platformId });
        const orderId = order.remoteOid || order.remoteOrderId;
        const mxRes = await mxPlatform.queryProgress(order.account, category, orderId);

        if (mxRes && mxRes.code == 1 && mxRes.data && mxRes.data.length > 0) {
            const row = mxRes.data[0];
            order.statusText = row.status || order.statusText;
            
            let rawProgress = row.process;
            if (rawProgress === 'NAN%' || !rawProgress) {
                const progressMatch = (row.remarks || '').match(/进度:(\d+)\/100/);
                if (progressMatch) rawProgress = progressMatch[1] + '%';
            }
            order.progress = (rawProgress && rawProgress !== 'NAN%') ? rawProgress : order.progress;
            order.remarks = row.remarks || order.remarks;
            if (row.status === '已完成' || row.status === '已完结') order.status = 'Completed';
            if (row.status === '异常' || row.status === '失败') order.status = 'Failed';

            await order.save();
            
            // 数据脱敏后返回
            return res.json({ 
                code: 200, 
                message: '同步成功', 
                data: {
                    tradeNo: order.tradeNo,
                    statusText: order.statusText,
                    progress: order.progress,
                    remarks: order.remarks,
                    updateTime: Date.now()
                } 
            });
        } else {
            return res.json({ code: 200, message: mxRes?.msg || '已请求同步，请稍后再查', data: { tradeNo: order.tradeNo } });
        }

    } catch (error) {
        logger.error(`[PublicRefresh] ${error.message}`, { stack: error.stack });
        res.status(500).json({ code: 500, message: '服务器繁忙，请稍后再试' });
    }
};
