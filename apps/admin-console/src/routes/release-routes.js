import { ReleaseOperationError } from "../release-service.js";

export function registerReleaseRoutes(app, {
  recordAudit,
  releases,
  requireConsoleRequest,
  requireRole,
  verifyReauthentication,
}) {
  app.get('/api/releases', async (req, res, next) => {
    try {
      res.json(await releases.getSummary());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/releases/build', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, { action: 'release.build', outcome: 'failure', targetType: 'release', details: { reason: 'reauthentication_failed' } });
        return res.status(403).json({ error: '二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      }
      const result = await releases.dispatchBuild({ targets: req.body?.targets, requestedBy: req.consoleUser.username });
      await recordAudit(req, { action: 'release.build', targetType: 'release', targetId: result.id, details: { targets: result.targets } });
      return res.status(202).json(result);
    } catch (error) {
      if (error instanceof ReleaseOperationError) return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      next(error);
      return undefined;
    }
  });

}
