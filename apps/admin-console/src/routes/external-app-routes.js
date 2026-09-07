import {
  checkExternalApplicationHealth,
  normalizeExternalApplicationInput,
  roleCanAccessExternalApplication,
  sanitizeExternalApplication,
  visibleExternalApplications
} from "../external-application-service.js";

export function registerExternalAppRoutes(app, {
  config,
  externalApplications,
  fetchImpl,
  googleAccounts,
  isAndroidAppRequest,
  publicUrl,
  recordAudit,
  requireConsoleRequest,
  requireRole,
  webLoginTickets,
}) {
  app.get('/api/external-apps', async (req, res, next) => {
    try {
      const applications = await externalApplications.listApplications();
      const visible = visibleExternalApplications(applications, req.consoleUser.role);
      const rows = await Promise.all(visible.map(async (application) => ({
        ...sanitizeExternalApplication(application, {
          role: req.consoleUser.role,
          includeClient: req.consoleUser.role === 'super_admin',
        }),
        health: await checkExternalApplicationHealth(application, {
          fetchImpl,
          timeoutMs: config.serviceTimeoutMs,
        }),
      })));
      return res.json({ applications: rows });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/external-apps', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const input = normalizeExternalApplicationInput(req.body, { isProduction: config.isProduction });
      const created = await externalApplications.createApplication({ ...input, actor: req.consoleUser.username });
      await recordAudit(req, {
        action: 'external_application.created',
        targetType: 'external_application',
        targetId: created.application.id,
        details: { clientId: created.application.clientId },
      });
      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ error: error.message, code: 'EXTERNAL_APPLICATION_INVALID' });
      next(error);
      return undefined;
    }
  });

  app.put('/api/external-apps/:id', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const input = normalizeExternalApplicationInput(req.body, { isProduction: config.isProduction });
      const application = await externalApplications.updateApplication(req.params.id, {
        ...input,
        actor: req.consoleUser.username,
      });
      if (!application) return res.status(404).json({ error: '外部应用不存在。', code: 'EXTERNAL_APPLICATION_NOT_FOUND' });
      await recordAudit(req, {
        action: 'external_application.updated',
        targetType: 'external_application',
        targetId: application.id,
      });
      return res.json({ application });
    } catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ error: error.message, code: 'EXTERNAL_APPLICATION_INVALID' });
      next(error);
      return undefined;
    }
  });

  app.post('/api/external-apps/:id/rotate-secret', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const rotated = await externalApplications.rotateClientSecret(req.params.id, req.consoleUser.username);
      if (!rotated) return res.status(404).json({ error: '外部应用不存在。', code: 'EXTERNAL_APPLICATION_NOT_FOUND' });
      await recordAudit(req, {
        action: 'external_application.secret_rotated',
        targetType: 'external_application',
        targetId: rotated.application.id,
      });
      return res.json(rotated);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/api/external-apps/:id', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const deleted = await externalApplications.deleteApplication(req.params.id);
      if (!deleted) return res.status(404).json({ error: '外部应用不存在。', code: 'EXTERNAL_APPLICATION_NOT_FOUND' });
      await recordAudit(req, {
        action: 'external_application.deleted',
        targetType: 'external_application',
        targetId: req.params.id,
      });
      return res.json({ deleted: true });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/external-apps/:id/launch', requireConsoleRequest, async (req, res, next) => {
    try {
      const application = await externalApplications.getApplication(req.params.id);
      if (!application?.enabled) return res.status(404).json({ error: '外部应用不存在或已经停用。', code: 'EXTERNAL_APPLICATION_NOT_FOUND' });
      if (!roleCanAccessExternalApplication(req.consoleUser.role, application)) {
        return res.status(403).json({ error: '当前账号没有进入该应用的权限。', code: 'INSUFFICIENT_ROLE' });
      }
      let loginUrl;
      let expiresAt = null;
      let autoLogin = null;
      if (application.kind === 'direct') {
        loginUrl = application.launchUrl;
      } else if (application.autoLogin) {
        const secrets = await externalApplications.revealApplicationSecrets(application.id);
        autoLogin = secrets?.autoLogin || null;
        loginUrl = application.autoLogin.loginUrl;
      } else {
        const redirect = new URL(`/oauth/external-launch/${encodeURIComponent(application.id)}`, publicUrl.origin).toString();
        loginUrl = redirect;
        if (isAndroidAppRequest(req) && !config.authDisabled) {
          const created = await webLoginTickets.create({
            username: req.consoleUser.username,
            role: req.consoleUser.role,
            redirect,
            appSessionNonce: req.consoleSession?.nonce,
            appIp: req.ip,
            appUserAgent: req.get('user-agent'),
            sessionKind: application.openMode === 'webview' ? 'embedded_web' : 'browser',
          });
          const ticketUrl = new URL('/console/app-login', publicUrl.origin);
          ticketUrl.searchParams.set('ticket', created.ticket);
          ticketUrl.searchParams.set('redirect', redirect);
          loginUrl = ticketUrl.toString();
          expiresAt = created.record.expiresAt;
        }
      }
      await recordAudit(req, {
        action: 'external_application.launch_requested',
        targetType: 'external_application',
        targetId: application.id,
        details: { android: isAndroidAppRequest(req), openMode: application.openMode },
      });
      return res.status(201).json({ loginUrl, openMode: application.openMode, expiresAt, autoLogin });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/google-accounts', async (req, res, next) => {
    try {
      return res.json({ success: true, ...await googleAccounts.get(req.consoleUser.username) });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/google-accounts', requireConsoleRequest, async (req, res, next) => {
    try {
      const revision = req.body?.revision;
      if (!Number.isSafeInteger(revision) || revision < 0) {
        const error = new Error('Invalid Google account revision');
        error.statusCode = 400;
        throw error;
      }
      const snapshot = await googleAccounts.replace(
        req.consoleUser.username,
        req.body?.accounts,
        revision,
      );
      if (!snapshot) {
        return res.status(409).json({
          success: false,
          code: 'GOOGLE_ACCOUNT_REVISION_CONFLICT',
          message: 'Google account ledger changed on another device',
          details: await googleAccounts.get(req.consoleUser.username),
        });
      }
      return res.json({ success: true, ...snapshot });
    } catch (error) {
      return next(error);
    }
  });

}
