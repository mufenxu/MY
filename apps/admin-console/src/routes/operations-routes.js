import { OperationalIntelligenceError } from "../operational-query.js";

export function registerOperationsRoutes(app, {
  changeCalendar,
  configurations,
  diagnostics,
  operationalSearch,
  operations,
  readBlackboxStatus,
  recordAudit,
  registry,
  requireConsoleRequest,
  requireRole,
  sendConfigurationError,
  slos,
  store,
  tasks,
}) {
  app.get('/api/operations/overview', async (req, res, next) => {
    try {
      if (req.query.refresh === '1') await operations.refresh(true);
      const overview = await operations.getOverview();
      res.json({ platformName: registry.platformName, ...overview });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/operations/history', async (req, res, next) => {
    try {
      const serviceId = String(req.query.serviceId || '');
      if (serviceId && !registry.services.some((service) => service.id === serviceId)) {
        return res.status(400).json({ error: '服务标识无效。', code: 'INVALID_SERVICE_ID' });
      }
      const samples = await operations.getHistory({
        serviceId: serviceId || undefined,
        hours: req.query.hours,
        limit: req.query.limit,
      });
      return res.json({ serviceId: serviceId || null, samples });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/operations/search', requireRole('viewer'), async (req, res, next) => {
    try {
      return res.json(await operationalSearch.search({
        q: req.query.q,
        type: req.query.type,
        limit: req.query.limit,
      }));
    } catch (error) {
      if (error instanceof OperationalIntelligenceError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      next(error);
      return undefined;
    }
  });

  app.get('/api/operations/slo', requireRole('viewer'), async (req, res, next) => {
    try {
      return res.json(await slos.getReport({
        window: req.query.window,
        serviceId: req.query.serviceId,
      }));
    } catch (error) {
      if (error instanceof OperationalIntelligenceError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      next(error);
      return undefined;
    }
  });

  app.get('/api/operations/change-calendar', requireRole('viewer'), async (req, res, next) => {
    try {
      return res.json(await changeCalendar.list({
        from: req.query.from,
        to: req.query.to,
        type: req.query.type,
        serviceId: req.query.serviceId,
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error) {
      if (error instanceof OperationalIntelligenceError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      next(error);
      return undefined;
    }
  });

  app.get('/api/operations/blackbox', async (req, res, next) => {
    try {
      return res.json(await readBlackboxStatus({
        hours: req.query.hours,
        limit: req.query.limit,
      }));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/incidents', async (req, res, next) => {
    try {
      const incidents = await store.listIncidents({ status: req.query.status, limit: req.query.limit });
      res.json({ incidents });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/incidents/:id/actions', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const action = String(req.body?.action || '');
      const incident = await operations.updateIncident(req.params.id, action, {
        actor: req.consoleUser.username,
        note: req.body?.note,
        assignedTo: req.body?.assignedTo,
        muteMinutes: req.body?.muteMinutes,
        stepId: req.body?.stepId,
        completed: req.body?.completed,
        postmortem: req.body?.postmortem,
      });
      if (!incident) return res.status(404).json({ error: '事件不存在或操作无效。', code: 'INCIDENT_NOT_FOUND' });
      return res.json({ incident });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/audit', async (req, res, next) => {
    try {
      const events = await store.listAudit({
        action: req.query.action,
        actor: req.query.actor,
        outcome: req.query.outcome,
        limit: req.query.limit,
      });
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/operations/settings', async (req, res, next) => {
    try {
      const settings = await operations.getSettings();
      res.json({ settings, services: registry.services.map(({ id, name, shortName }) => ({ id, name, shortName })) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/operations/settings', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.propose({
        settings: req.body?.settings || req.body || {},
        summary: req.body?.summary || 'Operations settings update',
        actor: req.consoleUser.username,
      });
      await recordAudit(req, { action: 'configuration.change_proposed', targetType: 'configuration_change', targetId: change.id, details: { changedKeys: change.changedKeys } });
      res.status(202).json({ change });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        return res.status(400).json({ error: '运行设置格式无效。', code: 'INVALID_OPERATIONS_SETTINGS' });
      }
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); }
      return undefined;
    }
  });

  app.get('/api/configuration', async (req, res, next) => {
    try { return res.json(await configurations.getOverview()); }
    catch (error) { next(error); return undefined; }
  });

  app.post('/api/configuration/changes', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.propose({ settings: req.body?.settings || {}, summary: req.body?.summary, actor: req.consoleUser.username });
      await recordAudit(req, { action: 'configuration.change_proposed', targetType: 'configuration_change', targetId: change.id, details: { changedKeys: change.changedKeys } });
      return res.status(201).json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/changes/:id/approve', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await configurations.approve(req.params.id, req.consoleUser.username, req.body?.note);
      await recordAudit(req, { action: 'configuration.change_applied', targetType: 'configuration_change', targetId: req.params.id, details: { version: result.version } });
      return res.json(result);
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/changes/:id/reject', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const change = await configurations.reject(req.params.id, req.consoleUser.username, req.body?.note);
      await recordAudit(req, { action: 'configuration.change_rejected', targetType: 'configuration_change', targetId: req.params.id });
      return res.json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/versions/:version/rollback', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.proposeRollback(req.params.version, { actor: req.consoleUser.username, summary: req.body?.summary });
      await recordAudit(req, { action: 'configuration.rollback_proposed', targetType: 'configuration_change', targetId: change.id, details: { targetVersion: change.targetVersion } });
      return res.status(201).json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/tasks', async (req, res, next) => {
    try { return res.json(await tasks.list({ status: req.query.status, source: req.query.source, limit: req.query.limit })); }
    catch (error) { next(error); return undefined; }
  });

  app.post('/api/diagnostics/traces', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await diagnostics.run({ serviceId: req.body?.serviceId, parentRequestId: req.requestId });
      await recordAudit(req, { action: 'diagnostics.trace', outcome: result.summary.attention ? 'failure' : 'success', targetType: 'service', targetId: req.body?.serviceId || 'all', details: result.summary });
      return res.json(result);
    } catch (error) {
      if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
      return undefined;
    }
  });

  app.post('/api/diagnostics/run', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await operations.runDiagnostics();
      await recordAudit(req, {
        action: 'diagnostics.run',
        outcome: result.checks.every((check) => check.status === 'passed') ? 'success' : 'failure',
        targetType: 'platform',
        details: { checks: result.checks.map(({ id, status }) => ({ id, status })) },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

}
