import assert from 'node:assert/strict';
import test from 'node:test';
import { HEALTH_PATHS, checkExternalServices, checkServiceTarget, resolveServiceMode } from '../src/service-targets.mjs';

test('external service mode requires every configured platform target', () => {
  assert.deepEqual(resolveServiceMode({ PLATFORM_EXTERNAL_SERVICES: 'false' }), {
    external: false,
    targets: {
      core: 'http://127.0.0.1:3045',
      exam: 'http://127.0.0.1:3110',
      campus: 'http://campus-service:22101',
      iot: 'http://iot-service:22102',
      notify: 'http://notification-service:3000',
    },
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
    'http://core:1/readyz',
    'http://exam:2/readyz',
  ]);
});

test('readiness falls back to the legacy probe path only when it is missing', async () => {
  // 旧服务没有 /readyz：404 时回落到 /health
  const legacyUrls = [];
  const legacyReady = await checkServiceTarget('http://core:1', HEALTH_PATHS.core, {
    fetchImpl: async (url) => {
      legacyUrls.push(url.toString());
      return url.pathname === '/readyz' ? { ok: false, status: 404 } : { ok: true, status: 200 };
    },
  });
  assert.equal(legacyReady, true);
  assert.deepEqual(legacyUrls, ['http://core:1/readyz', 'http://core:1/health']);

  // 503 表示"进程在但没就绪"，不能被旧路径的 200 掩盖
  const notReadyUrls = [];
  const notReady = await checkServiceTarget('http://core:1', HEALTH_PATHS.core, {
    fetchImpl: async (url) => {
      notReadyUrls.push(url.toString());
      return { ok: false, status: 503 };
    },
  });
  assert.equal(notReady, false);
  assert.deepEqual(notReadyUrls, ['http://core:1/readyz']);
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
