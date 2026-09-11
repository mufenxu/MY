import { AcrOperationError } from '../acr-service.js';

function sendAcrError(res, next, error) {
  if (error instanceof AcrOperationError) {
    return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
  }
  next(error);
  return undefined;
}

export function registerAcrRoutes(app, {
  acr,
  recordAudit,
  requireConsoleRequest,
  requireRole,
}) {
  app.get('/api/acr/images', requireRole('viewer'), async (req, res, next) => {
    try {
      return res.json(await acr.getImages({ refresh: req.query?.refresh === '1' }));
    } catch (error) {
      return sendAcrError(res, next, error);
    }
  });

  app.post('/api/acr/images/delete', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (req.body?.confirm !== true) {
        throw new AcrOperationError(400, 'ACR_CONFIRM_REQUIRED', '删除镜像需要显式确认。');
      }
      const result = await acr.deleteImages({ tags: req.body?.tags });
      await recordAudit(req, {
        action: 'acr.images.delete',
        targetType: 'acr_repository',
        targetId: result.repository,
        details: {
          requested: Array.isArray(req.body?.tags) ? req.body.tags.length : 0,
          deleted: result.deleted.map((item) => item.tag),
          skipped: result.skipped,
          failed: result.failed,
        },
      });
      return res.json(result);
    } catch (error) {
      return sendAcrError(res, next, error);
    }
  });

  app.post('/api/acr/images/prune', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const dryRun = req.body?.dryRun !== false;
      if (!dryRun && req.body?.confirm !== true) {
        throw new AcrOperationError(400, 'ACR_CONFIRM_REQUIRED', '批量清理需要显式确认。');
      }
      const input = {
        keep: req.body?.keep,
        prefixes: req.body?.prefixes,
        includeUnknown: req.body?.includeUnknown === true,
        dryRun,
      };
      const result = await acr.pruneImages(input);
      if (!dryRun) {
        await recordAudit(req, {
          action: 'acr.images.prune',
          targetType: 'acr_repository',
          targetId: result.repository,
          details: {
            keep: result.keep,
            planned: result.planned,
            remaining: result.remaining,
            deleted: result.deleted.map((item) => item.tag),
            skipped: result.skipped,
            failed: result.failed,
          },
        });
      }
      return res.json(result);
    } catch (error) {
      return sendAcrError(res, next, error);
    }
  });
}
