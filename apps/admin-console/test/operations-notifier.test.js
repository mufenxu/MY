import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyServiceRequest } from '@my-platform/platform-auth';
import { createOperationsNotifier } from '../src/operations-notifier.js';

test('operations notifier signs internal notification requests without exposing the API key header', async () => {
  const apiKey = 'operations-notifier-test-key';
  let captured;
  const notifier = createOperationsNotifier({
    serviceUrl: 'http://notification-service:3000',
    apiKey,
    fetchImpl: async (url, options) => {
      captured = { url: url.toString(), options };
      return { ok: true, status: 200 };
    },
  });
  const result = await notifier.sendIncident({
    title: 'Test incident',
    severity: 'warning',
    description: 'Temporary issue',
  }, 'opened');
  assert.equal(result.delivered, true);
  assert.equal(captured.url, 'http://notification-service:3000/notify');
  assert.equal(captured.options.headers['X-API-KEY'], undefined);
  assert.equal(verifyServiceRequest({
    headers: captured.options.headers,
    secret: apiKey,
    allowedCallers: ['platform-api'],
    method: 'POST',
    pathname: '/notify',
    body: captured.options.body,
  }).caller, 'platform-api');
});
