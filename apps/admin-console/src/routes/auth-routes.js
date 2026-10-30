import { createPasswordHash, sessionCookieName, verifyPassword } from '../auth.js';
import rateLimit from 'express-rate-limit';
import { verifyTurnstileToken } from '../bot-challenge.js';

export function registerAuthRoutes(app, {
  accounts,
  authUser,
  clearSessionCookies,
  config,
  deviceSecurity,
  fetchImpl,
  isAndroidAppRequest,
  issueAuthenticatedSession,
  nativeIntegrityAllowed,
  nativeLoginProof,
  passkeys,
  publicUrl,
  readSession,
  recordAudit,
  recordLoginFailure,
  requestDeviceId,
  requireConsoleRequest,
  risk,
  sendRiskResponse,
  sessionCookieOptions,
  sessions,
  strongFactorEnabled,
  upgradePasswordHashAfterLogin,
}) {
  app.get('/api/auth/status', async (req, res) => {
    if (config.authDisabled) {
      return res.json({ authenticated: true, authDisabled: true, totpRequired: false, user: { username: 'local-admin', role: 'super_admin', totpEnabled: false } });
    }
    const session = await readSession(req);
    const account = session ? await accounts.findAccount(session.sub) : null;
    const mfaCompliant = !config.requireMfa || strongFactorEnabled(account);
    return res.json({
      authenticated: Boolean(session && account?.active && mfaCompliant),
      authDisabled: false,
      totpRequired: Boolean(account?.totpEnabled),
      mfaRequired: Boolean(config.requireMfa),
      mfaEnrollmentRequired: Boolean(account?.active && !mfaCompliant),
      passkeySupported: true,
      androidPasskeySupported: (config.androidAppCertFingerprints || []).length > 0,
      deviceSecurity: {
        proofRequired: Boolean(config.androidRequireDeviceProof),
        attestationConfigured: Boolean(config.androidAttestationRootSha256?.length),
        integrityRequired: Boolean(config.androidRequireIntegrity),
        integrity: session?.nativeIntegrity || 'unverified',
      },
      botProtectionConfigured: Boolean(config.turnstileSiteKey && config.turnstileSecretKey),
      turnstileSiteKey: config.turnstileSiteKey || undefined,
      user: session && account?.active && mfaCompliant ? authUser(account) : null,
    });
  });

  const loginLimiter = rateLimit({
    windowMs: config.loginWindowMinutes * 60 * 1000,
    limit: Math.max(config.loginMaxAttempts * 3, 30),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: '登录尝试过多，请稍后再试。', code: 'LOGIN_RATE_LIMITED' },
  });
  const qrCreateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '二维码创建过于频繁，请稍后再试。', code: 'QR_LOGIN_RATE_LIMITED' },
  });
  const webLoginLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Web login ticket requests are too frequent.', code: 'WEB_LOGIN_RATE_LIMITED' },
  });
  const qrApprovalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '扫码确认请求过于频繁，请稍后再试。', code: 'QR_LOGIN_RATE_LIMITED' },
  });

  app.post('/api/auth/device/challenge', qrCreateLimiter, requireConsoleRequest, async (req, res) => {
    return res.json(await deviceSecurity.challenge());
  });

  app.post('/api/auth/native/refresh', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || !/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
      return res.status(401).json({ error: '登录会话已失效，请重新登录。', code: 'SESSION_REFRESH_INVALID' });
    }
    const proof = await deviceSecurity.proof(req);
    const refreshed = await sessions.refreshNative(refreshToken, {
      thumbprint: proof.thumbprint, accessTtlSeconds: config.androidAccessTtlSeconds,
    });
    await app.locals.onConsoleSessionsChanged();
    const account = refreshed ? await accounts.findAccount(refreshed.sub) : null;
    if (!refreshed || !account?.active || (config.requireMfa && !strongFactorEnabled(account)) ||
        refreshed.accountId !== account.id || (refreshed.authVersion || 0) !== (account.authVersion || 0) ||
        !nativeIntegrityAllowed(refreshed)) {
      if (refreshed) await app.locals.revokeConsoleSessions({ subject: refreshed.sub, nonce: refreshed.nonce });
      clearSessionCookies(res, config);
      return res.status(401).json({ error: '登录会话已失效或设备证明已过期，请重新登录。', code: 'SESSION_REFRESH_INVALID' });
    }
    res.cookie(sessionCookieName(config.isProduction), refreshed.token, sessionCookieOptions(config, config.androidAccessTtlSeconds / 3600));
    return res.json({ session: {
      refreshToken: refreshed.refreshToken,
      accessExpiresAt: new Date(refreshed.accessExpiresAt * 1000).toISOString(),
      expiresAt: new Date(refreshed.expiresAt * 1000).toISOString(),
      deviceBound: true, deviceIntegrity: refreshed.nativeIntegrity,
    } });
  });

  app.post('/api/auth/login', loginLimiter, requireConsoleRequest, async (req, res) => {
    if (config.authDisabled) {
      return res.json({
        authenticated: true,
        authDisabled: true,
        totpRequired: false,
        user: { username: 'local-admin', role: 'super_admin', totpEnabled: false },
      });
    }

    const deviceProof = await nativeLoginProof(req);
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    if (riskState.challengeRequired) {
      const challenge = await verifyTurnstileToken({
        token: req.body?.challengeToken,
        secretKey: config.turnstileSecretKey,
        remoteIp: req.ip,
        expectedHostname: publicUrl.hostname,
        fetchImpl,
      });
      if (!challenge.valid) {
        return res.status(401).json({
          error: '请先完成人机验证。',
          code: 'BOT_CHALLENGE_REQUIRED',
          details: { challengeRequired: true, turnstileSiteKey: config.turnstileSiteKey },
        });
      }
    }

    const account = await accounts.findAccount(username);
    const passwordHash = account?.passwordHash || config.adminPasswordHash;
    const passwordValid = await verifyPassword(password, passwordHash);
    if (!account?.active || !passwordValid) {
      return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_credentials'));
    }
    if (config.requireMfa && !account.totpEnabled && account.passkeyCount > 0) {
      return res.status(401).json({ error: '该账号必须使用 Passkey 登录。', code: 'PASSKEY_REQUIRED' });
    }
    await upgradePasswordHashAfterLogin(username, account.passwordHash, password);
    if (!account.totpEnabled && !config.requireMfa) return issueAuthenticatedSession(req, res, account, 'password');

    const enrollment = account.totpEnabled ? null : await accounts.beginTotpEnrollment(username);
    const challengeId = await accounts.saveChallenge({
      kind: 'password_login', username,
      challenge: {
        accountId: account.id, authVersion: account.authVersion || 0,
        step: enrollment ? 'enrollment' : 'totp',
        enrollmentId: enrollment?.id,
        deviceId: requestDeviceId(req), android: isAndroidAppRequest(req),
        deviceKeyThumbprint: deviceProof?.thumbprint || '',
      },
    });
    if (enrollment) await recordAudit(req, { actor: username, action: 'security.totp_enrollment_started', targetType: 'account', targetId: username });
    return res.status(202).json({
      authenticated: false,
      code: enrollment ? 'MFA_ENROLLMENT_REQUIRED' : 'SECOND_FACTOR_REQUIRED',
      details: {
        challengeId, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        totpRequired: true, recoveryCodeAllowed: account.recoveryCodesRemaining > 0,
        ...(enrollment ? { enrollment } : {}),
      },
    });
  });

  app.post('/api/auth/login/complete', loginLimiter, requireConsoleRequest, async (req, res) => {
    const invalidChallenge = () => res.status(401).json({ error: '登录验证已过期或失效，请重新输入账号密码。', code: 'LOGIN_CHALLENGE_INVALID' });
    const pending = await accounts.findChallenge(req.body?.challengeId, 'password_login');
    if (!pending) return invalidChallenge();
    const { username, challenge } = pending;
    const deviceProof = await nativeLoginProof(req);
    if ((challenge.deviceKeyThumbprint || '') !== (deviceProof?.thumbprint || '')) return invalidChallenge();
    const account = await accounts.findAccount(username);
    if (!account?.active || account.id !== challenge.accountId || (account.authVersion || 0) !== challenge.authVersion
      || challenge.android !== isAndroidAppRequest(req) || challenge.deviceId !== requestDeviceId(req)) return invalidChallenge();
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    const factor = challenge.step === 'enrollment'
      ? await accounts.confirmTotpEnrollment(username, req.body?.enrollmentCode, { enrollmentId: challenge.enrollmentId, authVersion: challenge.authVersion })
      : await accounts.consumeSecondFactor(username, { totp: req.body?.totp, recoveryCode: req.body?.recoveryCode });
    if (!factor || (challenge.step !== 'enrollment' && (!account.totpEnabled || !factor.valid))) {
      await accounts.failChallenge(req.body?.challengeId, 'password_login');
      return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_second_factor'));
    }
    if (!await accounts.consumeChallenge(req.body?.challengeId, 'password_login', username)) return invalidChallenge();
    const current = await accounts.findAccount(username);
    if (!current?.active || current.id !== challenge.accountId || (current.authVersion || 0) !== challenge.authVersion) return invalidChallenge();
    if (challenge.step === 'enrollment') await recordAudit(req, { actor: username, action: 'security.totp_enabled', targetType: 'account', targetId: username });
    return issueAuthenticatedSession(req, res, current, challenge.step === 'enrollment' ? 'password_totp_enrollment' : `password_${factor.method}`, factor.recoveryCodes ? { recoveryCodes: factor.recoveryCodes } : {});
  });

  app.post('/api/auth/recovery', loginLimiter, requireConsoleRequest, async (req, res) => {
    const pending = await accounts.findChallenge(req.body?.recoveryToken, 'account_recovery');
    const account = pending ? await accounts.findAccount(pending.username) : null;
    const invalid = () => res.status(400).json({ error: '账号恢复凭据无效或已过期。', code: 'ACCOUNT_RECOVERY_INVALID' });
    if (!account?.active || account.id !== pending.challenge.accountId || (account.authVersion || 0) !== pending.challenge.authVersion) return invalid();
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 15 || newPassword.length > 256) return res.status(400).json({ error: '新密码长度需要在 15 到 256 个字符之间。', code: 'INVALID_PASSWORD' });
    const passwordHash = await createPasswordHash(newPassword);
    if (!await accounts.consumeChallenge(req.body.recoveryToken, 'account_recovery', account.username)) return invalid();
    if (!await accounts.resetCredentials(account.username, pending.challenge.authVersion, passwordHash)) return invalid();
    await app.locals.revokeConsoleSessions({ subject: account.username });
    await risk.recordSuccess({ username: account.username, ip: req.ip });
    await recordAudit(req, { actor: account.username, action: 'security.account_recovered', targetType: 'account', targetId: account.username });
    return res.json({ recovered: true, username: account.username, mfaEnrollmentRequired: Boolean(config.requireMfa) });
  });

  app.post('/api/auth/passkey/options', loginLimiter, requireConsoleRequest, async (req, res) => {
    const deviceProof = await nativeLoginProof(req);
    const username = String(req.body?.username || '').trim();
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    if (riskState.challengeRequired) {
      const challenge = await verifyTurnstileToken({
        token: req.body?.challengeToken,
        secretKey: config.turnstileSecretKey,
        remoteIp: req.ip,
        expectedHostname: publicUrl.hostname,
        fetchImpl,
      });
      if (!challenge.valid) {
        return res.status(401).json({
          error: '请先完成人机验证。',
          code: 'BOT_CHALLENGE_REQUIRED',
          details: { challengeRequired: true, turnstileSiteKey: config.turnstileSiteKey },
        });
      }
    }
    const result = await passkeys.authenticationOptions(username, { binding: deviceProof?.thumbprint || '' });
    if (!result) {
      await recordLoginFailure(req, username, 'passkey_unavailable');
      return res.status(400).json({ error: '该账号没有可用的 Passkey。', code: 'PASSKEY_UNAVAILABLE' });
    }
    return res.json(result);
  });

  app.post('/api/auth/passkey/verify', loginLimiter, requireConsoleRequest, async (req, res) => {
    const deviceProof = await nativeLoginProof(req);
    const requestedUsername = String(req.body?.username || '').trim();
    const riskState = await risk.assess({ username: requestedUsername, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    try {
      const verification = await passkeys.verifyAuthentication(requestedUsername, req.body, { binding: deviceProof?.thumbprint || '' });
      const username = verification.username || requestedUsername;
      const account = verification.verified ? await accounts.findAccount(username) : null;
      if (!verification.verified || !account?.active || verification.accountId !== account.id || verification.authVersion !== (account.authVersion || 0)) {
        return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_passkey'));
      }
      return issueAuthenticatedSession(req, res, account, 'passkey');
    } catch {
      return sendRiskResponse(res, await recordLoginFailure(req, requestedUsername, 'invalid_passkey'));
    }
  });

  return { loginLimiter, qrCreateLimiter, webLoginLimiter, qrApprovalLimiter };
}

export function registerLogoutRoute(app, {
  clearSessionCookies,
  config,
  readSession,
  readSessionToken,
  recordAudit,
  requireConsoleRequest,
}) {
  app.post('/api/auth/logout', requireConsoleRequest, async (req, res) => {
    const token = readSessionToken(req);
    const session = await readSession(req);
    if (session) await app.locals.revokeConsoleSessions({ subject: session.sub, nonce: session.nonce });
    await app.locals.onConsoleSessionRevoked(token);
    clearSessionCookies(res, config);
    await recordAudit(req, {
      actor: session?.sub || 'anonymous',
      action: 'auth.logout',
      targetType: 'session',
      targetId: session?.nonce || '',
    });
    res.json({ authenticated: false });
  });
}

export function registerReauthenticationRoutes(app, {
  loginLimiter,
  passkeys,
  readSessionToken,
  recordAudit,
  requireConsoleRequest,
  sessions,
  verifyReauthentication,
}) {
  app.post('/api/auth/reauth/passkey/options', loginLimiter, requireConsoleRequest, async (req, res) => {
    const result = await passkeys.authenticationOptions(req.consoleUser.username, { purpose: 'reauthentication', sessionNonce: req.consoleSession.nonce });
    if (!result) return res.status(400).json({ error: '当前账号没有可用的 Passkey。', code: 'PASSKEY_UNAVAILABLE' });
    return res.json(result);
  });

  app.post('/api/auth/reauth/passkey/verify', loginLimiter, requireConsoleRequest, async (req, res) => {
    try {
      const result = await passkeys.verifyAuthentication(req.consoleUser.username, req.body, { purpose: 'reauthentication', sessionNonce: req.consoleSession.nonce });
      if (!result.verified) return res.status(403).json({ error: 'Passkey 二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      const expiresAt = await sessions.markReauthenticated(readSessionToken(req));
      if (!expiresAt) return res.status(401).json({ error: '登录会话已失效。', code: 'UNAUTHORIZED' });
      await app.locals.onConsoleSessionChanged(readSessionToken(req));
      await recordAudit(req, { action: 'auth.reauthenticate', targetType: 'account', targetId: req.consoleUser.username, details: { method: 'passkey' } });
      return res.json({ reauthenticated: true, expiresAt: new Date(expiresAt * 1000).toISOString() });
    } catch {
      return res.status(403).json({ error: 'Passkey 二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
    }
  });

  app.post('/api/auth/reauth', loginLimiter, requireConsoleRequest, async (req, res) => {
    // Extending the elevated window always requires a fresh factor, including after Passkey authentication.
    if (!await verifyReauthentication(req, { allowRecent: false })) {
      await recordAudit(req, {
        action: 'auth.reauthenticate',
        outcome: 'failure',
        targetType: 'session',
        targetId: req.consoleSession?.nonce || '',
        details: { reason: 'invalid_credentials' },
      });
      return res.status(403).json({ error: '管理员二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
    }
    const sessionToken = readSessionToken(req);
    const expiresAt = await sessions.markReauthenticated(sessionToken);
    if (!expiresAt) {
      return res.status(401).json({ error: '当前会话已失效。', code: 'UNAUTHORIZED' });
    }
    await app.locals.onConsoleSessionChanged(sessionToken);
    await recordAudit(req, {
      action: 'auth.reauthenticate',
      targetType: 'session',
      targetId: req.consoleSession?.nonce || '',
    });
    return res.json({ reauthenticated: true, expiresAt: new Date(expiresAt * 1000).toISOString() });
  });
}
