import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformRouter } from '../src/router.mjs';

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

async function request(port, pathname, host = 'admin.example.com') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, headers: { Host: host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(JSON.parse(body)));
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
    assert.deepEqual(await request(port, '/api/users?limit=1', 'xcx.example.com'), {
      name: 'core',
      url: '/api/users?limit=1',
    });
    assert.equal((await request(port, '/', 'exam.example.com')).name, 'exam');
    assert.equal((await request(port, '/healthz', 'notify.example.com')).name, 'notify');
    assert.equal((await request(port, '/')).name, 'portal');
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
    assert.deepEqual(await request(port, '/core/users?page=2'), { name: 'core', url: '/api/users?page=2' });
    assert.deepEqual(await request(port, '/core/health'), { name: 'core', url: '/health' });
    assert.deepEqual(await request(port, '/exam/public/categories'), { name: 'exam', url: '/api/public/categories' });
    assert.deepEqual(await request(port, '/exam/version'), { name: 'exam', url: '/version' });
    assert.deepEqual(await request(port, '/notify-service/healthz'), { name: 'notify', url: '/healthz' });
  });
});
