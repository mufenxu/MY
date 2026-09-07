import express from 'express';
import rateLimit from 'express-rate-limit';
import { oauthError, pkceChallenge, verifyPkceChallenge } from '../external-identity.js';
import { roleCanAccessExternalApplication } from '../external-application-service.js';

export function registerOAuthRoutes(app, {
  accounts,
  config,
  externalApplications,
  externalIdentity,
  readExternalPrincipal,
  readOAuthClientCredentials,
  recordAudit,
  renderAppLoginErrorHtml,
  sessions,
}) {
  app.get('/.well-known/openid-configuration', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json(externalIdentity.discovery());
  });

  app.get('/oauth/jwks.json', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json(externalIdentity.jwks());
  });

  const oauthTokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.externalAuthTokenRateLimitPerMinute || 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(429).json(oauthError('temporarily_unavailable', '令牌请求过于频繁，请稍后重试。'));
    },
  });

  app.get('/oauth/authorize', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const clientId = String(req.query?.client_id || '');
    const redirectUri = String(req.query?.redirect_uri || '');
    const responseType = String(req.query?.response_type || '');
    const state = String(req.query?.state || '');
    const nonce = String(req.query?.nonce || '');
    const codeChallenge = String(req.query?.code_challenge || '');
    const codeChallengeMethod = String(req.query?.code_challenge_method || '');
    const requestedScopes = String(req.query?.scope || '').split(/\s+/).filter(Boolean);
    try {
      const application = await externalApplications.findApplicationByClientId(clientId);
      if (!application?.enabled || !application.redirectUris.includes(redirectUri)) {
        return res.status(400).send(renderAppLoginErrorHtml('授权请求无效', '客户端或回调地址未注册。'));
      }
      const allowedScopes = new Set(['openid', 'profile', 'roles']);
      if (
        responseType !== 'code'
        || !state
        || state.length > 512
        || !nonce
        || nonce.length > 256
        || !requestedScopes.includes('openid')
        || requestedScopes.some((scope) => !allowedScopes.has(scope))
        || codeChallengeMethod !== 'S256'
        || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
      ) {
        const callback = new URL(redirectUri);
        callback.searchParams.set('error', 'invalid_request');
        callback.searchParams.set('error_description', '授权参数无效。');
        callback.searchParams.set('state', state);
        return res.redirect(303, callback.toString());
      }
      const principal = await readExternalPrincipal(req);
      if (!principal) {
        const returnTo = `${req.path}?${new URLSearchParams(req.query).toString()}`;
        return res.redirect(302, `/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
      if (!roleCanAccessExternalApplication(principal.account.role, application)) {
        await recordAudit(req, {
          actor: principal.account.username,
          action: 'external_auth.authorize',
          outcome: 'failure',
          targetType: 'external_application',
          targetId: application.id,
          details: { reason: 'insufficient_role', clientId },
        });
        const callback = new URL(redirectUri);
        callback.searchParams.set('error', 'access_denied');
        callback.searchParams.set('error_description', '当前账号无权访问该应用。');
        callback.searchParams.set('state', state);
        return res.redirect(303, callback.toString());
      }
      const issued = await externalApplications.createAuthorizationCode({
        clientId,
        redirectUri,
        username: principal.account.username,
        role: principal.account.role,
        scope: requestedScopes.join(' '),
        nonce,
        codeChallenge,
        sessionNonce: principal.session.nonce,
      });
      await recordAudit(req, {
        actor: principal.account.username,
        action: 'external_auth.authorize',
        targetType: 'external_application',
        targetId: application.id,
        details: { clientId, scope: requestedScopes },
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', issued.code);
      callback.searchParams.set('state', state);
      return res.redirect(303, callback.toString());
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/oauth/token', oauthTokenLimiter, express.urlencoded({ extended: false, limit: '16kb' }), async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const credentials = readOAuthClientCredentials(req);
    try {
      const application = await externalApplications.findApplicationByClientId(credentials.clientId);
      const validClient = application?.enabled
        && await externalApplications.verifyClientSecret(credentials.clientId, credentials.clientSecret);
      if (!validClient) {
        await recordAudit(req, {
          action: 'external_auth.token',
          outcome: 'failure',
          targetType: 'external_application',
          targetId: application?.id || '',
          details: {
            reason: 'invalid_client',
            clientId: String(credentials.clientId || '').slice(0, 128),
          },
        });
        res.setHeader('WWW-Authenticate', 'Basic realm="MY External Identity"');
        return res.status(401).json(oauthError('invalid_client', '客户端认证失败。'));
      }
      if (req.body?.grant_type !== 'authorization_code') {
        return res.status(400).json(oauthError('unsupported_grant_type', '仅支持 authorization_code。'));
      }
      const codeVerifier = String(req.body?.code_verifier || '');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
        return res.status(400).json(oauthError('invalid_grant', '授权码无效、已过期或 PKCE 校验失败。'));
      }
      const code = await externalApplications.consumeAuthorizationCode({
        code: req.body?.code,
        clientId: credentials.clientId,
        redirectUri: req.body?.redirect_uri,
        codeChallenge: pkceChallenge(codeVerifier),
      });
      if (!code || !verifyPkceChallenge(codeVerifier, code.codeChallenge)) {
        await recordAudit(req, {
          action: 'external_auth.token',
          outcome: 'failure',
          targetType: 'external_application',
          targetId: application.id,
          details: { reason: 'invalid_grant', clientId: credentials.clientId },
        });
        return res.status(400).json(oauthError('invalid_grant', '授权码无效、已过期或 PKCE 校验失败。'));
      }
      const currentAccount = config.authDisabled
        ? { username: code.username, role: code.role, active: true }
        : await accounts.findAccount(code.username);
      const sessionActive = config.authDisabled || await sessions.isActive({
        nonce: code.sessionNonce,
        subject: code.username,
      });
      if (
        !sessionActive
        || !currentAccount?.active
        || !roleCanAccessExternalApplication(currentAccount.role, application)
      ) {
        await recordAudit(req, {
          actor: code.username,
          action: 'external_auth.token',
          outcome: 'failure',
          targetType: 'external_application',
          targetId: application.id,
          details: { reason: 'authorization_context_invalid', clientId: credentials.clientId },
        });
        return res.status(400).json(oauthError('invalid_grant', '授权上下文已失效，请重新登录。'));
      }
      const tokens = externalIdentity.issueTokens({
        clientId: credentials.clientId,
        username: code.username,
        role: currentAccount.role,
        scope: code.scope,
        nonce: code.nonce,
      });
      await recordAudit(req, {
        actor: code.username,
        action: 'external_auth.token',
        targetType: 'external_application',
        targetId: application.id,
        details: { clientId: credentials.clientId, scope: code.scope },
      });
      return res.json(tokens);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/oauth/userinfo', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authorization = String(req.get('authorization') || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const claims = externalIdentity.verifyToken(token, { type: 'access' });
    const application = claims ? await externalApplications.findApplicationByClientId(claims.aud) : null;
    if (!claims || !application?.enabled) {
      return res.status(401).json(oauthError('invalid_grant', '访问令牌无效或已过期。'));
    }
    return res.json({
      sub: claims.sub,
      preferred_username: claims.preferred_username,
      role: claims.role,
    });
  });

  app.get('/oauth/external-launch/:id', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [application, principal] = await Promise.all([
        externalApplications.getApplication(req.params.id),
        readExternalPrincipal(req),
      ]);
      if (!principal) {
        const returnTo = encodeURIComponent(`/oauth/external-launch/${encodeURIComponent(req.params.id)}`);
        return res.redirect(302, `/console?returnTo=${returnTo}`);
      }
      if (!application?.enabled) return res.status(404).send(renderAppLoginErrorHtml('应用不可用', '外部应用不存在或已经停用。'));
      if (!roleCanAccessExternalApplication(principal.account.role, application)) {
        return res.status(403).send(renderAppLoginErrorHtml('无权访问', '当前账号没有进入该应用的权限。'));
      }
      await recordAudit(req, {
        actor: principal.account.username,
        action: 'external_application.launch',
        targetType: 'external_application',
        targetId: application.id,
      });
      return res.redirect(303, application.launchUrl);
    } catch (error) {
      next(error);
      return undefined;
    }
  });
}
