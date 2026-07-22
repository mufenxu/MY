import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  boundedProxyTimeout,
  createOfficialWebsiteApp,
  createPlatformRouter,
  isHashedStaticAsset,
  managedSocketAllowed,
  managedWriteAllowed,
  normalizeProxyError,
} from '../src/router.mjs';

const { privateKey: testPrivateKey } = crypto.generateKeyPairSync('ed25519');
const TEST_PRIVATE_KEY = testPrivateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');

function echoApp(name) {
  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name, url: req.url }));
  };
}

async function withServer(router, callback) {
  const server = http.createServer(router.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    router.close();
  }
}

async function request(port, pathname, host = 'admin.example.com', headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: { Host: host, ...headers } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({
        body: body ? JSON.parse(body) : null,
        headers: res.headers,
        status: res.statusCode,
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('host routing preserves legacy application URLs', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    coreHosts: 'xcx.example.com',
    examHosts: 'exam.example.com',
    notifyHosts: 'notify.example.com',
  });

  await withServer(router, async (port) => {
    assert.deepEqual((await request(port, '/api/users?limit=1', 'xcx.example.com')).body, {
      name: 'core',
      url: '/api/users?limit=1',
    });
    assert.equal((await request(port, '/', 'exam.example.com')).body.name, 'exam');
    assert.equal((await request(port, '/healthz', 'notify.example.com')).body.name, 'notify');
    assert.equal((await request(port, '/')).body.name, 'portal');
  });
});

test('official website owns the root and an isolated asset namespace', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    websiteApp: echoApp('website'),
  });

  await withServer(router, async (port) => {
    assert.equal((await request(port, '/')).body.name, 'website');
    assert.equal((await request(port, '/console')).body.name, 'portal');
    assert.equal((await request(port, '/website-assets/index-12345678.js')).body.name, 'website');
    assert.equal((await request(port, '/assets/console-12345678.js')).body.name, 'portal');
  });
});

test('official website briefly caches documents and caches hashed assets immutably', async () => {
  const staticPath = fs.mkdtempSync(path.join(os.tmpdir(), 'my-official-website-'));
  const distPath = path.join(staticPath, 'dist');
  const assetsPath = path.join(distPath, 'website-assets');
  fs.mkdirSync(assetsPath, { recursive: true });
  fs.writeFileSync(path.join(distPath, 'index.html'), '<!doctype html><title>MY</title>');
  fs.writeFileSync(path.join(assetsPath, 'index-AbCd1234.js'), 'console.log("MY");');

  const app = createOfficialWebsiteApp({ staticPath });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const documentResponse = await fetch(`${origin}/`);
    assert.equal(documentResponse.status, 200);
    assert.equal(documentResponse.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
    assert.ok(!documentResponse.headers.get('content-security-policy').includes('fonts.googleapis.com'));

    const assetResponse = await fetch(`${origin}/website-assets/index-AbCd1234.js`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(staticPath, { recursive: true, force: true });
  }
});

test('campus and IoT legacy domains stay behind the platform gateway', async () => {
  const upstream = http.createServer(echoApp('internal-service'));
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    campusTarget: target,
    mqttTarget: target,
    campusHosts: 'campus.example.com',
    mqttHosts: 'iot.example.com',
  });
  try {
    await withServer(router, async (port) => {
      assert.equal((await request(port, '/api/ready', 'campus.example.com')).body.name, 'internal-service');
      assert.equal((await request(port, '/api/devices', 'iot.example.com')).body.name, 'internal-service');
    });
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('viewer sessions can inspect managed apps but cannot mutate them', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    getPlatformSession: () => ({ sub: 'viewer', role: 'viewer', nonce: 'viewer-session' }),
    internalAuthPrivateKey: TEST_PRIVATE_KEY,
    platformPublicOrigin: 'https://admin.example.com',
  });

  await withServer(router, async (port) => {
    const read = await request(port, '/apps/core/api/users');
    assert.equal(read.status, 200);
    const write = await request(port, '/apps/core/api/users', 'admin.example.com', {
      Origin: 'https://admin.example.com',
      'Sec-Fetch-Site': 'same-origin',
    }, 'POST');
    assert.equal(write.status, 403);
    assert.equal(write.body.code, 'PLATFORM_READ_ONLY');
  });
});

test('unified paths map clean routes to each service API', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
  });

  await withServer(router, async (port) => {
    assert.deepEqual((await request(port, '/core/users?page=2')).body, { name: 'core', url: '/api/users?page=2' });
    assert.deepEqual((await request(port, '/core/health')).body, { name: 'core', url: '/health' });
    assert.deepEqual((await request(port, '/exam/public/categories')).body, { name: 'exam', url: '/api/public/categories' });
    assert.deepEqual((await request(port, '/exam/version')).body, { name: 'exam', url: '/version' });
    assert.deepEqual((await request(port, '/notify-service/healthz')).body, { name: 'notify', url: '/healthz' });
  });
});

