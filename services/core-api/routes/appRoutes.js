const express = require('express');
const router = express.Router();
const appClientController = require('../controllers/appClientController');
const authMiddleware = require('../middleware/auth');

const authorize = require('../middleware/authorize');
const requireReauthentication = require('../middleware/reauthenticate');

router.get('/', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.listApps);
router.post('/', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.createApp);
router.put('/:id', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.updateApp);
router.delete('/:id', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.deleteApp);
router.get('/:id/secret', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.getSecretMetadata);
router.post('/:id/secret/reveal', authMiddleware.verifyToken, authorize('super_admin'), requireReauthentication('APP_SECRET_REVEAL'), appClientController.revealSecret);
router.post('/:id/reset-secret', authMiddleware.verifyToken, authorize('super_admin'), requireReauthentication('APP_SECRET_RESET'), appClientController.resetSecret);

module.exports = router;
