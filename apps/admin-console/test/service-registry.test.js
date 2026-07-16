import test from 'node:test';
import assert from 'node:assert/strict';
import { checkService, createStatusMonitor, loadServiceRegistry } from '../src/service-registry.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const service = {
  id: 'example',
  baseUrl: 'https://example.com',
  healthPath: '/health',
};

test('health checks normalize successful responses', async () => {
  let now = 1000;
  const result = await checkService(service, {
    fetchImpl: async () => ({ ok: true, status: 204 }),
    now: () => {
      now += 12;
      return now;
    },
  });

  assert.equal(result.state, 'healthy');
  assert.equal(result.httpStatus, 204);
  assert.equal(result.latencyMs, 12);
});

test('services without a health endpoint are not reported offline', async () => {
  const result = await checkService({ id: 'automation', baseUrl: null, healthPath: null });
  assert.equal(result.state, 'unmonitored');
  assert.equal(result.latencyMs, null);
});

test('status monitor coalesces concurrent refreshes', async () => {
  let calls = 0;
  const monitor = createStatusMonitor([service], {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
  });

  const [left, right] = await Promise.all([monitor.refresh(), monitor.refresh()]);
  assert.deepEqual(left, right);
  assert.equal(calls, 1);
});

test('service registry accepts same-origin managed application paths', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'my-platform-registry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registryPath = join(directory, 'services.json');
  await writeFile(registryPath, JSON.stringify({
    schemaVersion: 1,
    services: [{
      id: 'core',
      name: 'Core',
      category: 'miniapp',
      baseUrl: 'http://127.0.0.1:22100',
      healthPath: '/health',
      adminUrl: '/apps/core',
    }],
  }));

  assert.equal(loadServiceRegistry(registryPath).services[0].adminUrl, '/apps/core/');
});