test('managed app paths require the platform session and inject an internal identity', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'core', url: req.url, sso: req.headers['x-my-platform-sso'] || '' }));
    },
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    getPlatformSession: (req) => req.headers.cookie === 'session=valid'
      ? { sub: 'admin', role: 'super_admin', nonce: 'session-nonce' }
      : null,
    internalAuthPrivateKey: TEST_PRIVATE_KEY,
    platformPublicOrigin: 'https://admin.example.com',
  });

  await withServer(router, async (port) => {
    const canonical = await request(port, '/apps/core?tab=users');
    assert.equal(canonical.status, 308);
    assert.equal(canonical.headers.location, '/apps/core/?tab=users');

    const denied = await request(port, '/apps/core/api/users');
    assert.equal(denied.status, 401);
    assert.equal(denied.body.code, 'PLATFORM_SESSION_REQUIRED');

    const documentRedirect = await request(port, '/apps/core/dashboard?tab=users', 'admin.example.com', {
      Accept: 'text/html',
    });
    assert.equal(documentRedirect.status, 302);
    assert.equal(documentRedirect.headers.location, '/console?returnTo=%2Fapps%2Fcore%2Fdashboard%3Ftab%3Dusers');

    const allowed = await request(port, '/apps/core/api/users?limit=1', 'admin.example.com', {
      Cookie: 'session=valid',
      'X-My-Platform-Sso': 'forged',
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.url, '/api/users?limit=1');
    assert.notEqual(allowed.body.sso, 'forged');
    assert.match(allowed.body.sso, /^[^.]+\.[^.]+$/);
  });
});

test('managed IoT paths discard browser bearer headers while public APIs preserve them', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      authorization: req.headers.authorization || '',
      sso: req.headers['x-my-platform-sso'] || '',
      url: req.url,
    }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    mqttTarget: `http://127.0.0.1:${upstream.address().port}`,
    getPlatformSession: (req) => req.headers.cookie === 'session=valid'
      ? { sub: 'admin', role: 'super_admin', nonce: 'session-nonce' }
      : null,
    internalAuthPrivateKey: TEST_PRIVATE_KEY,
    platformPublicOrigin: 'https://admin.example.com',
  });

  try {
    await withServer(router, async (port) => {
      const managed = await request(port, '/apps/iot/api/info', 'admin.example.com', {
        Authorization: 'Bearer stale-browser-key',
        Cookie: 'session=valid',
      });
      assert.equal(managed.status, 200);
      assert.equal(managed.body.authorization, '');
      assert.match(managed.body.sso, /^[^.]+\.[^.]+$/);
      assert.equal(managed.body.url, '/api/info');

      const publicApi = await request(port, '/api/iot/api/devices', 'admin.example.com', {
        Authorization: 'Bearer external-api-key',
      });
      assert.equal(publicApi.status, 200);
      assert.equal(publicApi.body.authorization, 'Bearer external-api-key');
      assert.equal(publicApi.body.sso, '');
      assert.equal(publicApi.body.url, '/api/devices');
    });
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('canonical single-domain API paths preserve existing service authentication', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
  });

  await withServer(router, async (port) => {
    assert.deepEqual((await request(port, '/api/core/auth/login')).body, { name: 'core', url: '/api/auth/login' });
    assert.deepEqual((await request(port, '/api/exam/api/public/runtime-config')).body, {
      name: 'exam',
      url: '/api/public/runtime-config',
    });
    assert.deepEqual((await request(port, '/api/exam/client/major-categories')).body, {
      name: 'exam',
      url: '/major-categories',
    });
    assert.deepEqual((await request(port, '/api/exam/client/api/user/login')).body, {
      name: 'exam',
      url: '/api/user/login',
    });
    assert.deepEqual((await request(port, '/api/notify/healthz')).body, { name: 'notify', url: '/healthz' });
    assert.deepEqual((await request(port, '/api/notify')).body, { name: 'notify', url: '/notify' });
  });
});

test('gateway strips externally supplied platform and service identity headers', async () => {
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    notifyApp: (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        caller: req.headers['x-my-service-caller'] || '',
        signature: req.headers['x-my-service-signature'] || '',
        sso: req.headers['x-my-platform-sso'] || '',
      }));
    },
  });
  await withServer(router, async (port) => {
    const response = await request(port, '/api/notify', 'admin.example.com', {
      'X-My-Platform-Sso': 'forged',
      'X-My-Service-Caller': 'forged-service',
      'X-My-Service-Signature': 'forged-signature',
    });
    assert.deepEqual(response.body, { caller: '', signature: '', sso: '' });
  });
});

