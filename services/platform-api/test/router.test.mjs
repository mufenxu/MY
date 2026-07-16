import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPlatformRouter, managedSocketAllowed, managedWriteAllowed } from '../src/router.mjs';

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

async function request(port, pathname, host = 'admin.example.com', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, headers: { Host: host, ...headers } }, (res) => {
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
      ? { sub: 'admin', nonce: 'session-nonce' }
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
