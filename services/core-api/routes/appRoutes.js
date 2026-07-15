const express = require('express');
const router = express.Router();
const appClientController = require('../controllers/appClientController');
const authMiddleware = require('../middleware/auth');

const authorize = require('../middleware/authorize');

router.get('/', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.listApps);
router.post('/', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.createApp);
router.put('/:id', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.updateApp);
router.delete('/:id', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.deleteApp);
router.get('/:id/secret', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.getSecret);
router.post('/:id/reset-secret', authMiddleware.verifyToken, authorize('admin', 'super_admin'), appClientController.resetSecret);

module.exports = router;
