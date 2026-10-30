import { renderAppLoginErrorHtml, renderAppLoginTransitionHtml } from '../app-login-pages.js';

export function registerWebLoginRoutes(app, {
  accounts,
  config,
  isAndroidAppRequest,
  issueSessionCookie,
  normalizeWebLoginRedirect,
  publicUrl,
  readSession,
  recordAudit,
  requireConsoleRequest,
  sessions,
  strongFactorEnabled,
  webLoginLimiter,
  webLoginTickets,
}) {
  app.post('/api/auth/web-login-tickets', webLoginLimiter, requireConsoleRequest, async (req, res, next) => {
    if (config.authDisabled) {
      return res.status(400).json({ error: 'Web login tickets are disabled in local bypass mode.', code: 'WEB_LOGIN_DISABLED' });
    }
    if (!isAndroidAppRequest(req)) {
      return res.status(403).json({ error: 'Web login tickets can only be created by the Android app.', code: 'WEB_LOGIN_ANDROID_REQUIRED' });
    }
    try {
      const session = await readSession(req);
      if (!session) return res.status(401).json({ error: 'Please sign in first.', code: 'UNAUTHORIZED' });
      const account = await accounts.findAccount(session.sub);
      if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
        return res.status(403).json({ error: 'Current account cannot create web login tickets.', code: 'WEB_LOGIN_ACCOUNT_UNAVAILABLE' });
      }
      const redirect = normalizeWebLoginRedirect(req.body?.redirect, publicUrl);
      if (!redirect) {
        return res.status(400).json({ error: 'Web login redirect is invalid.', code: 'WEB_LOGIN_REDIRECT_INVALID' });
      }
      const created = await webLoginTickets.create({
        username: account.username,
        role: account.role,
        redirect,
        appSessionNonce: session.nonce,
        appIp: req.ip,
        appUserAgent: req.get('user-agent'),
      });
      const loginUrl = new URL('/console/app-login', publicUrl.origin);
      loginUrl.searchParams.set('ticket', created.ticket);
      loginUrl.searchParams.set('redirect', redirect);
      await recordAudit(req, {
        actor: account.username,
        action: 'auth.web_login_ticket.create',
        targetType: 'session',
        targetId: session.nonce || '',
        details: { redirect },
      });
      return res.status(201).json({
        loginUrl: loginUrl.toString(),
        redirect,
        expiresAt: created.record.expiresAt,
      });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/app-login', webLoginLimiter, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'");
    const ticket = String(req.query?.ticket || '');
    const requestedRedirect = normalizeWebLoginRedirect(req.query?.redirect, publicUrl);
    if (!ticket || !requestedRedirect) {
      return res.status(400).send(renderAppLoginErrorHtml('链接无效', '免密登录链接不完整或已失效。'));
    }
    try {
      const consumed = await webLoginTickets.consume(ticket);
      if (!consumed) {
        return res.status(410).send(renderAppLoginErrorHtml('登录凭据已过期', '该免密登录凭据已过期或已被使用，请返回安卓 App 重新打开。'));
      }
      if (consumed.redirect !== requestedRedirect) {
        return res.status(400).send(renderAppLoginErrorHtml('跳转目标无效', '安全重定向目标校验失败。'));
      }
      if (!await sessions.isActive({ nonce: consumed.appSessionNonce, subject: consumed.username })) {
        return res.status(410).send(renderAppLoginErrorHtml('来源会话已失效', '原登录设备已退出或会话已撤销，请重新登录后再打开。'));
      }
      const account = await accounts.findAccount(consumed.username);
      if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
        return res.status(403).send(renderAppLoginErrorHtml('无权访问', '当前账号已被禁用或尚未满足多因素认证要求。'));
      }
      const embeddedWebSession = consumed.sessionKind === 'embedded_web';
      await issueSessionCookie(req, res, account, 'android_web_ticket', embeddedWebSession ? {
        policy: { ttlHours: 0.25, idleMinutes: Math.min(config.sessionIdleMinutes, 5) },
        sessionKind: 'embedded_web',
        parentSessionNonce: consumed.appSessionNonce,
        replaceExisting: true,
      } : { policy: { ttlHours: 0.25, idleMinutes: 5 }, sessionKind: 'browser', parentSessionNonce: consumed.appSessionNonce });
      await recordAudit(req, {
        actor: account.username,
        action: 'auth.web_login_ticket.consume',
        targetType: 'account',
        targetId: account.username,
        details: { redirect: consumed.redirect },
      });
      if (req.query?.direct === '1' || req.get('x-direct-redirect') === '1') {
        return res.redirect(303, consumed.redirect);
      }
      res.setHeader('Location', consumed.redirect);
      return res.send(renderAppLoginTransitionHtml(consumed.redirect));
    } catch (error) {
      next(error);
      return undefined;
    }
  });
}
