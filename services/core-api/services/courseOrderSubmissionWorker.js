const CourseOrder = require('../models/CourseOrder');
const CourseCategory = require('../models/CourseCategory');
const mxPlatform = require('../utils/mxPlatform');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const STALE_SUBMISSION_MS = 2 * 60 * 1000;

let timer = null;
let drainPromise = null;
let drainAgain = false;

function configuredConcurrency() {
    const parsed = Number.parseInt(process.env.ORDER_SUBMIT_CONCURRENCY || '', 10);
    return Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, 1), 10)
        : DEFAULT_CONCURRENCY;
}

function configuredPollInterval() {
    const parsed = Number.parseInt(process.env.ORDER_SUBMIT_POLL_INTERVAL_MS || '', 10);
    return Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, 1000), 60000)
        : DEFAULT_POLL_INTERVAL_MS;
}

async function runWithConcurrency(items, limit, handler) {
    let cursor = 0;
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (cursor < items.length) {
                const index = cursor++;
                await handler(items[index]);
            }
        }
    );
    await Promise.all(workers);
}

async function markOrder(orderId, status, values = {}) {
    const updated = await CourseOrder.findOneAndUpdate(
        { _id: orderId, status: 'Submitting' },
        {
            $set: {
                status,
                updateTime: Date.now(),
                ...values
            }
        },
        { new: true }
    );
    if (!updated) {
        logger.error('[CourseOrderWorker] Lost status ownership while finalizing an order', {
            orderId: String(orderId),
            targetStatus: status
        });
    }
    return updated;
}

async function loadCategory(order) {
    if (order.categoryId) {
        const byId = await CourseCategory.findById(order.categoryId);
        if (byId) return byId;
    }
    return CourseCategory.findOne({ noun: order.platformId });
}

async function processClaimedOrder(order) {
    const category = await loadCategory(order);
    if (!category) {
        await markOrder(order._id, 'Failed', {
            statusText: '配置错误',
            remarks: '订单对应的课程平台配置不存在'
        });
        return;
    }

    try {
        const response = await mxPlatform.submitOrder({
            school: order.school,
            user: order.account,
            pass: decrypt(order.password),
            category,
            courseId: order.courseId,
            courseName: order.courseName,
            duration: order.duration,
            clientTradeNo: order.tradeNo
        });
        const remoteOrderId = response && (response.id || response.yid || response.oid);

        if (response && response.code == 0 && remoteOrderId) {
            await markOrder(order._id, 'Processing', {
                remoteOrderId: String(remoteOrderId),
                statusText: '进行中',
                remarks: '第三方已受理'
            });
            return;
        }

        if (response && response.code == 0) {
            await markOrder(order._id, 'ReconcilePending', {
                statusText: '待核对',
                remarks: '第三方返回已受理，但未返回可核对的订单号；请勿重复提交'
            });
            return;
        }

        await markOrder(order._id, 'Failed', {
            statusText: '未受理',
            remarks: String(response?.msg || response?.message || '第三方明确拒绝订单').slice(0, 500)
        });
    } catch (error) {
        logger.error(`[CourseOrderWorker] Submission outcome unknown for ${order.tradeNo}`, {
            message: error.message,
            code: error.code
        });
        const outcomeUnknown = error.outcomeUnknown !== false;
        await markOrder(order._id, outcomeUnknown ? 'ReconcilePending' : 'Failed', {
            statusText: outcomeUnknown ? '待核对' : '未受理',
            remarks: outcomeUnknown
                ? '提交结果未知，系统不会自动重投；请等待人工或上游核对'
                : String(error.message || '第三方明确拒绝订单').slice(0, 500)
        });
    }
}

async function claimAndProcess(orderId) {
    const now = Date.now();
    const order = await CourseOrder.findOneAndUpdate(
        {
            _id: orderId,
            status: 'Pending',
            submissionKey: { $type: 'string' },
            batchId: { $type: 'string', $ne: '' }
        },
        {
            $set: {
                status: 'Submitting',
                statusText: '提交中',
                lastSubmitAttemptAt: now,
                updateTime: now
            },
            $inc: { submitAttempts: 1 }
        },
        { new: true }
    );
    if (!order) return false;
    await processClaimedOrder(order);
    return true;
}

async function drainOnce() {
    await recoverStaleSubmissions();
    const candidates = await CourseOrder.find({
        status: 'Pending',
        submissionKey: { $type: 'string' },
        batchId: { $type: 'string', $ne: '' }
    })
        .select('_id')
        .sort({ createTime: 1 })
        .limit(50)
        .lean();
    await runWithConcurrency(candidates, configuredConcurrency(), (candidate) =>
        claimAndProcess(candidate._id)
    );
    return candidates.length;
}

async function recoverLegacyPendingOrders() {
    return CourseOrder.updateMany(
        {
            status: 'Pending',
            $or: [
                { submissionKey: { $exists: false } },
                { submissionKey: { $not: { $type: 'string' } } },
                { batchId: { $exists: false } },
                { batchId: '' }
            ]
        },
        {
            $set: {
                status: 'ReconcilePending',
                statusText: '待核对',
                remarks: '历史待处理订单的上游结果未知；升级后不会自动重投',
                updateTime: Date.now()
            }
        }
    );
}

async function recoverStaleSubmissions() {
    const staleBefore = Date.now() - STALE_SUBMISSION_MS;
    return CourseOrder.updateMany(
        { status: 'Submitting', lastSubmitAttemptAt: { $lte: staleBefore } },
        {
            $set: {
                status: 'ReconcilePending',
                statusText: '待核对',
                remarks: '提交任务失去执行上下文，结果未知；系统不会自动重投',
                updateTime: Date.now()
            }
        }
    );
}

function kick() {
    if (drainPromise) {
        drainAgain = true;
        return drainPromise;
    }

    drainPromise = (async () => {
        do {
            drainAgain = false;
            const processed = await drainOnce();
            if (processed === 50) drainAgain = true;
        } while (drainAgain);
    })().catch((error) => {
        logger.error('[CourseOrderWorker] Drain failed', { message: error.message, stack: error.stack });
    }).finally(() => {
        drainPromise = null;
    });
    return drainPromise;
}

async function start() {
    await recoverLegacyPendingOrders();
    await recoverStaleSubmissions();
    if (!timer) {
        timer = setInterval(kick, configuredPollInterval());
        timer.unref?.();
    }
    kick();
}

async function stop() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    if (drainPromise) await drainPromise;
}

module.exports = {
    claimAndProcess,
    kick,
    processClaimedOrder,
    recoverLegacyPendingOrders,
    recoverStaleSubmissions,
    start,
    stop
};
