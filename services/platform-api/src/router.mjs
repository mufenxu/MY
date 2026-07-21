import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import httpProxy from 'http-proxy';
import { PLATFORM_SSO_HEADER, SERVICE_AUTH_HEADERS, issueInternalIdentity } from './internal-auth.mjs';

const PROXY_CONTEXT = Symbol('platformProxyContext');
const PROXY_TIMEOUT_MIN_MS = 1_000;
const PROXY_TIMEOUT_MAX_MS = 120_000;

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/:\d+$/, '');
}

function parseHosts(value) {
  return new Set(String(value || '').split(',').map(normalizeHost).filter(Boolean));
}

function pathWithQuery(pathname, search) {
  return `${pathname || '/'}${search || ''}`;
}

function stripExternalIdentityHeaders(req) {
  delete req.headers[PLATFORM_SSO_HEADER];
  for (const header of Object.values(SERVICE_AUTH_HEADERS)) delete req.headers[header];
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

function normalizeProxyError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ERR_HTTP_REQUEST_TIMEOUT'].includes(code)) return 'timeout';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'connect';
  if (['ECONNRESET', 'EPIPE', 'ABORT_ERR'].includes(code)) return 'aborted';
  return 'other';
}

function statusClass(statusCode) {
  const numeric = Number(statusCode);
  return Number.isFinite(numeric) && numeric >= 100 ? `${Math.floor(numeric / 100)}xx` : 'unknown';
}

function writeProxyError(res, error) {
  if (!res || res.destroyed) return;
  if (res.headersSent) {
    res.destroy(error);
    return;
  }
  if (typeof res.writeHead !== 'function') {
    res.destroy?.(error);
    return;
  }
  const timedOut = normalizeProxyError(error) === 'timeout';
  res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    error: timedOut ? 'Upstream service timed out.' : 'Upstream service is unavailable.',
    code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
  }));
  console.error('Platform proxy error:', error.message);
}

function boundedProxyTimeout(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 15_000;
  return Math.min(Math.max(parsed, PROXY_TIMEOUT_MIN_MS), PROXY_TIMEOUT_MAX_MS);
}

function isHashedStaticAsset(filePath) {
  return /[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{8,}\.[^\\/]+$/.test(String(filePath || ''));
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

function rejectReadOnlyWrite(res) {
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: '只读管理员不能修改业务数据。', code: 'PLATFORM_READ_ONLY' }));
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
      dotfiles: 'deny',
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        if (filePath.endsWith('.html') || filePath.endsWith('version.json')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (isHashedStaticAsset(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
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

export function createOfficialWebsiteApp({ staticPath }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "
      + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    next();
  });

  if (staticPath && fs.existsSync(staticPath)) {
    const distPath = path.join(staticPath, 'dist');
    const targetPath = fs.existsSync(distPath) ? distPath : staticPath;

    app.use(express.static(targetPath, {
      index: false,
      dotfiles: 'deny',
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }));

    app.get('/', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const distIndex = path.join(targetPath, 'index.html');
      return res.sendFile(distIndex);
    });
  }

  return app;
}

