/**
 * 管理员控制器
 * 处理管理员认证、微信登录绑定、统计信息
 */
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const Question = require('../models/Question');
const ExamResult = require('../models/ExamResult');
const MajorCategory = require('../models/MajorCategory');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { asyncHandler } = require('../utils/exam');
const { success } = require('../utils/response');
const { AuthError, NotFoundError, AppError } = require('../utils/errors');
const { buildAdminScopeQuery } = require('../utils/libraryScope');
const { consumeTempAuthCode } = require('../utils/scanLogin');
const { clearAuthCookies, setAdminAuthCookie } = require('../utils/authCookies');
const { buildCookieAuthPayload } = require('../utils/authResponse');
const {
    registerFailedLoginAtomic,
    resetFailedLoginAtomic,
} = require('../services/adminLoginSecurity');

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const DASHBOARD_TIMEZONE = '+08:00';
const DASHBOARD_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function getRequestContext(req) {
    return {
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    };
}

function buildAdminToken(admin) {
    return jwt.sign(
        {
            id: admin._id,
            username: admin.username,
            role: 'admin',
            tokenVersion: admin.tokenVersion || 0,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn },
    );
}

async function registerFailedLogin(admin) {
    const updated = await registerFailedLoginAtomic({
        adminModel: Admin,
        adminId: admin._id,
        maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockMs: LOGIN_LOCK_MS,
    });

    if (!updated || (updated.lockedUntil && updated.lockedUntil.getTime() > Date.now())) {
        throw new AppError('登录尝试过多，请 15 分钟后再试', 429);
    }

    throw new AuthError('用户名或密码错误');
}

function getZonedStartOfDay(date, offsetMinutes = DASHBOARD_TIMEZONE_OFFSET_MINUTES) {
    const offsetMs = offsetMinutes * 60 * 1000;
    const shifted = new Date(date.getTime() + offsetMs);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - offsetMs);
}

function formatMonthDay(date, offsetMinutes = DASHBOARD_TIMEZONE_OFFSET_MINUTES) {
    const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
    return `${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function buildRecentDayBuckets(days = 7) {
    const todayStart = getZonedStartOfDay(new Date());
    const startDate = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    const labels = Array.from({ length: days }, (_, index) => formatMonthDay(new Date(startDate.getTime() + index * DAY_MS)));

    return { startDate, labels };
}

/**
 * 管理员登录
 * POST /api/admin/login
 */
exports.login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username }).select('+password +failedLoginCount +lockedUntil');
    if (!admin) {
        throw new AuthError('用户名或密码错误');
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
        throw new AppError('登录尝试过多，请 15 分钟后再试', 429);
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
        await registerFailedLogin(admin);
    }

    const authenticatedAdmin = await resetFailedLoginAtomic({
        adminModel: Admin,
        adminId: admin._id,
    });
    if (!authenticatedAdmin) {
        throw new AppError('登录尝试过多，请 15 分钟后再试', 429);
    }

    const token = buildAdminToken(authenticatedAdmin);
    setAdminAuthCookie(res, token);

    success(res, {
        ...buildCookieAuthPayload(token),
        user: {
            id: authenticatedAdmin._id,
            username: authenticatedAdmin.username,
            displayName: authenticatedAdmin.displayName,
            isWechatBound: !!authenticatedAdmin.wechatOpenId,
        },
    }, '登录成功');
});

/**
 * 获取当前管理员信息
 * GET /api/admin/me
 */
exports.getMe = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
        throw new NotFoundError('管理员不存在');
    }

    success(res, {
        id: admin._id,
        username: admin.username,
        displayName: admin.displayName,
        isWechatBound: !!admin.wechatOpenId,
    });
});

/**
 * 修改密码
 * POST /api/admin/change-password
 */
exports.changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.user.id).select('+password');
    if (!admin) {
        throw new NotFoundError('管理员不存在');
    }

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
        throw new AuthError('旧密码错误');
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    admin.password = await bcrypt.hash(newPassword, salt);
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();

    clearAuthCookies(res);
    success(res, null, '密码修改成功');
});

exports.logout = asyncHandler(async (req, res) => {
    clearAuthCookies(res);
    success(res, null, '退出成功');
});

/**
 * 微信扫码登录
 * POST /api/admin/auth/wechat/login
 */
exports.wechatLogin = asyncHandler(async (req, res) => {
    const { tempAuthCode } = req.body;
    const { openid } = await consumeTempAuthCode(tempAuthCode, 'admin_login', getRequestContext(req));

    const admin = await Admin.findOne({ wechatOpenId: openid });
    if (!admin) {
        throw new AuthError('该微信未绑定任何管理员账号');
    }

    const token = buildAdminToken(admin);
    setAdminAuthCookie(res, token);

    success(res, {
        ...buildCookieAuthPayload(token),
        user: {
            id: admin._id,
            username: admin.username,
            displayName: admin.displayName,
            isWechatBound: true,
        },
    }, '登录成功');
});

/**
 * 绑定微信
 * POST /api/admin/auth/wechat/bind
 */
exports.wechatBind = asyncHandler(async (req, res) => {
    const { tempAuthCode } = req.body;
    const currentAdminId = req.user.id;
    const { openid } = await consumeTempAuthCode(tempAuthCode, 'admin_bind', getRequestContext(req));

    const existing = await Admin.findOne({ wechatOpenId: openid });
    if (existing && existing._id.toString() !== currentAdminId) {
        throw new AppError('该微信号已被其他账号绑定', 400);
    }

    await Admin.findByIdAndUpdate(currentAdminId, { wechatOpenId: openid });
    success(res, null, '绑定成功');
});

/**
 * 解绑微信
 * POST /api/admin/auth/wechat/unbind
 */
exports.wechatUnbind = asyncHandler(async (req, res) => {
    await Admin.findByIdAndUpdate(req.user.id, { wechatOpenId: null });
    success(res, null, '解绑成功');
});

/**
 * 获取仪表盘统计信息
 * GET /api/admin/stats
 */
exports.getStats = asyncHandler(async (req, res) => {
    const [majorCount, catCount, questionCount, resultCount] = await Promise.all([
        MajorCategory.countDocuments(buildAdminScopeQuery()),
        Category.countDocuments(buildAdminScopeQuery()),
        Question.countDocuments(buildAdminScopeQuery()),
        ExamResult.countDocuments(),
    ]);

    const { startDate, labels } = buildRecentDayBuckets(7);

    const dailyStats = await ExamResult.aggregate([
        {
            $match: {
                createTime: { $gte: startDate },
            },
        },
        {
            $group: {
                _id: { $dateToString: { format: '%m-%d', date: '$createTime', timezone: DASHBOARD_TIMEZONE } },
                count: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ]);
    const dailyCountMap = new Map(dailyStats.map((item) => [item._id, item.count]));

    success(res, {
        counts: {
            majorCategories: majorCount,
            categories: catCount,
            questions: questionCount,
            examResults: resultCount,
        },
        chartData: {
            dates: labels,
            values: labels.map((label) => dailyCountMap.get(label) || 0),
        },
    });
});
