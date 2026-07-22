const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Counter = require('../models/Counter');
const RefreshToken = require('../models/RefreshToken');
const AppError = require('../utils/AppError');
const { getExternalHttpOptions, isExternalHttpTimeout } = require('../utils/externalHttp');

// Environment variables
const WX_APP_ID = process.env.WX_APP_ID;
const WX_APP_SECRET = process.env.WX_APP_SECRET;
const JWT_SECRET = process.env.CORE_JWT_SECRET || process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined.');
}

// Access Token 有效期: 4 小时
const ACCESS_TOKEN_EXPIRY = '4h';
// Refresh Token 有效期: 7 天
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const normalizeTokenVersion = (value) => {
    const version = Number(value);
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
};

const hashRefreshToken = (token) => crypto
    .createHash('sha256')
    .update(String(token), 'utf8')
    .digest('hex');

/**
 * 生成 Access Token (短有效期)
 */
const generateToken = (user) => {
    return jwt.sign({
        id: user._id,
        role: user.role,
        tokenVersion: normalizeTokenVersion(user.tokenVersion)
    }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: 'miniprogram-admin',
        audience: 'miniprogram-api'
    });
};

/**
 * 生成 Refresh Token 并持久化到数据库
 * @param {string} userId - 用户 ID
 * @returns {Promise<string>} refresh token 字符串
 */
const generateRefreshToken = async (userId, tokenVersion = 0, familyId = crypto.randomUUID()) => {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        token: hashRefreshToken(token),
        userId: String(userId),
        familyId,
        status: 'active',
        tokenVersion: normalizeTokenVersion(tokenVersion),
        expiresAt
    });

    return token;
};

/**
 * 使用 Refresh Token 刷新 Access Token
 * @param {string} refreshToken - refresh token 字符串
 * @returns {Promise<Object>} { accessToken, user }
 */
const refreshAccessToken = async (refreshToken) => {
    if (!refreshToken) {
        throw new AppError('Refresh token is required', 400);
    }

    const rawToken = String(refreshToken);
    if (rawToken.length > 1024) {
        throw new AppError('Invalid or expired refresh token', 401);
    }

    const tokenCandidates = [hashRefreshToken(rawToken), rawToken];
    // Marking the token used preserves a short-lived tombstone. If the same token
    // appears again, the whole family is treated as compromised.
    const tokenDoc = await RefreshToken.findOneAndUpdate({
        token: { $in: tokenCandidates },
        expiresAt: { $gt: new Date() },
        $or: [
            { status: 'active' },
            { status: { $exists: false } }
        ]
    }, {
        $set: { status: 'used', usedAt: new Date() }
    }, { new: false });
    if (!tokenDoc) {
        const reused = await RefreshToken.findOne({
            token: { $in: tokenCandidates },
            status: 'used',
            expiresAt: { $gt: new Date() }
        });
        if (reused) {
            await User.updateOne(
                { _id: reused.userId },
                { $inc: { tokenVersion: 1 } }
            );
            await revokeAllRefreshTokens(reused.userId);
            const error = new AppError('Refresh token reuse detected', 401);
            error.code = 'AUTH_REFRESH_TOKEN_REUSED';
            throw error;
        }
        throw new AppError('Invalid or expired refresh token', 401);
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
        throw new AppError('User not found', 401);
    }

    if (user.status && user.status !== 'active') {
        await revokeAllRefreshTokens(user._id);
        throw new AppError('账号已被禁用', 403);
    }

    if (normalizeTokenVersion(tokenDoc.tokenVersion) !== normalizeTokenVersion(user.tokenVersion)) {
        await revokeAllRefreshTokens(user._id);
        const error = new AppError('Refresh token has been revoked', 401);
        error.code = 'AUTH_REFRESH_TOKEN_REVOKED';
        throw error;
    }

    const accessToken = generateToken(user);
    const newRefreshToken = await generateRefreshToken(
        user._id,
        user.tokenVersion,
        tokenDoc.familyId || crypto.randomUUID()
    );

    return { accessToken, refreshToken: newRefreshToken, user };
};

/**
 * 吊销用户的所有 Refresh Token（用于登出或安全事件）
 */
const revokeAllRefreshTokens = async (userId) => {
    await RefreshToken.deleteMany({ userId: String(userId) });
};

const revokeRefreshToken = async (refreshToken, userId) => {
    if (!refreshToken) return;
    const rawToken = String(refreshToken);
    if (rawToken.length > 1024) return;

    await RefreshToken.deleteOne({
        token: { $in: [hashRefreshToken(rawToken), rawToken] },
        userId: String(userId)
    });
};

