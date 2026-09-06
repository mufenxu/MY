const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CourseOrder = require('../models/CourseOrder');
const logger = require('../utils/logger');

const DASHBOARD_CACHE_TTL_MS = Math.max(
    Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000),
    5000
);

const dashboardCaches = {
    totals: { ttlMs: Math.max(DASHBOARD_CACHE_TTL_MS, 5 * 60 * 1000) },
    activity: { ttlMs: Math.max(DASHBOARD_CACHE_TTL_MS, 60 * 1000) },
    recent: { ttlMs: DASHBOARD_CACHE_TTL_MS },
};
const DAY_MS = 24 * 60 * 60 * 1000;

async function getDashboardPart(name, key, load) {
    const cache = dashboardCaches[name];
    if (cache.value && cache.key === key && Date.now() < cache.expiresAt) return cache.value;
    if (cache.pending && cache.pendingKey === key) return cache.pending;
    const pending = load().then((value) => {
        if (cache.pending === pending) {
            Object.assign(cache, { value, key, expiresAt: Date.now() + cache.ttlMs });
        }
        return value;
    }).finally(() => {
        if (cache.pending === pending) cache.pending = null;
    });
    cache.pending = pending;
    cache.pendingKey = key;
    return pending;
}

function getDayStartTimestamp(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function formatTrendDate(ts) {
    return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

async function loadDashboardStats(nowMs) {
    const today = getDayStartTimestamp(nowMs);
    const week = new Date(today);
    week.setDate(week.getDate() - week.getDay());
    const trendStart = today - 6 * DAY_MS;
    const dailyCounts = (field) => [
        { $match: { [field]: { $gte: trendStart, $lt: today + DAY_MS } } },
        { $group: {
            _id: { $floor: { $divide: [{ $subtract: [`$${field}`, trendStart] }, DAY_MS] } },
            count: { $sum: 1 },
        } },
    ];
    const [totals, activity, recent] = await Promise.all([
        getDashboardPart('totals', 0, async () => {
            const [users, notifications, auditLogs, orders] = await Promise.all(
                [User, Notification, AuditLog, CourseOrder].map((Model) => Model.countDocuments({}).hint({ _id: 1 }))
            );
            return { users, notifications, auditLogs, orders };
        }),
        getDashboardPart('activity', today, async () => {
            const [userRows, activeUsers, published, auditToday, activeOrders, orderTrend] = await Promise.all([
                User.aggregate([
                    { $match: { createdAt: { $gte: Math.min(trendStart, week.getTime()) } } },
                    { $facet: {
                        summary: [{ $group: {
                            _id: null,
                            newToday: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] } },
                            newThisWeek: { $sum: { $cond: [{ $gte: ['$createdAt', week.getTime()] }, 1, 0] } },
                        } }],
                        trend: dailyCounts('createdAt'),
                    } },
                ]),
                User.countDocuments({ status: 'active' }),
                Notification.countDocuments({ is_published: true }),
                AuditLog.countDocuments({ ts: { $gte: today } }),
                CourseOrder.countDocuments({ status: { $in: ['Pending', 'Processing'] } }),
                CourseOrder.aggregate(dailyCounts('createTime')),
            ]);
            return { userRows, activeUsers, published, auditToday, activeOrders, orderTrend };
        }),
        getDashboardPart('recent', 0, async () => {
            const [users, logs] = await Promise.all([
                User.find({}).select('nickName avatarUrl role status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
                AuditLog.find({}).select('action actorOpenid ts').sort({ ts: -1 }).limit(10).lean(),
            ]);
            return { users, logs };
        }),
    ]);
    const users = activity.userRows[0]?.summary[0] || {};
    const usersByDay = new Map((activity.userRows[0]?.trend || []).map((row) => [row._id, row.count]));
    const ordersByDay = new Map(activity.orderTrend.map((row) => [row._id, row.count]));
    return {
        success: true,
        data: {
            users: { total: totals.users, active: activity.activeUsers, newToday: users.newToday || 0, newThisWeek: users.newThisWeek || 0 },
            notifications: { total: totals.notifications, published: activity.published },
            auditLogs: { total: totals.auditLogs, today: activity.auditToday },
            orders: { total: totals.orders, active: activity.activeOrders },
            trend: Array.from({ length: 7 }, (_, index) => ({
                date: formatTrendDate(trendStart + index * DAY_MS),
                users: usersByDay.get(index) || 0,
                orders: ordersByDay.get(index) || 0,
            })),
            recentUsers: recent.users,
            recentLogs: recent.logs,
        },
    };
}

exports.getDashboardStats = async (req, res) => {
    try {
        res.json(await loadDashboardStats(Date.now()));
    } catch (error) {
        logger.error('Stats Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
