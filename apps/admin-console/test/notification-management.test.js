import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyServiceRequest } from '@my-platform/platform-auth';
import {
  NotificationManagementError,
  createNotificationManagementClient,
} from '../src/notification-management.js';

test('notification management client signs requests as admin-console', async () => {
  const apiKey = 'notification-management-test-key';
  let captured;
  const client = createNotificationManagementClient({
    serviceUrl: 'http://notification-service:3000',
    apiKey,
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ configured: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  await client.getOverview();
  assert.equal(captured.url, 'http://notification-service:3000/management/overview');
  assert.equal(captured.options.headers['X-API-KEY'], undefined);
  assert.equal(verifyServiceRequest({
    headers: captured.options.headers,
    secret: apiKey,
    allowedCallers: ['admin-console'],
    method: 'GET',
    pathname: '/management/overview',
  }).caller, 'admin-console');
});

test('notification management client rejects broadcast test messages locally', async () => {
  let requested = false;
  const client = createNotificationManagementClient({
    serviceUrl: 'http://notification-service:3000',
    apiKey: 'notification-management-test-key',
    fetchImpl: async () => {
      requested = true;
      return new Response('{}');
    },
  });
  await assert.rejects(
    client.sendTest({ msgType: 'text', touser: '@all', content: 'hello' }, 'operator'),
    (error) => error instanceof NotificationManagementError && error.code === 'INVALID_TEST_RECIPIENT',
  );
  assert.equal(requested, false);
});

test('notification management client signs API client lifecycle requests without leaking actors into paths', async () => {
  const apiKey = 'notification-management-test-key';
  const captured = [];
  const client = createNotificationManagementClient({
    serviceUrl: 'http://notification-service:3000',
    apiKey,
    fetchImpl: async (url, options) => {
      captured.push({ url: String(url), options });
      return new Response(JSON.stringify({
        client: { id: '57cf6f30-11aa-4f9c-8021-91285ee1df5d', scopes: ['notifications:send'] },
        token: 'one-time-token',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  await client.createApiClient({ name: 'Campus', scopes: ['notifications:send'], rateLimitPerMinute: 30 }, 'root-admin');
  await client.rotateApiClient('57cf6f30-11aa-4f9c-8021-91285ee1df5d', 60, 'root-admin');
  assert.equal(captured[0].url, 'http://notification-service:3000/management/api-clients');
  assert.deepEqual(JSON.parse(captured[0].options.body), {
    name: 'Campus', scopes: ['notifications:send'], rateLimitPerMinute: 30, actor: 'root-admin',
  });
  assert.equal(captured[1].url, 'http://notification-service:3000/management/api-clients/57cf6f30-11aa-4f9c-8021-91285ee1df5d/rotate');
  assert.deepEqual(JSON.parse(captured[1].options.body), { overlapMinutes: 60, actor: 'root-admin' });
  assert.equal(verifyServiceRequest({
    headers: captured[1].options.headers,
    secret: apiKey,
    allowedCallers: ['admin-console'],
    method: 'POST',
    pathname: '/management/api-clients/57cf6f30-11aa-4f9c-8021-91285ee1df5d/rotate',
    body: captured[1].options.body,
  }).caller, 'admin-console');
});

test('unconfigured notification management client remains readable but blocks mutations', async () => {
  const client = createNotificationManagementClient({});
  assert.equal((await client.getOverview()).configured, false);
  assert.deepEqual(await client.listDeliveries(), { items: [], page: 1, pageSize: 20, total: 0 });
  assert.equal((await client.getApiAccess()).configured, false);
  assert.deepEqual(await client.listApiRequests(), { items: [], page: 1, pageSize: 20, total: 0 });
  await assert.rejects(
    client.retryDelivery('delivery_123456', 'operator'),
    (error) => error.code === 'NOTIFICATION_NOT_CONFIGURED' && error.status === 503,
  );
});
