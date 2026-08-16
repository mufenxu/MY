const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'resource-security-test-key';

const {
    SECRET_MASK,
    prepareResourceList,
    maskResourceSecrets,
    revealResourcePasswords,
    decryptResourceSecrets
} = require('../utils/resourceSecrets');
const {
    escapeHtml,
    safeReminderItem,
    buildItemsHtml,
    buildWecomText,
    buildAppNotificationPayload,
    createReminderDeliveryKey,
    normalizeAppDeliveryResponse,
    resolveReminderOwner,
    shouldScanAllResourceOwners
} = require('../services/dueReminder');
const ResourceConfig = require('../models/ResourceConfig');

test('resource passwords and nested secrets are encrypted, masked and recoverable', () => {
    const stored = prepareResourceList([{
        name: 'Server A',
        password: 'plain-password',
        config: { apiToken: 'plain-token', cpu: '4C' }
    }]);

    assert.match(stored[0].password, /^enc:gcm:/);
    assert.match(stored[0].config.apiToken, /^enc:gcm:/);
    assert.ok(stored[0].resourceId);

    const response = maskResourceSecrets(stored);
    assert.equal(response[0].password, SECRET_MASK);
    assert.equal(response[0].config.apiToken, SECRET_MASK);

    const savedAgain = prepareResourceList([{
        ...response[0],
        expiresAt: '2030-01-01'
    }], stored);
    assert.equal(savedAgain[0].password, stored[0].password);
    assert.equal(savedAgain[0].config.apiToken, stored[0].config.apiToken);

    const recovered = decryptResourceSecrets(stored);
    assert.equal(recovered[0].password, 'plain-password');
    assert.equal(recovered[0].config.apiToken, 'plain-token');
});

test('resource management responses reveal top-level passwords only', () => {
    const stored = {
        servers: prepareResourceList([{
            name: 'Server A',
            password: 'visible-password',
            config: { apiToken: 'hidden-token' }
        }]),
        domains: prepareResourceList([{
            host: 'example.test',
            password: 'domain-password'
        }])
    };

    const response = revealResourcePasswords(stored);

    assert.equal(response.servers[0].password, 'visible-password');
    assert.equal(response.domains[0].password, 'domain-password');
    assert.equal(response.servers[0].config.apiToken, SECRET_MASK);
});

test('unknown credential containers and common session fields never remain plaintext', () => {
    const stored = prepareResourceList([{
        name: 'Server B',
        config: {
            credentials: { username: 'private-user', value: 'private-value' },
            cookie: 'session-cookie',
            sessionKey: 'session-key',
            authorization: 'Bearer private-token',
            cpu: '4C'
        }
    }]);

    const serialized = JSON.stringify(stored);
    assert.doesNotMatch(serialized, /private-user|private-value|session-cookie|session-key|private-token/);
    assert.match(stored[0].config.credentials.username, /^enc:gcm:/);
    assert.equal(stored[0].config.cpu, '4C');

    const masked = maskResourceSecrets(stored);
    assert.equal(masked[0].config.credentials.username, SECRET_MASK);
    assert.equal(masked[0].config.credentials.value, SECRET_MASK);
    assert.equal(masked[0].config.cookie, SECRET_MASK);
    assert.equal(masked[0].config.sessionKey, SECRET_MASK);
    assert.equal(masked[0].config.authorization, SECRET_MASK);
    assert.equal(masked[0].config.cpu, '4C');

    const recovered = decryptResourceSecrets(stored);
    assert.equal(recovered[0].config.credentials.username, 'private-user');
    assert.equal(recovered[0].config.credentials.value, 'private-value');
    assert.equal(recovered[0].config.cookie, 'session-cookie');
    assert.equal(recovered[0].config.sessionKey, 'session-key');
    assert.equal(recovered[0].config.authorization, 'Bearer private-token');
});