export function createPlatformRouter({
  portalApp,
  websiteApp,
  coreApp,
  examApp,
  notifyApp,
  campusTarget,
  mqttTarget,
  coreTarget = '',
  examTarget = '',
  notifyTarget = '',
  coreHosts = '',
  examHosts = '',
  notifyHosts = '',
  campusHosts = '',
  mqttHosts = '',
  getPlatformSession = () => null,
  internalAuthPrivateKey = '',
  platformPublicOrigin = '',
  proxyTimeoutMs = 15_000,
  recordProxyMetric = () => {},
}) {
  const hostSets = {
    core: parseHosts(coreHosts),
    exam: parseHosts(examHosts),
    notify: parseHosts(notifyHosts),
    campus: parseHosts(campusHosts),
    mqtt: parseHosts(mqttHosts),
  };
  const upstreamTimeout = boundedProxyTimeout(proxyTimeoutMs);
  const proxy = httpProxy.createProxyServer({
    xfwd: true,
    ws: true,
    proxyTimeout: upstreamTimeout + 250,
  });

  function finishProxyMetric(req, res, error = null) {
    const context = req?.[PROXY_CONTEXT];
    if (!context || context.finished) return;
    context.finished = true;
    const upstreamFailure = !error && Number(res?.statusCode) >= 500;
    const metric = {
      service: context.service,
      outcome: error || upstreamFailure ? 'error' : 'success',
      statusClass: error ? '5xx' : statusClass(res?.statusCode),
      errorKind: error ? normalizeProxyError(error) : (upstreamFailure ? 'upstream' : 'none'),
      durationMs: Math.max(Math.round(performance.now() - context.startedAt), 0),
    };
    try { recordProxyMetric(metric); } catch (metricError) {
      console.error('Platform proxy metric callback failed:', metricError.message);
    }
  }

  proxy.on('proxyReq', (proxyReq, req, res) => {
    const context = req?.[PROXY_CONTEXT];
    if (!context) return;
    context.proxyReq = proxyReq;

    const timeout = setTimeout(() => {
      const error = new Error('Upstream request timed out');
      error.code = 'ETIMEDOUT';
      finishProxyMetric(req, res, error);
      writeProxyError(res, error);
      if (!context.proxyRes?.destroyed) context.proxyRes?.destroy(error);
      if (!proxyReq.destroyed) proxyReq.destroy(error);
    }, upstreamTimeout);
    timeout.unref?.();
    context.timeout = timeout;

    const abort = () => {
      const error = new Error('Client disconnected before upstream completed');
      error.code = 'ABORT_ERR';
      if (!context.proxyRes?.destroyed) context.proxyRes?.destroy(error);
      if (!proxyReq.destroyed) proxyReq.destroy(error);
    };
    const onResponseClose = () => {
      if (!res.writableEnded) abort();
      cleanup();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      req.off('aborted', abort);
      res.off('finish', cleanup);
      res.off('close', onResponseClose);
    };
    context.cleanup = cleanup;

    req.once('aborted', abort);
    res.once('finish', cleanup);
    res.once('close', onResponseClose);
  });
  proxy.on('proxyRes', (proxyRes, req) => {
    const context = req?.[PROXY_CONTEXT];
    if (context) context.proxyRes = proxyRes;
  });
  proxy.on('error', (error, req, res) => {
    req?.[PROXY_CONTEXT]?.cleanup?.();
    finishProxyMetric(req, res, error);
    writeProxyError(res, error);
  });

  function proxyRequest(req, res, target, service) {
    if (!target) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '内部服务未配置。', code: 'UPSTREAM_NOT_CONFIGURED' }));
      return;
    }
    req[PROXY_CONTEXT] = {
      finished: false,
      service,
      startedAt: performance.now(),
    };
    res.once('finish', () => finishProxyMetric(req, res));
    res.once('close', () => {
      if (!res.writableEnded) {
        const error = new Error('Client connection closed');
        error.code = 'ABORT_ERR';
        finishProxyMetric(req, res, error);
      }
    });
    proxy.web(req, res, {
      target,
      proxyTimeout: upstreamTimeout + 250,
    });
  }

  function dispatchApp(req, res, app, target, service) {
    if (target) return proxyRequest(req, res, target, service);
    if (typeof app === 'function') return app(req, res);
    return proxyRequest(req, res, '', service);
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
    if (session.role === 'viewer' && !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || 'GET').toUpperCase())) {
      rejectReadOnlyWrite(res);
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
    stripExternalIdentityHeaders(req);
    const requestId = crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');

    if (hostSets.core.has(host)) return dispatchApp(req, res, coreApp, coreTarget, 'core');
    if (hostSets.exam.has(host)) return dispatchApp(req, res, examApp, examTarget, 'exam');
    if (hostSets.notify.has(host)) return dispatchApp(req, res, notifyApp, notifyTarget, 'notify');
    if (hostSets.campus.has(host)) return proxyRequest(req, res, campusTarget, 'campus');
    if (hostSets.mqtt.has(host)) return proxyRequest(req, res, mqttTarget, 'iot');

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
      return dispatchApp(req, res, coreApp, coreTarget, 'core');
    }
    if (requestUrl.pathname.startsWith('/apps/exam/')) {
      if (!await authorizeManagedApp(req, res, 'exam', '/apps/exam')) return;
      return dispatchApp(req, res, examApp, examTarget, 'exam');
    }
    if (requestUrl.pathname.startsWith('/apps/campus/')) {
      if (!await authorizeManagedApp(req, res, 'campus', '/apps/campus')) return;
      return proxyRequest(req, res, campusTarget, 'campus');
    }
    if (requestUrl.pathname.startsWith('/apps/iot/')) {
      if (!await authorizeManagedApp(req, res, 'iot', '/apps/iot')) return;
      return proxyRequest(req, res, mqttTarget, 'iot');
    }

    if (requestUrl.pathname === '/api/core' || requestUrl.pathname.startsWith('/api/core/')) {
      rewriteServicePrefix(req, '/api/core', { apiByDefault: true, preserve: ['/uploads', '/public'] });
      return dispatchApp(req, res, coreApp, coreTarget, 'core');
    }
    if (requestUrl.pathname === '/api/exam/client' || requestUrl.pathname.startsWith('/api/exam/client/')) {
      rewriteServicePrefix(req, '/api/exam/client');
      return dispatchApp(req, res, examApp, examTarget, 'exam');
    }
    if (requestUrl.pathname === '/api/exam' || requestUrl.pathname.startsWith('/api/exam/')) {
      rewriteServicePrefix(req, '/api/exam', { apiByDefault: true });
      return dispatchApp(req, res, examApp, examTarget, 'exam');
    }
    if (requestUrl.pathname === '/api/notify' || requestUrl.pathname.startsWith('/api/notify/')) {
      if (requestUrl.pathname === '/api/notify' || requestUrl.pathname === '/api/notify/') {
        req.url = pathWithQuery('/notify', requestUrl.search);
      } else {
        rewriteServicePrefix(req, '/api/notify');
      }
      return dispatchApp(req, res, notifyApp, notifyTarget, 'notify');
    }
    if (requestUrl.pathname === '/api/campus' || requestUrl.pathname.startsWith('/api/campus/')) {
      rewriteServicePrefix(req, '/api/campus', { apiByDefault: true });
      return proxyRequest(req, res, campusTarget, 'campus');
    }
    if (requestUrl.pathname === '/api/iot' || requestUrl.pathname.startsWith('/api/iot/')) {
      rewriteServicePrefix(req, '/api/iot', { apiByDefault: true, preserve: ['/api-docs'] });
      return proxyRequest(req, res, mqttTarget, 'iot');
    }

    if (requestUrl.pathname === '/core' || requestUrl.pathname.startsWith('/core/')) {
      rewriteServicePrefix(req, '/core', { apiByDefault: true, preserve: ['/uploads', '/public'] });
      return dispatchApp(req, res, coreApp, coreTarget, 'core');
    }
    if (requestUrl.pathname === '/exam' || requestUrl.pathname.startsWith('/exam/')) {
      rewriteServicePrefix(req, '/exam', { apiByDefault: true });
      return dispatchApp(req, res, examApp, examTarget, 'exam');
    }
    if (requestUrl.pathname === '/notify-service' || requestUrl.pathname.startsWith('/notify-service/')) {
      rewriteServicePrefix(req, '/notify-service');
      return dispatchApp(req, res, notifyApp, notifyTarget, 'notify');
    }
    if (requestUrl.pathname === '/campus' || requestUrl.pathname.startsWith('/campus/')) {
      rewriteServicePrefix(req, '/campus', { apiByDefault: true });
      return proxyRequest(req, res, campusTarget, 'campus');
    }
    if (requestUrl.pathname === '/iot' || requestUrl.pathname.startsWith('/iot/')) {
      rewriteServicePrefix(req, '/iot', { apiByDefault: true });
      return proxyRequest(req, res, mqttTarget, 'iot');
    }

    if (
      requestUrl.pathname === '/'
      || requestUrl.pathname === '/index.html'
      || requestUrl.pathname === '/index.css'
      || requestUrl.pathname === '/main.js'
      || requestUrl.pathname.startsWith('/website-assets/')
    ) {
      if (typeof websiteApp === 'function') {
        return websiteApp(req, res);
      }
    }

    if (requestUrl.pathname === '/console' || requestUrl.pathname.startsWith('/console/')) {
      rewriteServicePrefix(req, '/console');
      return portalApp(req, res);
    }

    return portalApp(req, res);
  }

  async function handleUpgrade(req, socket, head) {
    stripExternalIdentityHeaders(req);
    req.headers['x-request-id'] = crypto.randomUUID();
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');
    if (hostSets.mqtt.has(host)) {
      if (!mqttTarget) return socket.destroy();
      return proxy.ws(req, socket, head, { target: mqttTarget, proxyTimeout: upstreamTimeout });
    }
    if (requestUrl.pathname === '/apps/iot/ws' || requestUrl.pathname.startsWith('/apps/iot/ws/')) {
      const session = await getPlatformSession(req);
      if (
        !session
        || session.role === 'viewer'
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
      return proxy.ws(req, socket, head, { target: mqttTarget, proxyTimeout: upstreamTimeout });
    }
    if (requestUrl.pathname === '/iot/ws' || requestUrl.pathname.startsWith('/iot/ws/')) {
      rewriteServicePrefix(req, '/iot');
      if (!mqttTarget) return socket.destroy();
      return proxy.ws(req, socket, head, { target: mqttTarget, proxyTimeout: upstreamTimeout });
    }
    return socket.destroy();
  }

  return { handler, handleUpgrade, close: () => proxy.close() };
}

export {
  boundedProxyTimeout,
  isHashedStaticAsset,
  managedSocketAllowed,
  managedWriteAllowed,
  normalizeHost,
  normalizeProxyError,
  parseHosts,
  rewriteServicePrefix,
  stripExternalIdentityHeaders,
};
