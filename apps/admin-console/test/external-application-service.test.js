import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkExternalApplicationHealth,
  normalizeExternalApplicationInput,
  roleCanAccessExternalApplication,
  sanitizeExternalApplication,
  visibleExternalApplications,
} from '../src/external-application-service.js';

test('external application input requires exact secure URLs in production', () => {
  const normalized = normalizeExternalApplicationInput({
    name: '项目 A',
    description: '说明',
    redirectUris: ['https://a.example.com/auth/my/callback'],
    launchUrl: 'https://a.example.com/auth/my/start',
    healthUrl: 'https://a.example.com/healthz',
    requiredRole: 'operator',
    openMode: 'webview',
    enabled: true,
  }, { isProduction: true });
  assert.equal(normalized.launchUrl, 'https://a.example.com/auth/my/start');
  assert.deepEqual(normalized.redirectUris, ['https://a.example.com/auth/my/callback']);

  assert.throws(() => normalizeExternalApplicationInput({
    ...normalized,
    redirectUris: ['https://a.example.com/auth/*'],
  }, { isProduction: true }), /回调地址/);
  assert.throws(() => normalizeExternalApplicationInput({
    ...normalized,
    launchUrl: 'http://a.example.com/auth/my/start',
  }, { isProduction: true }), /HTTPS/);
  assert.throws(() => normalizeExternalApplicationInput({
    ...normalized,
    redirectUris: ['https://a.example.com/auth/my/callback#fragment'],
  }, { isProduction: true }), /fragment/);
});

test('development permits loopback HTTP but rejects public HTTP', () => {
  assert.doesNotThrow(() => normalizeExternalApplicationInput({
    name: '本地项目',
    redirectUris: ['http://127.0.0.1:4100/callback'],
    launchUrl: 'http://localhost:4100/start',
    requiredRole: 'viewer',
    openMode: 'browser',
  }, { isProduction: false }));
  assert.throws(() => normalizeExternalApplicationInput({
    name: '不安全项目',
    redirectUris: ['http://public.example.com/callback'],
    launchUrl: 'http://public.example.com/start',
  }, { isProduction: false }), /HTTPS/);
});

test('direct applications need only a name and URL and reject auto-login', () => {
  const normalized = normalizeExternalApplicationInput({
    kind: 'direct',
    name: '直接打开站点',
    description: '无需登录的公开页面',
    launchUrl: 'https://docs.example.com',
    requiredRole: 'viewer',
    openMode: 'webview',
    enabled: true,
  }, { isProduction: true });
  assert.equal(normalized.kind, 'direct');
  assert.deepEqual(normalized.redirectUris, []);
  assert.equal(normalized.autoLogin, null);
  assert.equal(normalized.launchUrl, 'https://docs.example.com/');
  assert.throws(() => normalizeExternalApplicationInput({
    ...normalized,
    autoLogin: {
      loginUrl: 'https://docs.example.com/login',
      username: 'account',
      password: 'secret',
      homeUrl: null,
    },
  }, { isProduction: true }), /直接打开类型/);
});

test('role access follows existing viewer operator super-admin order', () => {
  const application = { requiredRole: 'operator', enabled: true };
  assert.equal(roleCanAccessExternalApplication('viewer', application), false);
  assert.equal(roleCanAccessExternalApplication('operator', application), true);
  assert.equal(roleCanAccessExternalApplication('super_admin', application), true);
  assert.equal(roleCanAccessExternalApplication('super_admin', { ...application, enabled: false }), false);
});

test('non-admin lists include only enabled applications within the account role', () => {
  const applications = [
    { id: 'viewer', requiredRole: 'viewer', enabled: true },
    { id: 'operator', requiredRole: 'operator', enabled: true },
    { id: 'disabled', requiredRole: 'viewer', enabled: false },
  ];

  assert.deepEqual(visibleExternalApplications(applications, 'viewer').map(({ id }) => id), ['viewer']);
  assert.deepEqual(visibleExternalApplications(applications, 'operator').map(({ id }) => id), ['viewer', 'operator']);
  assert.deepEqual(visibleExternalApplications(applications, 'super_admin').map(({ id }) => id), [
    'viewer',
    'operator',
    'disabled',
  ]);
});

test('client responses omit credential fields and expose access decision', () => {
  const application = {
    id: 'app-1',
    name: '项目 A',
    clientId: 'client-1',
    clientSecretHash: 'secret-hash',
    clientSecretHint: '12345678',
    requiredRole: 'operator',
    enabled: true,
  };
  const sanitized = sanitizeExternalApplication(application, { role: 'viewer', includeClient: false });
  assert.equal('clientId' in sanitized, false);
  assert.equal('clientSecretHash' in sanitized, false);
  assert.equal('clientSecretHint' in sanitized, false);
  assert.equal(sanitized.canAccess, false);
});

test('health checks are bounded and report HTTP state without throwing', async () => {
  const healthy = await checkExternalApplicationHealth({ healthUrl: 'https://a.example.com/healthz', enabled: true }, {
    fetchImpl: async () => ({ ok: true, status: 204 }),
    now: (() => { let value = 1_000; return () => (value += 25); })(),
  });
  assert.equal(healthy.state, 'healthy');
  assert.equal(healthy.httpStatus, 204);
  assert.equal(healthy.latencyMs, 25);

  const failed = await checkExternalApplicationHealth({ healthUrl: 'https://a.example.com/healthz', enabled: true }, {
    fetchImpl: async () => { throw new Error('network down'); },
  });
  assert.equal(failed.state, 'offline');
  assert.equal(failed.httpStatus, null);

  const unmonitored = await checkExternalApplicationHealth({ healthUrl: null, enabled: true });
  assert.equal(unmonitored.state, 'unmonitored');
});
