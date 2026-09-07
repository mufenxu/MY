import express from "express";
import { NotificationManagementError } from "../notification-management.js";
import rateLimit from "express-rate-limit";

export function registerNotificationRoutes(app, {
  notificationManagement,
  recordAudit,
  requireConsoleRequest,
  requireRole,
}) {
  const router = express.Router();
  router.get('/api/notifications/overview', async (_req, res) => {
    return res.json(await notificationManagement.getOverview());
  });

  router.get('/api/notifications/deliveries', async (req, res) => {
    return res.json(await notificationManagement.listDeliveries({
      status: req.query.status,
      caller: req.query.caller,
      msgType: req.query.msgType,
      page: req.query.page,
      pageSize: req.query.pageSize,
    }));
  });

  router.get('/api/notifications/api-access', requireRole('operator'), async (_req, res) => {
    return res.json(await notificationManagement.getApiAccess());
  });

  router.get('/api/notifications/api-requests', requireRole('operator'), async (req, res) => {
    return res.json(await notificationManagement.listApiRequests({
      clientId: req.query.clientId,
      outcome: req.query.outcome,
      endpoint: req.query.endpoint,
      page: req.query.page,
      pageSize: req.query.pageSize,
    }));
  });

  router.post('/api/notifications/api-clients', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    const result = await notificationManagement.createApiClient(req.body || {}, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.api_client_created',
      targetType: 'notification_api_client',
      targetId: result.client?.id || '',
      details: { scopes: result.client?.scopes || [] },
    });
    return res.status(201).json(result);
  });

  router.put('/api/notifications/api-clients/:id', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    const result = await notificationManagement.updateApiClient(req.params.id, req.body || {}, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.api_client_updated',
      targetType: 'notification_api_client',
      targetId: req.params.id,
      details: { scopes: result.client?.scopes || [] },
    });
    return res.json(result);
  });

  router.post('/api/notifications/api-clients/:id/rotate', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    const result = await notificationManagement.rotateApiClient(req.params.id, req.body?.overlapMinutes, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.api_client_rotated',
      targetType: 'notification_api_client',
      targetId: req.params.id,
      details: { overlapMinutes: Number(req.body?.overlapMinutes ?? 1440) },
    });
    return res.status(201).json(result);
  });

  router.post('/api/notifications/api-clients/:id/revoke', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    const result = await notificationManagement.revokeApiClient(req.params.id, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.api_client_revoked',
      targetType: 'notification_api_client',
      targetId: req.params.id,
    });
    return res.json(result);
  });

  const notificationSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '通知测试或重试操作过于频繁。', code: 'NOTIFICATION_SEND_RATE_LIMITED' },
  });

  router.post('/api/notifications/test', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.sendTest(req.body || {}, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.test_send',
      targetType: 'notification_recipient',
      targetId: String(req.body?.touser || '').slice(0, 64),
      details: { msgType: String(req.body?.msgType || '') },
    });
    return res.status(201).json(result);
  });

  router.get('/api/notifications/app/overview', requireRole('operator'), async (req, res) => {
    return res.json(await notificationManagement.getAppOverview({
      userId: req.query.userId,
      limit: req.query.limit,
    }));
  });

  router.post('/api/notifications/app/test', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.sendAppTest(req.body || {}, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.app_test_send',
      targetType: 'notification_app_recipient',
      targetId: String(req.body?.userId || '').slice(0, 128),
      details: { priority: String(req.body?.priority || 'high') },
    });
    return res.status(201).json(result);
  });

  router.post('/api/notifications/deliveries/:id/retry', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.retryDelivery(req.params.id, req.consoleUser.username);
    await recordAudit(req, {
      action: 'notification.retry',
      targetType: 'notification_delivery',
      targetId: String(req.params.id || '').slice(0, 128),
    });
    return res.status(201).json(result);
  });

  router.get('/api/notifications/templates', async (_req, res) => {
    return res.json(await notificationManagement.listTemplates());
  });

  router.put('/api/notifications/templates/:key', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    const result = await notificationManagement.saveTemplate({ ...req.body, key: req.params.key }, req.consoleUser.username);
    await recordAudit(req, { action: 'notification.template_saved', targetType: 'notification_template', targetId: req.params.key });
    return res.json(result);
  });

  router.delete('/api/notifications/templates/:key', requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    await notificationManagement.deleteTemplate(req.params.key);
    await recordAudit(req, { action: 'notification.template_deleted', targetType: 'notification_template', targetId: req.params.key });
    return res.status(204).end();
  });

  router.get('/api/notifications/jobs', async (req, res) => {
    return res.json(await notificationManagement.listJobs({
      status: req.query.status, caller: req.query.caller, page: req.query.page, pageSize: req.query.pageSize,
    }));
  });

  router.post('/api/notifications/jobs', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.createJob(req.body || {}, req.consoleUser.username);
    await recordAudit(req, { action: 'notification.job_created', targetType: 'notification_job', targetId: result.job?.id || '' });
    return res.status(result.deduplicated ? 200 : 202).json(result);
  });

  router.post('/api/notifications/jobs/:id/cancel', requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.cancelJob(req.params.id, req.consoleUser.username);
    await recordAudit(req, { action: 'notification.job_cancelled', targetType: 'notification_job', targetId: req.params.id });
    return res.json(result);
  });

  router.get('/api/notifications/preferences/:targetId', requireRole('operator'), async (req, res) => {
    return res.json(await notificationManagement.getPreference(req.params.targetId));
  });

  router.put('/api/notifications/preferences/:targetId', requireConsoleRequest, requireRole('operator'), async (req, res) => {
    const result = await notificationManagement.savePreference(req.params.targetId, req.body || {}, req.consoleUser.username);
    await recordAudit(req, { action: 'notification.preference_saved', targetType: 'notification_recipient', targetId: req.params.targetId });
    return res.json(result);
  });

  router.use((error, _req, res, next) => {
    if (error instanceof NotificationManagementError) {
      return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
    }
    return next(error);
  });
  app.use(router);
}
