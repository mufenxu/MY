import assert from 'node:assert/strict';
import test from 'node:test';
import { checkExternalServices, resolveServiceMode } from '../src/service-targets.mjs';

test('external service mode requires core and exam but keeps notification optional', () => {
  assert.deepEqual(resolveServiceMode({ PLATFORM_EXTERNAL_SERVICES: 'false' }), {
    external: false,
    targets: { core: '', exam: '', notify: '' },
  });
  assert.throws(
    () => resolveServiceMode({ PLATFORM_EXTERNAL_SERVICES: 'true', CORE_SERVICE_URL: 'http://core' }),
    /exam/,
  );
  assert.deepEqual(
    resolveServiceMode({
      PLATFORM_EXTERNAL_SERVICES: 'true',
      CORE_SERVICE_URL: 'http://core',
      EXAM_SERVICE_URL: 'http://exam',
    }),
    { external: true, targets: { core: 'http://core', exam: 'http://exam', notify: '' } },
  );
});

test('external readiness probes only fixed low-cardinality health paths', async () => {
  const urls = [];
  const ready = await checkExternalServices(
    { core: 'http://core:1', exam: 'http://exam:2/', notify: 'http://notify:3' },
    {
      fetchImpl: async (url) => {
        urls.push(url.toString());
        return { ok: true };
      },
    },
  );
  assert.equal(ready, true);
  assert.deepEqual(urls.sort(), [
    'http://core:1/health',
    'http://exam:2/version',
  ]);
});

test('external readiness is not blocked by an optional notification outage', async () => {
  const ready = await checkExternalServices(
    { core: 'http://core', exam: 'http://exam', notify: 'http://notify' },
    {
      fetchImpl: async (url) => ({ ok: !url.toString().includes('notify') }),
    },
  );
  assert.equal(ready, true);
});
