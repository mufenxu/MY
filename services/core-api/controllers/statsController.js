const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CourseOrder = require('../models/CourseOrder');
const AuthScanLog = require('../models/AuthScanLog');
const logger = require('../utils/logger');

const DASHBOARD_CACHE_TTL_MS = Math.max(
    Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000),
    5000
);

let dashboardCache = null;

function getDayStartTimestamp(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function formatTrendDate(ts) {
    return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

/**
 * 获取仪表盘统计数据
 */
exports.getDashboardStats = async (req, res) => {
    const nowMs = Date.now();
    if (dashboardCache && nowMs < dashboardCache.expiresAt) {
        return res.json(dashboardCache.payload);
    }

    try {
        const now = new Date(nowMs);
        const todayStartTs = getDayStartTimestamp(now);
        const weekStart = new Date(todayStartTs);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekStartTs = weekStart.getTime();

        const [
            totalUsers,
            activeUsers,
            newUsersToday,
            newUsersThisWeek,
            totalNotifications,
            publishedNotifications,
            totalAuditLogs,
            todayAuditLogs,
            recentUsers,
            recentLogs,
            totalOrders,
            activeOrders,
            totalScans,
            todayScans
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ status: 'active' }),
            User.countDocuments({ createdAt: { $gte: todayStartTs } }),
            User.countDocuments({ createdAt: { $gte: weekStartTs } }),

            Notification.countDocuments(),
            Notification.countDocuments({ is_published: true }),

            AuditLog.countDocuments(),
            AuditLog.countDocuments({ ts: { $gte: todayStartTs } }),

            User.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('nickName avatarUrl role status createdAt')
                .lean(),
            AuditLog.find()
                .sort({ ts: -1 })
                .limit(10)
                .select('action actorOpenid ts')
                .lean(),

            CourseOrder.countDocuments(),
            CourseOrder.countDocuments({ status: { $in: ['Pending', 'Processing'] } }),

            AuthScanLog.countDocuments(),
            AuthScanLog.countDocuments({ createTime: { $gte: todayStartTs } })
        ]);

        const oneDayMs = 24 * 60 * 60 * 1000;
        const trendStart = todayStartTs - 6 * oneDayMs;

        const trend = await Promise.all(
            Array.from({ length: 7 }, async (_, index) => {
                const start = trendStart + index * oneDayMs;
                const end = start + oneDayMs;

                const [userCount, orderCount] = await Promise.all([
                    User.countDocuments({ createdAt: { $gte: start, $lt: end } }),
                    CourseOrder.countDocuments({ createTime: { $gte: start, $lt: end } })
                ]);

                return {
                    date: formatTrendDate(start),
                    users: userCount,
                    orders: orderCount
                };
            })
        );

        const payload = {
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    newToday: newUsersToday,
                    newThisWeek: newUsersThisWeek
                },
                notifications: {
                    total: totalNotifications,
                    published: publishedNotifications
                },
                auditLogs: {
                    total: totalAuditLogs,
                    today: todayAuditLogs
                },
                orders: {
                    total: totalOrders,
                    active: activeOrders
                },
                scans: {
                    total: totalScans,
                    today: todayScans
                },
                trend,
                recentUsers,
                recentLogs
            }
        };

        dashboardCache = {
            expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
            payload
        };

        res.json(payload);
    } catch (error) {
        logger.error('Stats Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
