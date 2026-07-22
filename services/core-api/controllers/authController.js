const authService = require('../services/authService');
const axios = require('axios');
const AppConfig = require('../models/AppConfig');
const secretService = require('../services/secretService');
const logger = require('../utils/logger');
const asyncHandler = require('../middleware/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { isWebAdminRequest, setWebAdminCookies } = require('../utils/refreshCookie');
const { getExternalHttpOptions, isExternalHttpTimeout } = require('../utils/externalHttp');

// @desc    WeChat Login
// @route   POST /api/auth/wechat-login
// @access  Public
exports.wechatLogin = asyncHandler(async (req, res) => {
    const { code, userInfo } = req.body;
    const result = await authService.wechatLogin(code, userInfo);

    if (result.newClient) {
        return res.json({
            success: false,
            error: 'User not registered',
            openid: result.openid
        });
    }

    res.json({
        success: true,
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user
    });
});

// @desc    Admin Login
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
    const { username, password, captchaToken } = req.body;

    // 1. 检查人机验证是否开启
    const turnstileConfig = await AppConfig.findOne({ key: 'turnstile_config' });
    if (turnstileConfig && turnstileConfig.value && turnstileConfig.value.enabled) {
        if (!captchaToken) {
            return res.status(400).json({ success: false, error: '请完成人机验证' });
        }

        const secretKey = await secretService.getSecret('TURNSTILE_SECRET_KEY');
        if (!secretKey) {
            logger.warn('Turnstile is enabled but TURNSTILE_SECRET_KEY is not configured.');
            return res.status(503).json({ success: false, error: '验证服务未配置' });
        } else {
            try {
                const verifyResponse = await axios.post(
                    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                    new URLSearchParams({
                        secret: secretKey,
                        response: captchaToken,
                        remoteip: req.ip
                    }),
                    getExternalHttpOptions({ maxRedirects: 0 }),
                );

                if (!verifyResponse.data.success) {
                    return res.status(403).json({ success: false, error: '人机验证失败，请重试' });
                }
            } catch (verifyErr) {
                logger.error('Turnstile verification error:', verifyErr);
                const timedOut = isExternalHttpTimeout(verifyErr);
                return res.status(timedOut ? 504 : 502).json({
                    success: false,
                    code: timedOut ? 'CAPTCHA_UPSTREAM_TIMEOUT' : 'CAPTCHA_UPSTREAM_UNAVAILABLE',
                    error: timedOut ? '验证服务响应超时' : '验证服务暂时不可用',
                });
            }
        }
    }

    let result;
    try {
        result = await authService.adminLogin(username, password);
    } catch (loginErr) {
        // 登录失败审计
        await logAudit(req, {
            action: 'LOGIN_FAILURE',
            targetId: username,
            payload: { reason: loginErr.message },
            result: 'failure',
            actorId: username
        });
        throw loginErr;
    }

    // 登录成功审计
    await logAudit(req, {
        action: 'LOGIN_SUCCESS',
        targetId: result.user._id,
        actorId: result.user._id
    });

    const webAdmin = isWebAdminRequest(req);
    if (webAdmin) {
        const csrfToken = setWebAdminCookies(res, {
            accessToken: result.token,
            refreshToken: result.refreshToken
        });
        res.setHeader('X-CSRF-Token', csrfToken);
    }

    res.json({
        success: true,
        token: webAdmin ? undefined : result.token,
        refreshToken: webAdmin ? undefined : result.refreshToken,
        user: {
            _id: result.user._id,
            userId: result.user.userId,
            nickName: result.user.nickName,
            role: result.user.role,
            permissions: result.user.permissions,
            avatarUrl: result.user.avatarUrl
        }
    });
});
