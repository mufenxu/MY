import assert from 'node:assert/strict';
import test from 'node:test';
import { checkExternalServices, resolveServiceMode } from '../src/service-targets.mjs';

test('external service mode requires every configured platform target', () => {
  assert.deepEqual(resolveServiceMode({ PLATFORM_EXTERNAL_SERVICES: 'false' }), {
    external: false,
    targets: { core: '', exam: '', campus: '', iot: '', notify: '' },
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
      CAMPUS_SERVICE_URL: 'http://campus',
      MQTT_SERVICE_URL: 'http://iot',
      NOTIFICATION_SERVICE_URL: 'http://notify',
    }),
    {
      external: true,
      targets: {
        core: 'http://core',
        exam: 'http://exam',
        campus: 'http://campus',
        iot: 'http://iot',
        notify: 'http://notify',
      },
    },
  );
});

test('external readiness probes critical services by default', async () => {
  const urls = [];
  const ready = await checkExternalServices(
    {
      core: 'http://core:1',
      exam: 'http://exam:2/',
      campus: 'http://campus:3',
      iot: 'http://iot:4',
      notify: 'http://notify:5',
    },
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
    'http://exam:2/ready',
  ]);
});

test('external readiness can cover every integrated service', async () => {
  const ready = await checkExternalServices(
    {
      core: 'http://core',
      exam: 'http://exam',
      campus: 'http://campus',
      iot: 'http://iot',
      notify: 'http://notify',
    },
    {
      requiredServices: ['core', 'exam', 'campus', 'iot', 'notify'],
      fetchImpl: async (url) => ({ ok: !url.toString().includes('notify') }),
    },
  );
  assert.equal(ready, false);
});
