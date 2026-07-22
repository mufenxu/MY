function clampRunLimit(rawValue) {
  const parsed = Number.parseInt(rawValue || '50', 10);
  return Math.min(200, Math.max(1, Number.isFinite(parsed) ? parsed : 50));
}

function registerAutomationRoutes(app, {
  automationEngine,
  requireTelemetryAccess,
  requireRelayControl
}) {
  app.get('/api/automations/rules', requireTelemetryAccess, async (req, res, next) => {
    try { res.json(await automationEngine.listRules()); } catch (error) { next(error); }
  });

  app.get('/api/automations/status', requireTelemetryAccess, (req, res) => {
    res.json(automationEngine.getStatus());
  });

  app.post('/api/automations/rules', requireRelayControl, async (req, res, next) => {
    try { res.status(201).json(await automationEngine.createRule(req.body || {})); } catch (error) { next(error); }
  });

  app.put('/api/automations/rules/:id', requireRelayControl, async (req, res, next) => {
    try { res.json(await automationEngine.updateRule(req.params.id, req.body || {})); } catch (error) { next(error); }
  });

  app.delete('/api/automations/rules/:id', requireRelayControl, async (req, res, next) => {
    try {
      await automationEngine.deleteRule(req.params.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/automations/scenes', requireTelemetryAccess, async (req, res, next) => {
    try { res.json(await automationEngine.listScenes()); } catch (error) { next(error); }
  });

  app.post('/api/automations/scenes', requireRelayControl, async (req, res, next) => {
    try { res.status(201).json(await automationEngine.createScene(req.body || {})); } catch (error) { next(error); }
  });

  app.put('/api/automations/scenes/:id', requireRelayControl, async (req, res, next) => {
    try { res.json(await automationEngine.updateScene(req.params.id, req.body || {})); } catch (error) { next(error); }
  });

  app.delete('/api/automations/scenes/:id', requireRelayControl, async (req, res, next) => {
    try {
      await automationEngine.deleteScene(req.params.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/automations/scenes/:id/run', requireRelayControl, async (req, res, next) => {
    try {
      const actor = req.auth?.username || 'web_ui';
      res.status(202).json(await automationEngine.runScene(req.params.id, actor));
    } catch (error) { next(error); }
  });

  app.get('/api/automations/runs', requireTelemetryAccess, async (req, res, next) => {
    try { res.json(await automationEngine.listRuns(clampRunLimit(req.query.limit))); } catch (error) { next(error); }
  });
}

module.exports = {
  clampRunLimit,
  registerAutomationRoutes
};
