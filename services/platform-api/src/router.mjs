import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import httpProxy from 'http-proxy';

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

export function createCoreWebApp({ coreApp, staticPath }) {
  const app = express();
  app.disable('x-powered-by');
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

  function handler(req, res) {
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');

    if (hostSets.core.has(host)) return coreApp(req, res);
    if (hostSets.exam.has(host)) return examApp(req, res);
    if (hostSets.notify.has(host)) return notifyApp(req, res);
    if (hostSets.campus.has(host)) return proxyRequest(req, res, campusTarget);
    if (hostSets.mqtt.has(host)) return proxyRequest(req, res, mqttTarget);

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

  function handleUpgrade(req, socket, head) {
    const host = normalizeHost(req.headers.host);
    const requestUrl = new URL(req.url || '/', 'http://platform.internal');
    if (hostSets.mqtt.has(host)) {
      if (!mqttTarget) return socket.destroy();
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

export { normalizeHost, parseHosts, rewriteServicePrefix };
