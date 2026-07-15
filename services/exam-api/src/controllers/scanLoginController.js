const jwt = require('jsonwebtoken');
const config = require('../config');
const Admin = require('../models/Admin');
const ConsoleAccount = require('../models/ConsoleAccount');
const User = require('../models/User');
const { success } = require('../utils/response');
const { asyncHandler } = require('../utils/exam');
const { AuthError, ForbiddenError } = require('../utils/errors');
const scanLogin = require('../utils/scanLogin');
const { setAdminAuthCookie, setConsoleAuthCookie } = require('../utils/authCookies');
const { buildCookieAuthPayload, omitAuthToken } = require('../utils/authResponse');
const { recordAuditLog } = require('../middleware/auditLog');

function getRequestContext(req) {
    return {
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    };
}

function recordScanLoginAudit(req, action, data = {}) {
    void recordAuditLog(req, {
        routePath: `scan-login:${action}`,
        params: {
            action,
            intent: data.intent || '',
            status: data.status || '',
            authType: data.authType || '',
        },
        bodyKeys: Object.keys(req.body || {}).filter((key) => !/token|code/i.test(key)),
    });
}

function buildAdminLoginResult(admin) {
    const token = jwt.sign(
        {
            id: admin._id,
            username: admin.username,
            role: 'admin',
            tokenVersion: admin.tokenVersion || 0,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn },
    );

    return {
        authType: 'admin',
        ...buildCookieAuthPayload(token),
        token,
        user: {
            id: admin._id,
            username: admin.username,
            displayName: admin.displayName,
            isWechatBound: true,
        },
    };
}

function buildConsoleToken(account) {
    return jwt.sign(
        {
            openid: account.openid,
            role: 'console',
            consoleRole: account.role,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn },
    );
}

async function buildConsoleLoginResult(openid) {
    const user = await User.findOne({ openid });
    if (!user) {
        throw new AuthError('请先在小程序完成登录后再扫码进入后台');
    }

    const now = new Date();
    let account = await ConsoleAccount.findOne({ openid });

    if (!account) {
        account = await ConsoleAccount.create({
            openid,
            role: 'creator',
            displayName: user.nickname || '我的题库',
            firstLoginAt: now,
            lastLoginAt: now,
            activatedByScan: true,
        });
    } else {
        if (account.status === 'disabled') {
            throw new ForbiddenError('该题库后台账号已被禁用');
        }

        if (!account.firstLoginAt) {
            account.firstLoginAt = now;
        }

        if (!account.displayName && user.nickname) {
            account.displayName = user.nickname;
        }

        account.lastLoginAt = now;
        await account.save();
    }

    const token = buildConsoleToken(account);
    return {
        authType: 'console',
        ...buildCookieAuthPayload(token),
        token,
        user: {
            openid,
            role: account.role,
            displayName: account.displayName || user.nickname || '我的题库',
            firstLoginAt: account.firstLoginAt,
            lastLoginAt: account.lastLoginAt,
            nickname: user.nickname || '',
        },
    };
}

async function buildUnifiedLoginResult(openid, intent) {
    if (intent !== 'console_login') {
        const admin = await Admin.findOne({ wechatOpenId: openid });
        if (admin) {
            return buildAdminLoginResult(admin);
        }

        if (intent === 'admin_login') {
            throw new AuthError('该微信未绑定任何管理员账号');
        }
    }

    return buildConsoleLoginResult(openid);
}

function isExpectedQrStateError(error) {
    return error
        && [400, 404, 409].includes(error.statusCode)
        && /(二维码|扫码确认)/.test(error.message || '');
}

function buildUnavailableQrSession(qrToken, error) {
    const message = error.message || '二维码不可用，请重新扫码';
    let status = 'cancelled';
    let title = '二维码不可用';

    if (message.includes('已使用')) {
        status = 'consumed';
        title = '二维码已使用';
    } else if (message.includes('过期')) {
        status = 'expired';
        title = '二维码已过期';
    } else if (message.includes('其他微信')) {
        status = 'scanned';
        title = '请更换二维码';
    } else if (message.includes('失效') || message.includes('不存在') || message.includes('无效')) {
        status = 'cancelled';
        title = '二维码已失效';
    }

    return {
        qrToken,
        status,
        intent: 'manage_login',
        title,
        description: message,
        confirmText: '重新扫码',
        unavailable: true,
    };
}

exports.createQrCode = asyncHandler(async (req, res) => {
    const { intent, oldQrToken } = req.body;
    const data = await scanLogin.createQrSession(intent, oldQrToken, getRequestContext(req));
    recordScanLoginAudit(req, 'qrcode_create', data);
    success(res, data);
});

exports.getQrCodeStatus = asyncHandler(async (req, res) => {
    const { qrToken, pollToken } = req.query;
    const data = await scanLogin.getStatusByPollToken(qrToken, pollToken);
    success(res, data);
});

exports.wechatLogin = asyncHandler(async (req, res) => {
    const { tempAuthCode } = req.body;
    const { openid, intent } = await scanLogin.consumeTempAuthCode(
        tempAuthCode,
        ['manage_login', 'admin_login', 'console_login'],
        getRequestContext(req),
    );
    req.user = { role: 'user', openid };
    const data = await buildUnifiedLoginResult(openid, intent);
    if (data.authType === 'admin') {
        setAdminAuthCookie(res, data.token);
    } else if (data.authType === 'console') {
        setConsoleAuthCookie(res, data.token);
    }
    recordScanLoginAudit(req, 'auth_login', { ...data, intent, status: 'consumed' });
    success(res, omitAuthToken(data), '登录成功');
});

exports.scanQrCode = asyncHandler(async (req, res) => {
    const user = await User.findOne({ openid: req.user.openid }).lean();
    if (!user) {
        throw new AuthError('请先重新登录小程序后再扫码');
    }

    try {
        const data = await scanLogin.scanByUser(req.body.qrToken, req.user.openid, getRequestContext(req));
        recordScanLoginAudit(req, 'qrcode_scan', data);
        success(res, data);
    } catch (error) {
        if (isExpectedQrStateError(error)) {
            success(res, buildUnavailableQrSession(req.body.qrToken, error));
            return;
        }
        throw error;
    }
});

exports.confirmQrCode = asyncHandler(async (req, res) => {
    const user = await User.findOne({ openid: req.user.openid }).lean();
    if (!user) {
        throw new AuthError('请先重新登录小程序后再确认');
    }

    try {
        const data = await scanLogin.confirmByUser(req.body.qrToken, req.user.openid, getRequestContext(req));
        recordScanLoginAudit(req, 'qrcode_confirm', data);
        success(res, data, '已确认，请返回电脑端继续');
    } catch (error) {
        if (isExpectedQrStateError(error)) {
            success(res, buildUnavailableQrSession(req.body.qrToken, error));
            return;
        }
        throw error;
    }
});
