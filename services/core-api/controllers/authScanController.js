const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const AppClient = require('../models/AppClient');
const AuthScanLog = require('../models/AuthScanLog');
const logger = require('../utils/logger');
const authService = require('../services/authService');
const { getAccessToken, invalidateCache: invalidateWxTokenCache } = require('../utils/wxToken');

// In-memory storage for QR codes
// Key: qrToken, Value: { status: 'waiting'|'scanned'|'confirmed'|'expired', appId: string, createdTime: number, userId: string, tempAuthCode: string }
const qrCodeStore = new Map();

// Configuration
const QR_EXPIRE_TIME = 300 * 1000; // 5 minutes
const CHECK_INTERVAL = 60 * 1000; // Cleanup interval
const VALID_WX_ENV_VERSIONS = new Set(['release', 'trial', 'develop']);
const MAX_QR_STORE_SIZE = 1000; // 内存存储上限，防止 DoS

// Resolve which Mini Program version WeChat should open for generated wxacodes.
function resolveWxEnvVersion() {
    const configuredEnv = (process.env.WX_ENV_VERSION || '').trim();

    if (configuredEnv) {
        if (VALID_WX_ENV_VERSIONS.has(configuredEnv)) {
            return configuredEnv;
        }

        logger.warn(`Invalid WX_ENV_VERSION "${configuredEnv}", falling back to release`);
    }

    return 'release';
}

// 清理过期 QR 码的帮助函数
function cleanupExpiredQRCodes() {
    const now = Date.now();
    for (const [key, value] of qrCodeStore.entries()) {
        if (now - value.createdTime > QR_EXPIRE_TIME) {
            if (value.logId) {
                AuthScanLog.findByIdAndUpdate(value.logId, {
                    actionStatus: 'EXPIRED',
                    updateTime: Date.now()
                }).catch(err => logger.error('Error updating expired log:', err));
            }
            qrCodeStore.delete(key);
        }
    }
}

// Periodic cleanup of expired QR codes
setInterval(cleanupExpiredQRCodes, CHECK_INTERVAL);

/**
 * 1. Create QR Code (Client Side calls this)
 */
