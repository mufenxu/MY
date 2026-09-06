const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CourseOrder = require('../models/CourseOrder');
const logger = require('../utils/logger');

const DASHBOARD_CACHE_TTL_MS = Math.max(
    Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000),
    5000
);

let dashboardCache = null;
let dashboardRefresh = null;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const [userRows, notificationRows, auditRows, orderRows, recentUsers, recentLogs] = await Promise.all([
        User.aggregate([{ $project: { _id: 0, status: 1, createdAt: 1 } }, { $facet: {
            summary: [{ $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                newToday: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] } },
                newThisWeek: { $sum: { $cond: [{ $gte: ['$createdAt', week.getTime()] }, 1, 0] } },
            } }],
            trend: dailyCounts('createdAt'),
        } }]),
        Notification.aggregate([{ $project: { _id: 0, is_published: 1 } }, { $group: {
            _id: null,
            total: { $sum: 1 },
            published: { $sum: { $cond: [{ $eq: ['$is_published', true] }, 1, 0] } },
        } }]),
        AuditLog.aggregate([{ $project: { _id: 0, ts: 1 } }, { $group: {
            _id: null, total: { $sum: 1 },
            today: { $sum: { $cond: [{ $gte: ['$ts', today] }, 1, 0] } },
        } }]),
        CourseOrder.aggregate([{ $project: { _id: 0, status: 1, createTime: 1 } }, { $facet: {
            summary: [{ $group: {
                _id: null, total: { $sum: 1 },
                active: { $sum: { $cond: [{ $in: ['$status', ['Pending', 'Processing']] }, 1, 0] } },
            } }],
            trend: dailyCounts('createTime'),
        } }]),
        User.find({}).select('nickName avatarUrl role status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
        AuditLog.find({}).select('action actorOpenid ts').sort({ ts: -1 }).limit(10).lean(),
    ]);
    const users = userRows[0]?.summary[0] || {};
    const notifications = notificationRows[0] || {};
    const audit = auditRows[0] || {};
    const orders = orderRows[0]?.summary[0] || {};
    const usersByDay = new Map((userRows[0]?.trend || []).map((row) => [row._id, row.count]));
    const ordersByDay = new Map((orderRows[0]?.trend || []).map((row) => [row._id, row.count]));
    return {
        success: true,
        data: {
            users: { total: users.total || 0, active: users.active || 0, newToday: users.newToday || 0, newThisWeek: users.newThisWeek || 0 },
            notifications: { total: notifications.total || 0, published: notifications.published || 0 },
            auditLogs: { total: audit.total || 0, today: audit.today || 0 },
            orders: { total: orders.total || 0, active: orders.active || 0 },
            trend: Array.from({ length: 7 }, (_, index) => ({
                date: formatTrendDate(trendStart + index * DAY_MS),
                users: usersByDay.get(index) || 0,
                orders: ordersByDay.get(index) || 0,
            })),
            recentUsers,
            recentLogs,
        },
    };
}

exports.getDashboardStats = async (req, res) => {
    const nowMs = Date.now();
    if (dashboardCache && nowMs < dashboardCache.expiresAt) return res.json(dashboardCache.payload);
    try {
        if (!dashboardRefresh) {
            dashboardRefresh = loadDashboardStats(nowMs).then((payload) => {
                dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, payload };
                return payload;
            }).finally(() => { dashboardRefresh = null; });
        }
        res.json(await dashboardRefresh);
    } catch (error) {
        logger.error('Stats Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
