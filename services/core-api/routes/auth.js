const express = require('express');
const router = express.Router();
const { wechatLogin, login } = require('../controllers/authController');
const authService = require('../services/authService');
const asyncHandler = require('../middleware/asyncHandler');

const validate = require('../middleware/validate');
const { loginSchema, wechatLoginSchema } = require('../schemas/authSchemas');

const { authLimiter } = require('../middleware/rateLimit');

router.post('/wechat-login', authLimiter, validate(wechatLoginSchema), wechatLogin);
router.post('/login', authLimiter, validate(loginSchema), login);

// Refresh Token 刷新 Access Token
router.post('/refresh', authLimiter, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken);

    res.json({
        success: true,
        token: result.accessToken,
        refreshToken: result.refreshToken,
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
    const { refreshToken } = req.body;
    if (refreshToken) {
        // 吊销指定的 refresh token
        const RefreshToken = require('../models/RefreshToken');
        await RefreshToken.deleteOne({ token: refreshToken, userId: String(req.user._id) });
    } else {
        // 未提供 token 时，吊销该用户的全部 refresh token（更安全）
        await authService.revokeAllRefreshTokens(req.user._id);
    }
    res.json({ success: true, message: '已成功退出登录' });
}));

module.exports = router;
