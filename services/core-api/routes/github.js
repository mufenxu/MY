const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const verifyWebhookSignature = require('../middleware/webhookVerify');
const authorizeAccess = require('../middleware/authorizeAccess');
const {
    triggerAction,
    handleCallback,
    getStatus,
    updateSecret,
    manageSecretCache
} = require('../controllers/githubController');

const callbackHandlers = [verifyWebhookSignature(true), handleCallback];

const ct8ViewAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['ct8', 'view_ct8', 'manage_ct8'],
});

const ct8ManageAccess = authorizeAccess({
    roles: ['super_admin'],
    permissions: ['manage_ct8'],
});

// 触发 GitHub Action (需要认证)
router.post('/trigger', auth.verifyToken, ct8ManageAccess, triggerAction);

// 接收 GitHub Action 回调
// 兼容 GitHub Actions 自定义回调：无签名时必须携带 shared secret
router.post('/callback', ...callbackHandlers);
router.post('/webhook', ...callbackHandlers);
router.post('/result', ...callbackHandlers);
router.post('/results', ...callbackHandlers);

// 获取状态 (需要认证)
router.get('/status', auth.verifyToken, ct8ViewAccess, getStatus);

// Update GitHub Secret (需要认证)
router.post('/secret/update', auth.verifyToken, ct8ManageAccess, updateSecret);

// Secret Cache Management (需要认证)
router.post('/secret/cache', auth.verifyToken, ct8ManageAccess, manageSecretCache);

module.exports = router;