exports.createQRCode = async (req, res) => {
    try {
        const { appId, oldToken } = req.body;
        if (!appId) {
            return res.status(400).json({ message: 'Missing appId' });
        }

        // Invalidate old token if provided (e.g., on page refresh)
        if (oldToken && qrCodeStore.has(oldToken)) {
            qrCodeStore.delete(oldToken);
            logger.debug(`Invalidated old QR token: ${oldToken.substring(0, 8)}...`);
        }

        // 容量保护：超出上限时先清理过期，若仍超出则拒绝
        if (qrCodeStore.size >= MAX_QR_STORE_SIZE) {
            cleanupExpiredQRCodes();
            if (qrCodeStore.size >= MAX_QR_STORE_SIZE) {
                return res.status(503).json({ message: '系统繁忙，请稍后重试' });
            }
        }

        const qrToken = crypto.randomBytes(16).toString('hex');

        // Check App Status
        if (appId && appId !== 'admin-dashboard' && appId !== 'admin-action-auth') {
            try {
                const app = await AppClient.findOne({ appId: appId });
                if (app && app.status === 'disabled') {
                    logger.warn(`Blocked QR creation for disabled app: ${appId}`);
                    return res.status(403).json({ message: '此应用已被禁用' });
                }
            } catch (dbErr) {
                logger.error('AppClient Check Failed:', dbErr);
                throw dbErr;
            }
        }

        qrCodeStore.set(qrToken, {
            status: 'waiting',
            appId,
            createdTime: Date.now(),
            userId: null
        });

        // In a real scenario, you might return a full URL to a QR gen service
        // For now, we return the token which the frontend can turn into a QR code
        res.json({
            qrToken,
            qrCodeUrl: `miniprogram://auth/scan?t=${qrToken}`, // Fictional URL scheme for context
            expireIn: 300
        });
    } catch (error) {
        logger.error('Create QR Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 1.1 Create Wxacode (小程序码) for WeChat scan login
 * Generates a mini program QR code using wxacode.getUnlimited API.
 * When scanned by WeChat, it opens the mini program directly to the scan-confirm page.
 */
exports.createWxacode = async (req, res) => {
    try {
        const { appId, oldToken } = req.body;
        if (!appId) {
            return res.status(400).json({ message: 'Missing appId' });
        }

        // Invalidate old token if provided
        if (oldToken && qrCodeStore.has(oldToken)) {
            qrCodeStore.delete(oldToken);
            logger.debug(`Invalidated old QR token: ${oldToken.substring(0, 8)}...`);
        }

        // 容量保护
        if (qrCodeStore.size >= MAX_QR_STORE_SIZE) {
            cleanupExpiredQRCodes();
            if (qrCodeStore.size >= MAX_QR_STORE_SIZE) {
                return res.status(503).json({ message: '系统繁忙，请稍后重试' });
            }
        }

        // 使用 16 字节 = 32 字符 hex，适配微信 scene 参数上限
        const qrToken = crypto.randomBytes(16).toString('hex');

        // Check App Status
        if (appId && appId !== 'admin-dashboard' && appId !== 'admin-action-auth') {
            try {
                const app = await AppClient.findOne({ appId });
                if (app && app.status === 'disabled') {
                    logger.warn(`Blocked QR creation for disabled app: ${appId}`);
                    return res.status(403).json({ message: '此应用已被禁用' });
                }
            } catch (dbErr) {
                logger.error('AppClient Check Failed:', dbErr);
                throw dbErr;
            }
        }

        qrCodeStore.set(qrToken, {
            status: 'waiting',
            appId,
            createdTime: Date.now(),
            userId: null
        });

        // 尝试生成微信小程序码
        try {
            const accessToken = await getAccessToken();
            const envVersion = resolveWxEnvVersion();
            const checkPath = envVersion === 'release';
            logger.info(`Generating admin scan login wxacode with env_version=${envVersion}`);

            const wxRes = await axios.post(
                `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
                {
                    scene: qrToken,
                    page: 'pages/auth/scan-confirm/scan-confirm',
                    check_path: checkPath,
                    env_version: envVersion,
                    width: 280
                },
                {
                    responseType: 'arraybuffer',
                    timeout: 15000
                }
            );

            // 检查响应是否为错误 JSON（而非图片二进制）
            const contentType = wxRes.headers['content-type'];
            if (contentType && contentType.includes('application/json')) {
                const errData = JSON.parse(Buffer.from(wxRes.data).toString());
                logger.error('微信小程序码生成失败:', errData);

                // access_token 过期时清除缓存，下次自动刷新
                if (errData.errcode === 40001 || errData.errcode === 42001) {
                    invalidateWxTokenCache();
                }

                // 降级：返回普通二维码数据
                return res.json({
                    qrToken,
                    qrCodeUrl: `miniprogram://auth/scan?t=${qrToken}`,
                    expireIn: 300,
                    wxEnvVersion: envVersion,
                    wxacodeError: errData.errmsg || '小程序码生成失败'
                });
            }

            // 成功：返回 base64 图片
            const base64 = Buffer.from(wxRes.data).toString('base64');
            res.json({
                qrToken,
                wxacodeBase64: `data:image/png;base64,${base64}`,
                expireIn: 300,
                wxEnvVersion: envVersion
            });
        } catch (wxErr) {
            logger.error('微信小程序码 API 调用失败:', wxErr.message);
            // 降级：返回普通二维码数据
            res.json({
                qrToken,
                qrCodeUrl: `miniprogram://auth/scan?t=${qrToken}`,
                expireIn: 300,
                wxacodeError: '小程序码生成失败，请使用小程序内扫码'
            });
        }
    } catch (error) {
        logger.error('Create Wxacode Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 2. Check QR Code Status (Client Side polls this)
 */
exports.checkStatus = async (req, res) => {
    try {
        const { qrToken } = req.query;
        if (!qrToken) return res.status(400).json({ message: 'Missing qrToken' });

        const qrData = qrCodeStore.get(qrToken);

        if (!qrData) {
            return res.json({ status: 'expired' });
        }

        if (Date.now() - qrData.createdTime > QR_EXPIRE_TIME) {
            qrCodeStore.delete(qrToken);
            return res.json({ status: 'expired' });
        }

        if (qrData.status === 'confirmed') {
            return res.json({
                status: 'confirmed',
                tempAuthCode: qrData.tempAuthCode
            });
        }

        res.json({ status: qrData.status });
    } catch (error) {
        logger.error('Check Status Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 3. Scan QR Code (Miniprogram calls this)
 */
exports.scanQRCode = async (req, res) => {
    try {
        const { qrToken } = req.body;
        // Verify User is logged in (Assuming verifyToken middleware attached user to req.user)
        const userId = req.user.id || req.user._id || req.user.openid;

        if (!userId) {
            return res.status(401).json({ success: false, message: '用户鉴权信息异常' });
        }

        if (!qrCodeStore.has(qrToken)) {
            return res.json({ success: false, message: '二维码已过期或无效' });
        }

        const qrData = qrCodeStore.get(qrToken);
        if (qrData.status !== 'waiting') {
            return res.json({ success: false, message: '二维码已被扫描或确认' });
        }

        // Fetch App Name
        let appName = '未知应用';
        if (qrData.appId === 'admin-dashboard') {
            appName = '星轨轻具坊后台';
        } else if (qrData.appId === 'admin-action-auth') {
            appName = '系统安全操作授权';
        } else if (qrData.appId) {
            try {
                const app = await AppClient.findOne({ appId: qrData.appId });
                if (app && app.appName) {
                    appName = app.appName;
                } else {
                    appName = qrData.appId; // Fallback to ID if name not found
                }
            } catch (err) {
                logger.error('Fetch App Error:', err);
                appName = qrData.appId;
            }
        }

        // Create an audit log for the scan action
        const newLog = new AuthScanLog({
            appId: qrData.appId,
            appName: appName,
            userId: userId,
            actionStatus: 'SCANNED',
            ip: req.ip || (req.connection && req.connection.remoteAddress) || 'unknown',
            device: req.headers['user-agent'] || 'MiniProgram'
        });
        const savedLog = await newLog.save();

        // Update status and save log ID
        qrData.status = 'scanned';
        qrData.userId = userId;
        qrData.logId = savedLog._id;
        qrCodeStore.set(qrToken, qrData);

        // Return app info to MP so it knows what it's logging into
        res.json({
            success: true,
            appName: appName
        });
    } catch (error) {
        logger.error('Scan Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 4. Confirm Login (Miniprogram calls this)
 */
exports.confirmLogin = async (req, res) => {
    try {
        const { qrToken } = req.body;
        const userId = req.user.id || req.user._id || req.user.openid;

        if (!qrCodeStore.has(qrToken)) {
            return res.json({ success: false, message: '二维码已失效，请重新扫码' });
        }

        const qrData = qrCodeStore.get(qrToken);
        if (qrData.userId !== userId) {
            return res.json({ success: false, message: '操作权限错误' });
        }

        // Generate a temporary auth code
        const tempAuthCode = crypto.randomBytes(16).toString('hex');

        qrData.status = 'confirmed';
        qrData.tempAuthCode = tempAuthCode;
        qrCodeStore.set(qrToken, qrData);

        // Update Audit Log
        if (qrData.logId) {
            await AuthScanLog.findByIdAndUpdate(qrData.logId, {
                actionStatus: 'CONFIRMED',
                updateTime: Date.now()
            });
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Confirm Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 4.1 Reject Login (Miniprogram calls this when cancelling)
 */
exports.rejectLogin = async (req, res) => {
    try {
        const { qrToken } = req.body;
        const userId = req.user.id || req.user._id || req.user.openid;

        if (!qrCodeStore.has(qrToken)) {
            // Might have already expired, that's fine
            return res.json({ success: true });
        }

        const qrData = qrCodeStore.get(qrToken);
        if (qrData.userId && qrData.userId !== userId) {
            return res.json({ success: false, message: '操作权限错误' });
        }

        qrData.status = 'rejected';
        qrCodeStore.set(qrToken, qrData);

        // Update Audit Log
        if (qrData.logId) {
            await AuthScanLog.findByIdAndUpdate(qrData.logId, {
                actionStatus: 'REJECTED',
                updateTime: Date.now()
            });
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Reject Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 5. Exchange Token (Client calls this with tempAuthCode)
 */
// ... (existing code)

exports.exchangeToken = async (req, res) => {
    try {
        const { tempAuthCode, appId, secret } = req.body;

        if (!tempAuthCode) return res.status(400).json({ message: 'Missing tempAuthCode' });
        // Optional: We can enforce appId/secret presence here or later. 
        // For best security, we SHOULD require them.
        if (!appId || !secret) {
            return res.status(401).json({ message: 'Missing appId or secret' });
        }

        let foundToken = null;
        let foundData = null;

        for (const [key, value] of qrCodeStore.entries()) {
            if (value.tempAuthCode === tempAuthCode) {
                foundToken = key;
                foundData = value;
                break;
            }
        }

        if (!foundData) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        // Verify AppID matches the one in QR code
        if (foundData.appId && foundData.appId !== appId) {
            return res.status(400).json({ message: 'AppID mismatch' });
        }

        // Verify App Secret (使用时序安全比对防止时序攻击)
        const appClient = await AppClient.findOne({ appId }).select('+secret');
        if (!appClient || !appClient.secret || !secret) {
            return res.status(401).json({ message: 'Invalid App Secret' });
        }
        const secretBuffer = Buffer.from(String(appClient.secret));
        const inputBuffer = Buffer.from(String(secret));
        if (secretBuffer.length !== inputBuffer.length || !crypto.timingSafeEqual(secretBuffer, inputBuffer)) {
            return res.status(401).json({ message: 'Invalid App Secret' });
        }

        // Fetch user from DB to get role and details
        const user = await User.findById(foundData.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate real JWT + Refresh Token
        const token = authService.generateToken(user);
        const refreshToken = await authService.generateRefreshToken(user._id);

        // Cleanup used QR
        qrCodeStore.delete(foundToken);

        res.json({
            accessToken: token,
            refreshToken: refreshToken,
            user: user
        });
    } catch (error) {
        logger.error('Token Exchange Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 5.1 Admin Token Exchange (Proxy)
 * Allows admin frontend to exchange token without exposing secret
 */
exports.exchangeTokenAdmin = async (req, res) => {
    try {
        const { tempAuthCode } = req.body;
        const adminAppId = 'admin-dashboard';

        if (!tempAuthCode) return res.status(400).json({ message: 'Missing tempAuthCode' });

        let foundToken = null;
        let foundData = null;

        for (const [key, value] of qrCodeStore.entries()) {
            if (value.tempAuthCode === tempAuthCode) {
                foundToken = key;
                foundData = value;
                break;
            }
        }

        if (!foundData) {
            return res.status(400).json({ message: 'Invalid or expired code' });
        }

        // Verify AppID matches Admin Dashboard
        if (foundData.appId && foundData.appId !== adminAppId) {
            return res.status(400).json({ message: 'Not an admin login QR code' });
        }

        // Fetch user from DB to get role and details
        const user = await User.findById(foundData.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate real JWT + Refresh Token
        const token = authService.generateToken(user);
        const refreshToken = await authService.generateRefreshToken(user._id);

        // Cleanup used QR
        qrCodeStore.delete(foundToken);

        res.json({
            accessToken: token,
            refreshToken: refreshToken,
            user: user
        });

    } catch (error) {
        logger.error('Admin Exchange Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 6. List Active QR Codes (Admin only)
 */
exports.listQRCodes = async (req, res) => {
    try {
        const list = [];
        for (const [qrToken, data] of qrCodeStore.entries()) {
            list.push({
                qrToken: qrToken.substring(0, 8) + '...', // Mask token for security
                status: data.status,
                appId: data.appId,
                createdTime: data.createdTime,
                userId: data.userId,
                // Do not return tempAuthCode
            });
        }
        // Sort by createdTime desc
        list.sort((a, b) => b.createdTime - a.createdTime);
        res.json({ success: true, list });
    } catch (error) {
        logger.error('List QR Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * 7. Get Audit Logs for a specific App or all (Admin only)
 */
exports.getAuditLogs = async (req, res) => {
    try {
        const { appId, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (appId) filter.appId = appId;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const logs = await AuthScanLog.find(filter)
            .sort({ createTime: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'username avatarUrl') // Pull basic user info if needed
            .lean();

        const total = await AuthScanLog.countDocuments(filter);

        res.json({
            success: true,
            data: logs,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        logger.error('Get Audit Logs Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
