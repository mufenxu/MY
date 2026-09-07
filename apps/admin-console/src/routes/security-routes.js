import { createPasswordHash, verifyPassword } from "../auth.js";

export function registerSecurityRoutes(app, {
  accounts,
  clearSessionCookies,
  config,
  confirmSensitiveAuthentication,
  passkeys,
  recordAudit,
  requireConsoleRequest,
  requireRole,
  sessionPolicyForRequest,
  sessions,
}) {
  app.get('/api/security/sessions', async (req, res, next) => {
    try {
      const list = await sessions.list?.({ subject: req.consoleUser.role === 'super_admin' ? undefined : req.consoleUser.username }) || [];
      const policy = sessionPolicyForRequest(req, config);
      res.json({
        currentNonce: req.consoleSession?.nonce || null,
        sessions: list,
        security: {
          role: req.consoleUser.role,
          totpEnabled: Boolean(req.consoleAccount?.totpEnabled),
          recoveryCodesRemaining: req.consoleAccount?.recoveryCodesRemaining || 0,
          passkeyCount: req.consoleAccount?.passkeyCount || 0,
          sessionTtlHours: policy.ttlHours,
          sessionIdleMinutes: policy.idleMinutes,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/security/sessions/:nonce', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const revoked = await sessions.revokeByNonce?.(req.params.nonce);
      if (!revoked) return res.status(404).json({ error: '会话不存在或已经失效。', code: 'SESSION_NOT_FOUND' });
      await recordAudit(req, {
        action: 'security.session_revoked',
        targetType: 'session',
        targetId: req.params.nonce,
      });
      if (req.params.nonce === req.consoleSession?.nonce) {
        clearSessionCookies(res, config);
      }
      return res.json({ revoked: true, current: req.params.nonce === req.consoleSession?.nonce });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/security/accounts', requireRole('super_admin'), async (req, res, next) => {
    try {
      return res.json({ accounts: await accounts.listAccounts() });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/accounts', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.account_created')) return undefined;
      const passwordHash = await createPasswordHash(String(req.body?.newPassword || ''));
      const account = await accounts.createAccount({
        username: req.body?.username,
        passwordHash,
        role: req.body?.role,
      });
      await recordAudit(req, { action: 'security.account_created', targetType: 'account', targetId: account.username, details: { role: account.role } });
      return res.status(201).json({ account });
    } catch (error) {
      if (error.message === 'ACCOUNT_EXISTS') return res.status(409).json({ error: '管理员账号已经存在。', code: 'ACCOUNT_EXISTS' });
      if (error.message === 'INVALID_ACCOUNT' || error.message.includes('15 到 256')) {
        return res.status(400).json({ error: error.message === 'INVALID_ACCOUNT' ? '管理员账号或角色格式无效。' : error.message, code: 'INVALID_ACCOUNT' });
      }
      next(error);
      return undefined;
    }
  });

  app.patch('/api/security/accounts/:username', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.account_updated')) return undefined;
      const account = await accounts.updateAccount(req.params.username, { role: req.body?.role, active: req.body?.active });
      if (!account) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await sessions.revokeBySubject?.(account.username);
      await app.locals.onConsoleSessionsChanged();
      await recordAudit(req, { action: 'security.account_updated', targetType: 'account', targetId: account.username, details: { role: account.role, active: account.active } });
      if (account.username === req.consoleUser.username) clearSessionCookies(res, config);
      return res.json({ account, currentSessionRevoked: account.username === req.consoleUser.username });
    } catch (error) {
      if (error.message === 'LAST_SUPER_ADMIN') return res.status(409).json({ error: '不能停用或降级最后一个超级管理员。', code: 'LAST_SUPER_ADMIN' });
      if (error.message === 'INVALID_ROLE') return res.status(400).json({ error: '管理员角色无效。', code: 'INVALID_ROLE' });
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/password', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.password_changed')) return undefined;
      const newPassword = String(req.body?.newPassword || '');
      if (await verifyPassword(newPassword, req.consoleAccount.passwordHash)) {
        return res.status(400).json({ error: '新密码不能与当前密码相同。', code: 'PASSWORD_UNCHANGED' });
      }
      const passwordHash = await createPasswordHash(newPassword);
      await accounts.setPasswordHash(req.consoleUser.username, passwordHash);
      await sessions.revokeBySubject?.(req.consoleUser.username);
      await app.locals.onConsoleSessionsChanged();
      clearSessionCookies(res, config);
      await recordAudit(req, { action: 'security.password_changed', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ changed: true, currentSessionRevoked: true });
    } catch (error) {
      if (error.message.includes('15 到 256')) {
        return res.status(400).json({ error: error.message, code: 'INVALID_PASSWORD' });
      }
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/enrollment', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.totp_enrollment_started')) return undefined;
      const enrollment = await accounts.beginTotpEnrollment(req.consoleUser.username);
      if (!enrollment) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await recordAudit(req, { action: 'security.totp_enrollment_started', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ enrollment });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/confirm', requireConsoleRequest, async (req, res, next) => {
    try {
      const result = await accounts.confirmTotpEnrollment(req.consoleUser.username, req.body?.totp);
      if (!result) return res.status(400).json({ error: '动态验证码无效或注册已过期。', code: 'TOTP_ENROLLMENT_INVALID' });
      await recordAudit(req, { action: 'security.totp_enabled', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/recovery-codes', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.recovery_codes_regenerated')) return undefined;
      const result = await accounts.regenerateRecoveryCodes(req.consoleUser.username);
      if (!result) return res.status(409).json({ error: '请先启用动态验证。', code: 'TOTP_NOT_ENABLED' });
      await recordAudit(req, { action: 'security.recovery_codes_regenerated', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/api/security/totp', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.totp_disabled')) return undefined;
      if (config.requireMfa) {
        return res.status(409).json({
          error: '生产多因素策略已启用，不能停用动态验证。',
          code: 'MFA_REQUIRED',
        });
      }
      await accounts.disableTotp(req.consoleUser.username);
      await sessions.revokeBySubject?.(req.consoleUser.username);
      await app.locals.onConsoleSessionsChanged();
      clearSessionCookies(res, config);
      await recordAudit(req, { action: 'security.totp_disabled', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ disabled: true, currentSessionRevoked: true });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/security/passkeys', async (req, res, next) => {
    try {
      return res.json({ passkeys: await accounts.listPasskeys(req.consoleUser.username) });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/passkeys/options', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.passkey_enrollment_started')) return undefined;
      const result = await passkeys.registrationOptions(req.consoleUser.username);
      if (!result) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await recordAudit(req, { action: 'security.passkey_enrollment_started', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/passkeys/verify', requireConsoleRequest, async (req, res, _next) => {
    try {
      const result = await passkeys.verifyRegistration(req.consoleUser.username, req.body);
      if (!result.verified) return res.status(400).json({ error: 'Passkey 注册验证失败。', code: 'PASSKEY_REGISTRATION_FAILED' });
      await recordAudit(req, { action: 'security.passkey_registered', targetType: 'account', targetId: req.consoleUser.username });
      return res.status(201).json(result);
    } catch {
      return res.status(400).json({ error: 'Passkey 注册验证失败。', code: 'PASSKEY_REGISTRATION_FAILED' });
    }
  });

  app.delete('/api/security/passkeys/:id', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.passkey_deleted')) return undefined;
      const deleted = await accounts.deletePasskey(req.consoleUser.username, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Passkey 不存在。', code: 'PASSKEY_NOT_FOUND' });
      await recordAudit(req, { action: 'security.passkey_deleted', targetType: 'passkey', targetId: req.params.id });
      return res.json({ deleted: true });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

}
