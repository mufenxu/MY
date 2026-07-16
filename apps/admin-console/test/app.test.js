import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('readiness reports a failed session registry dependency', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const app = createApp({ config, readinessCheck: async () => false });
  await withServer(app, async (origin) => {
    const response = await fetch(`${origin}/api/readyz`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'not-ready');
  });
});

test('metrics require the configured bearer token', async () => {
  const token = 'm'.repeat(32);
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: token };
  const app = createApp({ config });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/metrics`)).status, 401);
    const response = await fetch(`${origin}/api/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /my_platform_http_requests_total/);
  });
});
