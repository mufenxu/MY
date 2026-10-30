import { DeviceSecurityError } from '../native-device-security.js';
import QRCode from 'qrcode';

export function registerQrLoginRoutes(app, {
  URLSearchParams,
  accounts,
  browserQrResponse,
  clearQrBrowserVerifier,
  config,
  isAndroidAppRequest,
  issueAuthenticatedSession,
  nativeLoginProof,
  publicUrl,
  qrApprovalLimiter,
  qrCreateLimiter,
  qrLoginCookieName,
  qrLoginCookieOptions,
  qrLogins,
  readQrBrowserVerifier,
  requestDeviceId,
  requireConsoleRequest,
  strongFactorEnabled,
  validQrRequestId,
}) {
  app.post('/api/auth/qr/requests', qrCreateLimiter, requireConsoleRequest, async (req, res, next) => {
    if (config.authDisabled) {
      return res.status(400).json({ error: '本地免登录模式不需要扫码登录。', code: 'QR_LOGIN_DISABLED' });
    }
    try {
      const clientKind = String(req.body?.clientKind || 'browser');
      const androidRequester = clientKind === 'android';
      if (!['browser', 'android'].includes(clientKind)) {
        return res.status(400).json({ error: '二维码请求来源无效。', code: 'QR_LOGIN_INVALID_CLIENT' });
      }
      if (androidRequester && !isAndroidAppRequest(req)) {
        return res.status(403).json({ error: 'Android 登录二维码仅允许官方 App 创建。', code: 'QR_LOGIN_INVALID_CLIENT' });
      }
      if (androidRequester && String(req.body?.confirmationMethod || 'passkey') !== 'passkey') {
        return res.status(400).json({ error: '二维码确认方式无效。', code: 'QR_LOGIN_INVALID_CONFIRMATION' });
      }
      if (androidRequester && (config.androidAppCertFingerprints || []).length === 0) {
        return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
      }
      const requesterDeviceId = androidRequester ? requestDeviceId(req) : '';
      if (androidRequester && !requesterDeviceId) {
        return res.status(400).json({ error: 'Android 登录二维码缺少设备标识。', code: 'QR_LOGIN_DEVICE_MISSING' });
      }
      const deviceProof = androidRequester ? await nativeLoginProof(req) : null;
      const created = await qrLogins.create({
        browserIp: req.ip,
        browserUserAgent: req.get('user-agent'),
        clientKind,
        requesterDeviceId,
        requesterKeyThumbprint: deviceProof?.thumbprint || '',
      });
      const loginUrl = new URL('/app/qr-login', publicUrl.origin);
      loginUrl.searchParams.set('requestId', created.requestId);
      loginUrl.hash = new URLSearchParams({ scanToken: created.scanToken }).toString();
      const responseBody = {
        ...browserQrResponse(created.record),
        clientKind,
        qrDataUrl: await QRCode.toDataURL(loginUrl.toString(), {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
        }),
      };
      if (androidRequester) {
        responseBody.requesterVerifier = created.browserVerifier;
      } else {
        res.cookie(
          qrLoginCookieName(config, created.requestId),
          created.browserVerifier,
          qrLoginCookieOptions(config),
        );
      }
      return res.status(201).json(responseBody);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/auth/qr/requests/:id', async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForBrowser(requestId, readQrBrowserVerifier(req, requestId));
    if (!record) return res.status(410).json({ error: '二维码已过期，请刷新后重试。', code: 'QR_LOGIN_EXPIRED' });
    return res.json(browserQrResponse(record));
  });

  app.post('/api/auth/qr/requests/:id/status', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const requesterVerifier = String(req.body?.requesterVerifier || '');
    const record = await qrLogins.getForRequester(requestId, requesterVerifier, requestDeviceId(req));
    if (!record) return res.status(410).json({ error: '二维码已过期，请重新发起登录。', code: 'QR_LOGIN_EXPIRED' });
    const deviceProof = await nativeLoginProof(req);
    if ((record.requesterKeyThumbprint || '') !== (deviceProof?.thumbprint || '')) {
      throw new DeviceSecurityError('DEVICE_KEY_MISMATCH', '二维码登录请求与当前设备不匹配。');
    }
    return res.json(browserQrResponse(record));
  });

  app.post('/api/auth/qr/requests/:id/consume', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const requesterVerifier = String(req.body?.requesterVerifier || '');
    let record = await qrLogins.getForRequester(requestId, requesterVerifier, requestDeviceId(req));
    const androidRequester = Boolean(record);
    const browserVerifier = androidRequester ? requesterVerifier : readQrBrowserVerifier(req, requestId);
    if (!record) record = await qrLogins.getForBrowser(requestId, browserVerifier);
    if (!record) return res.status(410).json({ error: '二维码已过期，请刷新后重试。', code: 'QR_LOGIN_EXPIRED' });
    if (androidRequester) {
      const deviceProof = await nativeLoginProof(req);
      if ((record.requesterKeyThumbprint || '') !== (deviceProof?.thumbprint || '')) {
        throw new DeviceSecurityError('DEVICE_KEY_MISMATCH', '二维码登录请求与当前设备不匹配。');
      }
    }
    if (record.status !== 'approved') {
      return res.status(409).json({ error: 'App 尚未完成登录确认。', code: 'QR_LOGIN_NOT_APPROVED', details: { status: record.status } });
    }
    const account = await accounts.findAccount(record.approvedBy);
    if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
      return res.status(403).json({ error: '批准账号当前不可用于登录。', code: 'QR_LOGIN_ACCOUNT_UNAVAILABLE' });
    }
    const consumed = await qrLogins.consume(
      requestId,
      browserVerifier,
      androidRequester ? requestDeviceId(req) : '',
    );
    if (!consumed) return res.status(409).json({ error: '二维码已被使用。', code: 'QR_LOGIN_ALREADY_USED' });
    if (!androidRequester) clearQrBrowserVerifier(res, requestId);
    const authenticationMethod = androidRequester
      ? `qr_android_${consumed.confirmationMethod || 'biometric'}`
      : `qr_app_${consumed.confirmationMethod || 'biometric'}`;
    return issueAuthenticatedSession(req, res, account, authenticationMethod);
  });

  app.delete('/api/auth/qr/requests/:id', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const cancelled = await qrLogins.cancel(requestId, readQrBrowserVerifier(req, requestId));
    clearQrBrowserVerifier(res, requestId);
    return res.json({ cancelled: Boolean(cancelled) });
  });
}