test('managed writes and sockets require the exact public origin', () => {
  const publicOrigin = 'https://admin.example.com';
  assert.equal(managedWriteAllowed({ method: 'GET', headers: {} }, publicOrigin), true);
  assert.equal(managedWriteAllowed({ method: 'POST', headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin' } }, publicOrigin), true);
  assert.equal(managedWriteAllowed({ method: 'POST', headers: { origin: 'https://evil.example.com', 'sec-fetch-site': 'cross-site' } }, publicOrigin), false);
  assert.equal(managedWriteAllowed({ method: 'POST', headers: {} }, publicOrigin), false);
  assert.equal(managedSocketAllowed({ headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin' } }, publicOrigin), true);
  assert.equal(managedSocketAllowed({ headers: { origin: 'https://other.example.com', 'sec-fetch-site': 'same-site' } }, publicOrigin), false);
});

test('optional service targets preserve routing and emit low-cardinality metrics', async () => {
  const upstream = http.createServer(echoApp('external-core'));
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const metrics = [];
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('in-process-core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    coreTarget: `http://127.0.0.1:${upstream.address().port}`,
    recordProxyMetric: (metric) => metrics.push(metric),
  });

  try {
    await withServer(router, async (port) => {
      const response = await request(port, '/api/core/ping?value=1');
      assert.deepEqual(response.body, { name: 'external-core', url: '/api/ping?value=1' });
    });
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }

  assert.equal(metrics.length, 1);
  assert.deepEqual(
    { service: metrics[0].service, outcome: metrics[0].outcome, statusClass: metrics[0].statusClass, errorKind: metrics[0].errorKind },
    { service: 'core', outcome: 'success', statusClass: '2xx', errorKind: 'none' },
  );
  assert.equal(Number.isFinite(metrics[0].durationMs), true);
});

test('proxy timeout and error classification are bounded and stable', () => {
  assert.equal(boundedProxyTimeout(1), 1_000);
  assert.equal(boundedProxyTimeout(999_999), 120_000);
  assert.equal(normalizeProxyError({ code: 'ETIMEDOUT' }), 'timeout');
  assert.equal(normalizeProxyError({ code: 'ECONNREFUSED' }), 'connect');
  assert.equal(normalizeProxyError({ code: 'EPIPE' }), 'aborted');
  assert.equal(normalizeProxyError({ code: 'UNEXPECTED' }), 'other');
  assert.equal(isHashedStaticAsset('C:\\dist\\assets\\index-AbCd1234.js'), true);
  assert.equal(isHashedStaticAsset('C:\\dist\\website-assets\\index-AbCd1234.js'), true);
  assert.equal(isHashedStaticAsset('C:\\dist\\assets\\index.js'), false);
  assert.equal(isHashedStaticAsset('C:\\dist\\favicon.png'), false);
});

test('proxy timeout aborts a stalled upstream and returns 504', async () => {
  const upstream = http.createServer(() => {});
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const metrics = [];
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('in-process-core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    coreTarget: `http://127.0.0.1:${upstream.address().port}`,
    proxyTimeoutMs: 1_000,
    recordProxyMetric: (metric) => metrics.push(metric),
  });

  try {
    await withServer(router, async (port) => {
      const response = await request(port, '/api/core/stalled');
      assert.equal(response.status, 504);
      assert.equal(response.body.code, 'UPSTREAM_TIMEOUT');
    });
  } finally {
    upstream.closeAllConnections?.();
    await new Promise((resolve) => upstream.close(resolve));
  }

  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].service, 'core');
  assert.equal(metrics[0].outcome, 'error');
  assert.equal(metrics[0].statusClass, '5xx');
  assert.equal(metrics[0].errorKind, 'timeout');
});

test('proxy timeout aborts a partial upstream response instead of hanging the client', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('partial');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const metrics = [];
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('in-process-core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    coreTarget: `http://127.0.0.1:${upstream.address().port}`,
    proxyTimeoutMs: 1_000,
    recordProxyMetric: (metric) => metrics.push(metric),
  });

  try {
    await withServer(router, async (port) => {
      const outcome = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('partial proxy response did not terminate')), 2_500);
        const req = http.get({ host: '127.0.0.1', port, path: '/api/core/partial' }, (res) => {
          const finish = (value) => {
            clearTimeout(timer);
            resolve(value);
          };
          res.resume();
          res.once('aborted', () => finish('aborted'));
          res.once('error', () => finish('error'));
          res.once('end', () => finish('end'));
        });
        req.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      assert.notEqual(outcome, 'end');
    });
  } finally {
    upstream.closeAllConnections?.();
    await new Promise((resolve) => upstream.close(resolve));
  }

  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].outcome, 'error');
  assert.equal(metrics[0].errorKind, 'timeout');
});

test('proxy metrics classify upstream 5xx responses as errors', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unavailable' }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const metrics = [];
  const router = createPlatformRouter({
    portalApp: echoApp('portal'),
    coreApp: echoApp('core'),
    examApp: echoApp('exam'),
    notifyApp: echoApp('notify'),
    coreTarget: `http://127.0.0.1:${upstream.address().port}`,
    recordProxyMetric: (metric) => metrics.push(metric),
  });

  try {
    await withServer(router, async (port) => {
      assert.equal((await request(port, '/api/core/failure')).status, 503);
    });
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }

  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].outcome, 'error');
  assert.equal(metrics[0].statusClass, '5xx');
  assert.equal(metrics[0].errorKind, 'upstream');
});
