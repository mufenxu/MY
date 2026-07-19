const express = require('express');
const router = express.Router();
const { wechatLogin, login } = require('../controllers/authController');
const authService = require('../services/authService');
const asyncHandler = require('../middleware/asyncHandler');

const validate = require('../middleware/validate');
const { loginSchema, wechatLoginSchema } = require('../schemas/authSchemas');

const { authLimiter } = require('../middleware/rateLimit');
const {
    clearWebAdminCookies,
    isWebAdminRequest,
    readRefreshCookie,
    requireWebCsrf,
    setWebAdminCookies
} = require('../utils/refreshCookie');

router.post('/wechat-login', authLimiter, validate(wechatLoginSchema), wechatLogin);
router.post('/login', authLimiter, validate(loginSchema), login);

// Refresh Token 刷新 Access Token
router.post('/refresh', authLimiter, requireWebCsrf, asyncHandler(async (req, res) => {
    const webAdmin = isWebAdminRequest(req);
    const refreshToken = webAdmin ? readRefreshCookie(req) : req.body.refreshToken;
    const result = await authService.refreshAccessToken(refreshToken);
    if (webAdmin) {
        const csrfToken = setWebAdminCookies(res, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken
        });
        res.setHeader('X-CSRF-Token', csrfToken);
    }

    res.json({
        success: true,
        token: webAdmin ? undefined : result.accessToken,
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
}));

// 退出登录 - 吊销 Refresh Token
const auth = require('../middleware/auth');
router.post('/logout', auth, asyncHandler(async (req, res) => {
    const webAdmin = isWebAdminRequest(req);
    const refreshToken = webAdmin ? readRefreshCookie(req) : req.body.refreshToken;
    if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken, req.user._id);
    } else {
        // 未提供 token 时，吊销该用户的全部 refresh token（更安全）
        await authService.revokeAllRefreshTokens(req.user._id);
    }
    if (webAdmin) clearWebAdminCookies(res);
    res.json({ success: true, message: '已成功退出登录' });
}));

module.exports = router;
