const assert = require('node:assert/strict');
const test = require('node:test');
const { createAppPushDispatcher } = require('../src/app-push');

test('app push dispatcher keeps provider payload metadata-only and defers poll devices', async () => {
  const calls = [];
  const dispatcher = createAppPushDispatcher({
    providers: {
      fcm: { send: async (payload) => calls.push(payload) },
    },
  });
  const result = await dispatcher.dispatch({
    store: {
      getRecipientPreference: async () => null,
      listAppDeliveryDevices: async () => [
        { installationId: 'install-fcm', provider: 'fcm', token: 'secret-token' },
        { installationId: 'install-poll', provider: 'poll', token: '' },
      ],
    },
    notification: { id: 'notice-1', category: 'system', priority: 'high', content: { summary: 'private' } },
    recipients: ['user-1'],
  });

  assert.deepEqual(calls, [{
    token: 'secret-token',
    installationId: 'install-fcm',
    notificationId: 'notice-1',
    category: 'system',
    priority: 'high',
  }]);
  assert.deepEqual(result, {
    attempted: 2,
    sent: 1,
    deferred: 1,
    failed: 0,
    suppressed: 0,
    results: [
      { installationId: 'install-fcm', provider: 'fcm', status: 'sent' },
      { installationId: 'install-poll', provider: 'poll', status: 'deferred' },
    ],
  });
});

test('app push dispatcher honors recipient quiet hours before reading device tokens', async () => {
  let deviceReads = 0;
  const dispatcher = createAppPushDispatcher();
  const result = await dispatcher.dispatch({
    store: {
      getRecipientPreference: async () => ({
        enabled: true,
        quietHours: { enabled: true, startHour: 22, endHour: 7 },
        timezoneOffsetMinutes: 480,
      }),
      listAppDeliveryDevices: async () => { deviceReads += 1; return []; },
    },
    notification: { id: 'notice-quiet', category: 'system', priority: 'normal' },
    recipients: ['user-1'],
    now: new Date('2026-08-11T15:00:00Z'),
  });

  assert.equal(deviceReads, 0);
  assert.equal(result.suppressed, 1);
  assert.equal(result.attempted, 0);
});
