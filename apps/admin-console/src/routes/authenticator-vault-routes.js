import { rateLimit } from 'express-rate-limit';

export function registerAuthenticatorVaultRoutes(app, { vaults, requireConsoleRequest, recordAudit }) {
  const path = '/api/authenticator-vault';
  app.use(path, rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '同步过于频繁，请稍后重试。', code: 'VAULT_RATE_LIMITED' } }));
  app.use(path, (req, res, next) => {
    if (!req.consoleUser?.username || !req.consoleSession?.nativeKeyThumbprint) {
      return res.status(403).json({ error: '请使用已绑定设备的安卓应用访问。', code: 'VAULT_NATIVE_REQUIRED' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });
  const elevated = (req) => req.consoleSession?.reauthenticatedUntil > Math.floor(Date.now() / 1000);
  const device = (req) => ({ id: req.consoleSession.nativeKeyThumbprint, label: String(req.get('user-agent') || 'Android').slice(0, 100) });
  const guard = (action) => async (req, res, next) => {
    try { await action(req, res); }
    catch (error) {
      if (error.statusCode) res.status(error.statusCode).json({ error: error.message, code: error.code });
      else next(error);
    }
  };
  const recent = (req, res, next) => elevated(req) ? next() : res.status(403).json({ error: '请先完成账号二次验证。', code: 'REAUTHENTICATION_REQUIRED' });
  app.get(path, guard(async (req, res) => res.json({ vault: await vaults.get(req.consoleUser.username), deviceId: device(req).id })));
  app.put(path, requireConsoleRequest, guard(async (req, res) => {
    const vault = await vaults.put(req.consoleUser.username, req.body, device(req), elevated(req));
    await recordAudit(req, { action: 'authenticator.sync', targetType: 'authenticator_vault', details: { revision: vault.revision } });
    res.json({ vault, deviceId: device(req).id });
  }));
  app.post(`${path}/devices`, requireConsoleRequest, recent, guard(async (req, res) => {
    const vault = await vaults.enroll(req.consoleUser.username, device(req), req.body?.revision);
    await recordAudit(req, { action: 'authenticator.device_authorized', targetType: 'authenticator_vault' });
    res.json({ vault, deviceId: device(req).id });
  }));
  app.get(`${path}/history/:revision`, guard(async (req, res) => {
    const vault = await vaults.history(req.consoleUser.username, Number(req.params.revision));
    if (!vault) return res.status(404).json({ error: '历史备份不存在或已过期。', code: 'VAULT_HISTORY_MISSING' });
    return res.json({ vault });
  }));
  app.delete(path, requireConsoleRequest, recent, guard(async (req, res) => {
    await vaults.remove(req.consoleUser.username, req.body?.revision);
    await recordAudit(req, { action: 'authenticator.cloud_deleted', targetType: 'authenticator_vault' });
    res.json({ deleted: true });
  }));
}