export function registerQrApprovalRoutes(app, {
  appQrResponse,
  config,
  passkeys,
  qrApprovalLimiter,
  qrLogins,
  recordAudit,
  requireConsoleRequest,
  userAgentLabel,
  validQrRequestId,
}) {
  app.post('/api/auth/qr/requests/:id/scan', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    const scanToken = String(req.body?.scanToken || '');
    if (!requestId || scanToken.length < 32 || scanToken.length > 128) {
      return res.status(400).json({ error: '二维码内容无效。', code: 'QR_LOGIN_INVALID' });
    }
    const record = await qrLogins.scan(requestId, scanToken, req.consoleUser.username);
    if (!record) return res.status(410).json({ error: '二维码已失效或已由其他账号扫描。', code: 'QR_LOGIN_UNAVAILABLE' });
    await recordAudit(req, {
      action: 'auth.qr_scan',
      targetType: 'qr_login',
      targetId: requestId,
      details: { browserIp: record.browserIp, browser: userAgentLabel(record.browserUserAgent) },
    });
    return res.json(appQrResponse(record, req.consoleUser.role));
  });

  app.post('/api/auth/qr/requests/:id/passkey/options', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForActor(requestId, req.consoleUser.username);
    if (!record || record.status !== 'scanned') {
      return res.status(409).json({ error: '扫码请求当前不可确认。', code: 'QR_LOGIN_NOT_SCANNED' });
    }
    if ((config.androidAppCertFingerprints || []).length === 0) {
      return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
    }
    const result = await passkeys.authenticationOptions(req.consoleUser.username, {
      purpose: 'qr_approval', sessionNonce: req.consoleSession.nonce, binding: requestId,
    });
    if (!result) {
      return res.status(403).json({ error: '请先绑定 Passkey，再使用扫码批准登录。', code: 'QR_PASSKEY_REQUIRED' });
    }
    return res.json(result);
  });

  app.post('/api/auth/qr/requests/:id/approve', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForActor(requestId, req.consoleUser.username);
    if (!record || record.status !== 'scanned') {
      return res.status(409).json({ error: '扫码请求当前不可确认。', code: 'QR_LOGIN_NOT_SCANNED' });
    }

    const confirmationMethod = 'passkey';
    if ((config.androidAppCertFingerprints || []).length === 0) {
      return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
    }
    try {
      const verification = await passkeys.verifyAuthentication(req.consoleUser.username, req.body?.passkey, {
        purpose: 'qr_approval', sessionNonce: req.consoleSession.nonce, binding: requestId,
      });
      if (!verification.verified) throw new Error('Passkey verification failed.');
    } catch {
      await recordAudit(req, {
        action: 'auth.qr_approve',
        outcome: 'failure',
        targetType: 'qr_login',
        targetId: requestId,
        details: { reason: 'invalid_passkey' },
      });
      return res.status(403).json({ error: 'Passkey 验证失败，未批准网页登录。', code: 'QR_PASSKEY_INVALID' });
    }

    const approved = await qrLogins.approve(requestId, req.consoleUser.username, confirmationMethod);
    if (!approved) return res.status(409).json({ error: '扫码请求状态已变化，请重新扫描。', code: 'QR_LOGIN_STATE_CHANGED' });
    await recordAudit(req, {
      action: 'auth.qr_approve',
      targetType: 'qr_login',
      targetId: requestId,
      details: { confirmationMethod, browserIp: approved.browserIp, browser: userAgentLabel(approved.browserUserAgent) },
    });
    return res.json({ approved: true, ...appQrResponse(approved, req.consoleUser.role) });
  });

  app.post('/api/auth/qr/requests/:id/reject', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const rejected = await qrLogins.reject(requestId, req.consoleUser.username);
    if (!rejected) return res.status(409).json({ error: '扫码请求状态已变化。', code: 'QR_LOGIN_STATE_CHANGED' });
    await recordAudit(req, {
      action: 'auth.qr_reject',
      targetType: 'qr_login',
      targetId: requestId,
    });
    return res.json({ rejected: true });
  });
}
