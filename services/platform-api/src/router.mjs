import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import httpProxy from 'http-proxy';
import { PLATFORM_SSO_HEADER, issueInternalIdentity } from './internal-auth.mjs';

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/:\d+$/, '');
}

function parseHosts(value) {
  return new Set(String(value || '').split(',').map(normalizeHost).filter(Boolean));
}

function pathWithQuery(pathname, search) {
  return `${pathname || '/'}${search || ''}`;
}

function rewriteServicePrefix(req, prefix, { apiByDefault = false, preserve = [] } = {}) {
  const requestUrl = new URL(req.url || '/', 'http://platform.internal');
  let pathname = requestUrl.pathname.slice(prefix.length) || '/';

  if (apiByDefault) {
    const preserved = ['/api', '/health', '/healthz', '/version', '/ws', '/favicon', ...preserve];
    if (!preserved.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`))) {
      pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    }
  }

  req.url = pathWithQuery(pathname, requestUrl.search);
  return pathname;
}

function writeProxyError(res, error) {
  if (!res || res.headersSent || res.destroyed) return;
  res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: '内部服务暂不可用。', code: 'UPSTREAM_UNAVAILABLE' }));
  console.error('Platform proxy error:', error.message);
}

function isDocumentRequest(req, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (pathname.includes('.')) return false;
  return String(req.headers.accept || '').includes('text/html')
    || req.headers['sec-fetch-dest'] === 'document';
}

function rejectUnauthenticated(req, res, pathname) {
  if (isDocumentRequest(req, pathname)) {
    const returnTo = encodeURIComponent(pathWithQuery(pathname, new URL(req.url || '/', 'http://platform.internal').search));
    res.writeHead(302, { Location: `/?returnTo=${returnTo}`, 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: '统一登录会话已失效，请重新登录。', code: 'PLATFORM_SESSION_REQUIRED' }));
}

function requestOrigin(req) {
  const value = req.headers.origin || req.headers.referer || '';
  if (!value) return '';
  try { return new URL(String(value)).origin; } catch { return 'invalid'; }
}

function managedWriteAllowed(req, platformPublicOrigin) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase())) return true;
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;
  return Boolean(platformPublicOrigin) && requestOrigin(req) === platformPublicOrigin;
}

function managedSocketAllowed(req, platformPublicOrigin) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;
  return Boolean(platformPublicOrigin) && requestOrigin(req) === platformPublicOrigin;
}

function rejectCrossSiteWrite(res) {
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: '跨站管理请求已被拒绝。', code: 'PLATFORM_CSRF_REJECTED' }));
}

export function createCoreWebApp({ coreApp, staticPath }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
      + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    next();
  });
  app.use((req, res, next) => {
    if (/^\/(api(?:\/|$)|uploads(?:\/|$)|public(?:\/|$)|health$)/.test(req.path)) {
      return coreApp(req, res);
    }
    return next();
  });

  if (staticPath && fs.existsSync(staticPath)) {
    app.use(express.static(staticPath, {
      index: false,
      maxAge: '1y',
      immutable: true,
      dotfiles: 'deny',
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        if (filePath.endsWith('.html') || filePath.endsWith('version.json')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get('*splat', (req, res, next) => {
      if (!req.accepts('html') || req.path.includes('.')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: '页面不存在。', code: 'NOT_FOUND' });
  });
  return app;
}

export function createPlatformRouter({
  portalApp,
  coreApp,
  examApp,
  notifyApp,
  campusTarget,
  mqttTarget,
  coreHosts = '',
  examHosts = '',
  notifyHosts = '',
  campusHosts = '',
  mqttHosts = '',
  getPlatformSession = () => null,
  internalAuthPrivateKey = '',
  platformPublicOrigin = '',
}) {
  const hostSets = {
    core: parseHosts(coreHosts),
    exam: parseHosts(examHosts),
    notify: parseHosts(notifyHosts),
    campus: parseHosts(campusHosts),
    mqtt: parseHosts(mqttHosts),
  };
  const proxy = httpProxy.createProxyServer({ xfwd: true, ws: true });
  proxy.on('error', (error, req, res) => writeProxyError(res, error));

  function proxyRequest(req, res, target) {
    if (!target) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '内部服务未配置。', code: 'UPSTREAM_NOT_CONFIGURED' }));
      return;
    }
    proxy.web(req, res, { target });
  }

  async function authorizeManagedApp(req, res, service, prefix) {
    const session = await getPlatformSession(req);
    if (!session) {
      rejectUnauthenticated(req, res, new URL(req.url || '/', 'http://platform.internal').pathname);
      return false;
    }
    if (!managedWriteAllowed(req, platformPublicOrigin)) {
      rejectCrossSiteWrite(res);
      return false;
    }
    rewriteServicePrefix(req, prefix);
    const rewrittenUrl = new URL(req.url || '/', 'http://platform.internal');
    req.headers[PLATFORM_SSO_HEADER] = issueInternalIdentity({
      audience: service,
      session,
      privateKey: internalAuthPrivateKey,
      method: req.method,
      pathname: pathWithQuery(rewrittenUrl.pathname, rewrittenUrl.search),
    });
    return true;
  }

  async function handler(req, res) {
    // 外部请求永远不能自行传入内部身份票据。
    delete req.headers[PLATFORM_SSO_HEADER];
    const requestId = crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');

    if (hostSets.core.has(host)) return coreApp(req, res);
    if (hostSets.exam.has(host)) return examApp(req, res);
    if (hostSets.notify.has(host)) return notifyApp(req, res);
    if (hostSets.campus.has(host)) return proxyRequest(req, res, campusTarget);
    if (hostSets.mqtt.has(host)) return proxyRequest(req, res, mqttTarget);

    if (['/apps/core', '/apps/exam', '/apps/campus', '/apps/iot'].includes(requestUrl.pathname)) {
      res.writeHead(308, {
        Location: `${requestUrl.pathname}/${requestUrl.search}`,
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    if (requestUrl.pathname.startsWith('/apps/core/')) {
      if (!await authorizeManagedApp(req, res, 'core', '/apps/core')) return;
      return coreApp(req, res);
    }
    if (requestUrl.pathname.startsWith('/apps/exam/')) {
      if (!await authorizeManagedApp(req, res, 'exam', '/apps/exam')) return;
      return examApp(req, res);
    }
    if (requestUrl.pathname.startsWith('/apps/campus/')) {
      if (!await authorizeManagedApp(req, res, 'campus', '/apps/campus')) return;
      return proxyRequest(req, res, campusTarget);
    }
    if (requestUrl.pathname.startsWith('/apps/iot/')) {
      if (!await authorizeManagedApp(req, res, 'iot', '/apps/iot')) return;
      return proxyRequest(req, res, mqttTarget);
    }

    if (requestUrl.pathname === '/api/core' || requestUrl.pathname.startsWith('/api/core/')) {
      rewriteServicePrefix(req, '/api/core', { apiByDefault: true, preserve: ['/uploads', '/public'] });
      return coreApp(req, res);
    }
    if (requestUrl.pathname === '/api/exam' || requestUrl.pathname.startsWith('/api/exam/')) {
      rewriteServicePrefix(req, '/api/exam', { apiByDefault: true });
      return examApp(req, res);
    }
    if (requestUrl.pathname === '/api/notify' || requestUrl.pathname.startsWith('/api/notify/')) {
      rewriteServicePrefix(req, '/api/notify');
      return notifyApp(req, res);
    }
    if (requestUrl.pathname === '/api/campus' || requestUrl.pathname.startsWith('/api/campus/')) {
      rewriteServicePrefix(req, '/api/campus', { apiByDefault: true });
      return proxyRequest(req, res, campusTarget);
    }
    if (requestUrl.pathname === '/api/iot' || requestUrl.pathname.startsWith('/api/iot/')) {
      rewriteServicePrefix(req, '/api/iot', { apiByDefault: true, preserve: ['/api-docs'] });
      return proxyRequest(req, res, mqttTarget);
    }

    if (requestUrl.pathname === '/core' || requestUrl.pathname.startsWith('/core/')) {
      rewriteServicePrefix(req, '/core', { apiByDefault: true, preserve: ['/uploads', '/public'] });
      return coreApp(req, res);
    }
    if (requestUrl.pathname === '/exam' || requestUrl.pathname.startsWith('/exam/')) {
      rewriteServicePrefix(req, '/exam', { apiByDefault: true });
      return examApp(req, res);
    }
    if (requestUrl.pathname === '/notify-service' || requestUrl.pathname.startsWith('/notify-service/')) {
      rewriteServicePrefix(req, '/notify-service');
      return notifyApp(req, res);
    }
    if (requestUrl.pathname === '/campus' || requestUrl.pathname.startsWith('/campus/')) {
      rewriteServicePrefix(req, '/campus', { apiByDefault: true });
      return proxyRequest(req, res, campusTarget);
    }
    if (requestUrl.pathname === '/iot' || requestUrl.pathname.startsWith('/iot/')) {
      rewriteServicePrefix(req, '/iot', { apiByDefault: true });
      return proxyRequest(req, res, mqttTarget);
    }

    return portalApp(req, res);
  }

  async function handleUpgrade(req, socket, head) {
    delete req.headers[PLATFORM_SSO_HEADER];
    req.headers['x-request-id'] = crypto.randomUUID();
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');
    if (hostSets.mqtt.has(host)) {
      if (!mqttTarget) return socket.destroy();
      return proxy.ws(req, socket, head, { target: mqttTarget });
    }
    if (requestUrl.pathname === '/apps/iot/ws' || requestUrl.pathname.startsWith('/apps/iot/ws/')) {
      const session = await getPlatformSession(req);
      if (
        !session
        || !mqttTarget
        || !internalAuthPrivateKey
        || !managedSocketAllowed(req, platformPublicOrigin)
      ) return socket.destroy();
      rewriteServicePrefix(req, '/apps/iot');
      req.headers[PLATFORM_SSO_HEADER] = issueInternalIdentity({
        audience: 'iot',
        session,
        privateKey: internalAuthPrivateKey,
        method: req.method,
        pathname: pathWithQuery(
          new URL(req.url || '/', 'http://platform.internal').pathname,
          new URL(req.url || '/', 'http://platform.internal').search,
        ),
      });
      return proxy.ws(req, socket, head, { target: mqttTarget });
    }
    if (requestUrl.pathname === '/iot/ws' || requestUrl.pathname.startsWith('/iot/ws/')) {
      rewriteServicePrefix(req, '/iot');
      if (!mqttTarget) return socket.destroy();
      return proxy.ws(req, socket, head, { target: mqttTarget });
    }
    return socket.destroy();
  }

  return { handler, handleUpgrade, close: () => proxy.close() };
}

export { managedSocketAllowed, managedWriteAllowed, normalizeHost, parseHosts, rewriteServicePrefix };
