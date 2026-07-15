const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authorizeAccess = require('../middleware/authorizeAccess');
const verifyWebhookSignature = require('../middleware/webhookVerify');
const ct8Controller = require('../controllers/ct8Controller');
const { handleCallback } = require('../controllers/githubController');

const callbackHandlers = [verifyWebhookSignature(true), handleCallback];

const ct8ViewAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['ct8', 'view_ct8', 'manage_ct8'],
});

// Public callback aliases used by the GitHub Actions CT8 runner.
router.post('/callback', ...callbackHandlers);
router.post('/result', ...callbackHandlers);
router.post('/results', ...callbackHandlers);

router.use(authMiddleware.verifyToken);
router.use(ct8ViewAccess);

router.get('/stats', ct8Controller.getCt8Stats);
router.get('/runs', ct8Controller.getRunHistory);
router.get('/runs/:runId', ct8Controller.getRunDetails);

module.exports = router;