test('reminder rendering drops credentials and escapes all dynamic HTML', () => {
    const raw = {
        name: '<img src=x onerror=alert(1)>',
        host: 'example.test',
        expiresAt: '2030-01-01',
        registrar: '<b>Registrar</b>',
        siteUrl: 'javascript:alert(1)',
        username: 'private-user',
        password: 'private-password',
        email: 'private@example.test'
    };
    const safe = safeReminderItem(raw);

    assert.equal(Object.hasOwn(safe, 'username'), false);
    assert.equal(Object.hasOwn(safe, 'password'), false);
    assert.equal(Object.hasOwn(safe, 'email'), false);
    assert.equal(safe.siteUrl, '');

    const html = buildItemsHtml([raw], '<script>alert(2)</script>');
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /private-(?:user|password)/);
    assert.match(html, /&lt;img/);
    assert.match(html, /&lt;script&gt;/);

    const text = buildWecomText([safe], []);
    assert.doesNotMatch(text, /private-(?:user|password)/);
    assert.equal(escapeHtml('"<&'), '&quot;&lt;&amp;');
});

test('manual resource reminders use a fresh delivery key while scheduled runs stay daily', () => {
    assert.equal(typeof createReminderDeliveryKey, 'function');
    assert.equal(typeof buildAppNotificationPayload, 'function');

    const now = new Date('2026-08-16T09:15:31.000Z');
    const scheduledKey = createReminderDeliveryKey(false, now);
    const firstManualKey = createReminderDeliveryKey(true, now, () => 'manual-a');
    const secondManualKey = createReminderDeliveryKey(true, now, () => 'manual-b');

    assert.equal(scheduledKey, '2026-08-16');
    assert.notEqual(firstManualKey, secondManualKey);

    const base = {
        recipientId: 'admin',
        ownerId: 'owner-1',
        servers: [{ name: 'Server A', expiresAt: '2026-08-18' }],
        domains: [],
        includeWecom: false,
        cfg: {},
    };
    const scheduled = buildAppNotificationPayload({ ...base, deliveryKey: scheduledKey });
    const manual = buildAppNotificationPayload({ ...base, deliveryKey: firstManualKey });
    assert.notEqual(scheduled.idempotencyKey, manual.idempotencyKey);
});

test('app reminder delivery reports inbox acceptance separately from system push', () => {
    assert.equal(typeof normalizeAppDeliveryResponse, 'function');

    const inboxOnly = normalizeAppDeliveryResponse('admin', {
        notificationId: 'notification-1',
        deduplicated: false,
        channels: { app: 'accepted', wecom: 'not-requested' },
        push: { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0 },
    });
    assert.equal(inboxOnly.inboxAccepted, true);
    assert.equal(inboxOnly.systemDelivered, false);
    assert.equal(inboxOnly.status, 'inbox_only');

    const pushed = normalizeAppDeliveryResponse('admin', {
        notificationId: 'notification-2',
        deduplicated: false,
        channels: { app: 'accepted', wecom: 'sent' },
        push: { attempted: 1, sent: 1, deferred: 0, failed: 0, suppressed: 0 },
    });
    assert.equal(pushed.systemDelivered, true);
    assert.equal(pushed.status, 'pushed');
});

test('single-owner reminders recover from a stale notification owner binding', () => {
    assert.equal(typeof resolveReminderOwner, 'function');
    assert.equal(resolveReminderOwner('stale-owner', ['current-owner']), 'current-owner');
    assert.equal(resolveReminderOwner('owner-a', ['owner-a', 'owner-b']), 'owner-a');
    assert.equal(resolveReminderOwner('stale-owner', ['owner-a', 'owner-b']), '');
});

test('WeCom-only reminders can discover a single resource owner', () => {
    assert.equal(typeof shouldScanAllResourceOwners, 'function');
    assert.equal(shouldScanAllResourceOwners(false, true), true);
    assert.equal(shouldScanAllResourceOwners(true, false), true);
    assert.equal(shouldScanAllResourceOwners(false, false), false);
});

test('bulk restore writes also encrypt ResourceConfig secrets at rest', async () => {
    const originalInsertMany = ResourceConfig.collection.insertMany;
    let inserted;
    ResourceConfig.collection.insertMany = async (docs) => {
        inserted = docs;
        return { insertedCount: docs.length, insertedIds: { 0: docs[0]._id } };
    };

    try {
        await ResourceConfig.insertMany([{
            _id: 'resource_restore_test',
            ownerId: 'user-restore',
            servers: [{ name: 'Restored', password: 'restored-plaintext' }],
            domains: []
        }]);
        assert.match(inserted[0].servers[0].password, /^enc:gcm:/);
        assert.doesNotMatch(JSON.stringify(inserted), /restored-plaintext/);
    } finally {
        ResourceConfig.collection.insertMany = originalInsertMany;
    }
});