exports.wechatLogin = async (code, userInfo) => {
    if (!code) {
        throw new AppError('微信登录 Code 缺失', 400);
    }

    if (!WX_APP_ID || !WX_APP_SECRET) {
        throw new AppError('服务器配置错误：缺少微信凭据', 500);
    }

    // 1. Get OpenID from WeChat
    let response;
    try {
        response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
            ...getExternalHttpOptions({ maxRedirects: 0 }),
            params: {
                appid: WX_APP_ID,
                secret: WX_APP_SECRET,
                js_code: code,
                grant_type: 'authorization_code',
            },
        });
    } catch (error) {
        const timedOut = isExternalHttpTimeout(error);
        const upstreamError = new AppError(
            timedOut ? '微信登录服务响应超时' : '微信登录服务暂时不可用',
            timedOut ? 504 : 502,
        );
        upstreamError.code = timedOut ? 'WECHAT_UPSTREAM_TIMEOUT' : 'WECHAT_UPSTREAM_UNAVAILABLE';
        throw upstreamError;
    }
    const { openid, session_key, errcode, errmsg } = response.data;

    if (errcode) {
        throw new AppError(`WeChat API Error: ${errmsg}`, 400);
    }

    if (!openid) {
        throw new AppError('获取 OpenID 失败', 400);
    }

    // 2. Find or Create User
    let user = await User.findOne({ openid });

    if (!user) {
        // If no userInfo provided (silent login), do not create user
        if (!userInfo) {
            return {
                newClient: true,
                openid
            };
        }

        // Get next UID
        let counter = await Counter.findByIdAndUpdate(
            'userId',
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // Self-healing: if counter is accidentally low, reset to 10001
        if (counter.seq < 10000) {
            counter = await Counter.findByIdAndUpdate(
                'userId',
                { $set: { seq: 10001 } },
                { new: true }
            );
        }

        // Create new user only if userInfo is provided
        user = await User.create({
            _id: openid, // Use openid as _id
            openid,
            userId: String(counter.seq), // Use digital UID
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            role: 'user',
            status: 'active'
        });
    } else {
        // Update existing user if userInfo provided
        if (userInfo) {
            user.nickName = userInfo.nickName || user.nickName;
            user.avatarUrl = userInfo.avatarUrl || user.avatarUrl;
            user.updatedAt = Date.now();
            await user.save();
        }
    }

    if (user.status && user.status !== 'active') {
        throw new AppError('账号已被禁用', 403);
    }

    // 3. Generate Tokens
    const token = generateToken(user);
    const refreshToken = await generateRefreshToken(user._id, user.tokenVersion);

    return { token, refreshToken, user };
};

// 账号锁定配置
const MAX_LOGIN_ATTEMPTS = 5;  // 最大连续失败次数
const LOCK_DURATION_MS = 15 * 60 * 1000; // 锁定 15 分钟

function buildFailedLoginUpdate(now) {
    const previousLockUntil = { $ifNull: ['$lockUntil', 0] };
    const previousAttempts = { $ifNull: ['$failedLoginAttempts', 0] };
    const lockExpired = {
        $and: [
            { $gt: [previousLockUntil, 0] },
            { $lte: [previousLockUntil, now] }
        ]
    };
    const attemptsBeforeIncrement = {
        $cond: [lockExpired, 0, previousAttempts]
    };
    const nextAttempts = { $add: [attemptsBeforeIncrement, 1] };

    return [{
        $set: {
            failedLoginAttempts: nextAttempts,
            lockUntil: {
                $cond: [
                    { $gte: [nextAttempts, MAX_LOGIN_ATTEMPTS] },
                    now + LOCK_DURATION_MS,
                    { $cond: [lockExpired, 0, previousLockUntil] }
                ]
            }
        }
    }];
}

function unlockedUserFilter(userId, now) {
    return {
        _id: userId,
        $expr: {
            $lte: [{ $ifNull: ['$lockUntil', 0] }, now]
        }
    };
}

exports.adminLogin = async (username, password) => {
    if (!username || !password) {
        throw new AppError('请输入用户名和密码', 400);
    }

    // 查询时需带上 password、failedLoginAttempts、lockUntil 字段
    const user = await User.findOne({ userId: username })
        .select('+password +failedLoginAttempts +lockUntil');

    if (!user) {
        throw new AppError('用户名或密码错误', 401);
    }

    // 检查账号是否被锁定
    if (user.lockUntil && user.lockUntil > Date.now()) {
        const remainMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
        throw new AppError(`账号已被锁定，请 ${remainMinutes} 分钟后再试`, 423);
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
        const now = Date.now();
        const updatedUser = await User.findOneAndUpdate(
            unlockedUserFilter(user._id, now),
            buildFailedLoginUpdate(now),
            { new: true }
        ).select('+failedLoginAttempts +lockUntil');

        // Another concurrent failure may have crossed the threshold first.
        if (!updatedUser || (updatedUser.lockUntil && updatedUser.lockUntil > now)) {
            throw new AppError(`密码连续错误 ${MAX_LOGIN_ATTEMPTS} 次，账号已被锁定 15 分钟`, 423);
        }

        const remaining = Math.max(MAX_LOGIN_ATTEMPTS - (updatedUser.failedLoginAttempts || 0), 0);
        throw new AppError(`用户名或密码错误，还可尝试 ${remaining} 次`, 401);
    }

    if (user.status && user.status !== 'active') {
        throw new AppError('账号已被禁用', 403);
    }

    // The reset is conditional so a concurrent failed attempt that just locked
    // the account cannot be overwritten by this successful password check.
    const now = Date.now();
    const loggedInUser = await User.findOneAndUpdate(
        unlockedUserFilter(user._id, now),
        {
            $set: {
                failedLoginAttempts: 0,
                lockUntil: 0,
                lastLoginAt: now
            }
        },
        { new: true }
    );
    if (!loggedInUser) {
        throw new AppError('账号已被锁定，请稍后再试', 423);
    }

    // Generate Tokens
    const token = generateToken(loggedInUser);
    const refreshToken = await generateRefreshToken(loggedInUser._id, loggedInUser.tokenVersion);

    return { token, refreshToken, user: loggedInUser };
};

// 导出供 authScanController 等使用
exports.generateToken = generateToken;
exports.generateRefreshToken = generateRefreshToken;
exports.refreshAccessToken = refreshAccessToken;
exports.revokeAllRefreshTokens = revokeAllRefreshTokens;
exports.revokeRefreshToken = revokeRefreshToken;
exports.hashRefreshToken = hashRefreshToken;
exports.buildFailedLoginUpdate = buildFailedLoginUpdate;
