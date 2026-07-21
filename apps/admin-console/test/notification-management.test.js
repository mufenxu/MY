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

test('unconfigured notification management client remains readable but blocks mutations', async () => {
  const client = createNotificationManagementClient({});
  assert.equal((await client.getOverview()).configured, false);
  assert.deepEqual(await client.listDeliveries(), { items: [], page: 1, pageSize: 20, total: 0 });
  await assert.rejects(
    client.retryDelivery('delivery_123456', 'operator'),
    (error) => error.code === 'NOTIFICATION_NOT_CONFIGURED' && error.status === 503,
  );
});
