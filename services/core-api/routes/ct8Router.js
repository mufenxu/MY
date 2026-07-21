const express = require('express');
const auth = require('../middleware/auth');
const authorizeAccess = require('../middleware/authorizeAccess');
const verifyWebhookSignature = require('../middleware/webhookVerify');
const ct8Controller = require('../controllers/ct8Controller');
const {
    triggerAction,
    handleCallback,
    getStatus,
    updateSecret,
    manageSecretCache
} = require('../controllers/githubController');

const CALLBACK_PATHS = ['/callback', '/webhook', '/result', '/results'];

function createCt8Router({ legacy = false } = {}) {
    const router = express.Router();
    const callbackHandlers = [verifyWebhookSignature(true), handleCallback];
    const ct8ViewAccess = authorizeAccess({
        roles: ['admin', 'super_admin'],
        permissions: ['ct8', 'view_ct8', 'manage_ct8'],
    });
    const ct8ManageAccess = authorizeAccess({
        roles: ['super_admin'],
        permissions: ['manage_ct8'],
    });

    if (legacy) {
        router.use((_req, res, next) => {
            res.setHeader('Deprecation', 'true');
            res.setHeader('Link', '</api/ct8>; rel="successor-version"');
            next();
        });
    }

    for (const path of CALLBACK_PATHS) {
        router.post(path, ...callbackHandlers);
    }

    router.post('/trigger', auth.verifyToken, ct8ManageAccess, triggerAction);
    router.get('/status', auth.verifyToken, ct8ViewAccess, getStatus);
    router.post('/secret/update', auth.verifyToken, ct8ManageAccess, updateSecret);
    router.post('/secret/cache', auth.verifyToken, ct8ManageAccess, manageSecretCache);

    router.get('/stats', auth.verifyToken, ct8ViewAccess, ct8Controller.getCt8Stats);
    router.get('/runs', auth.verifyToken, ct8ViewAccess, ct8Controller.getRunHistory);
    router.get('/runs/:runId', auth.verifyToken, ct8ViewAccess, ct8Controller.getRunDetails);

    return router;
}

module.exports = { CALLBACK_PATHS, createCt8Router };
