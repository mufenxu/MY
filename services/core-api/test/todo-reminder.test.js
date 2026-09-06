const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'todo-reminder-test-secret';

const {
    buildSummaryMessage,
    buildTodoAppNotificationPayload,
    checkAndNotifyTodos,
    selectReminderTasks,
} = require('../services/todoReminder');

test('todo reminder selects only due unsent tasks and falls back to dueAt', () => {
    const now = 1_000;
    const tasks = [
        { id: 'explicit', title: 'Explicit', reminderAt: 900, dueAt: 2_000, reminderStatus: 'pending' },
        { id: 'due', title: 'Due fallback', dueAt: 950, reminderStatus: 'pending' },
        { id: 'future', title: 'Future', reminderAt: 1_100, reminderStatus: 'pending' },
        { id: 'sent', title: 'Sent', reminderAt: 800, reminderStatus: 'sent', remindedAt: 800 },
        { id: 'done', title: 'Done', reminderAt: 700, completed: true },
    ];

    assert.deepEqual(selectReminderTasks(tasks, now).map((task) => task.id), ['explicit', 'due']);
});

test('todo reminder message includes actionable context', () => {
    const message = buildSummaryMessage([{
        userId: 'u1',
        ownerName: 'Owner',
        tasks: [{ title: 'Review chapter', priority: 'high', dueAt: 900, courseRef: { name: 'Math' } }],
    }], 1_000);

    assert.match(message, /Review chapter/);
    assert.match(message, /Math/);
    assert.match(message, /高优先级/);
});

test('todo reminder builds one canonical App and WeCom notification', () => {
    const groups = [{
        userId: 'owner-1',
        ownerName: 'Owner',
        tasks: [
            { id: 'task-1', title: 'Review chapter', priority: 'high', reminderAt: 900, dueAt: 1_200 },
            { id: 'task-2', title: 'Submit report', priority: 'normal', dueAt: 1_500 },
        ],
    }];
    const payload = buildTodoAppNotificationPayload({
        recipientId: 'platform-user',
        ownerId: 'owner-1',
        groups,
        now: 1_000,
        includeWecom: true,
        recipients: { touser: 'wecom-user', toparty: '', totag: '' },
    });

    assert.deepEqual(payload.audience, { users: ['platform-user'] });
    assert.deepEqual(payload.channels, ['app', 'wecom']);
    assert.deepEqual(payload.wecom, { touser: 'wecom-user' });
    assert.equal(payload.priority, 'high');
    assert.equal(payload.category, 'todo.reminder');
    assert.equal(payload.source.service, 'core-api');
    assert.equal(payload.source.entityType, 'todo-reminder');
    assert.match(payload.idempotencyKey, /^todo-reminder:owner-1:[a-f0-9]{24}$/);
    assert.equal(payload.dedupeKey, payload.idempotencyKey);
    assert.match(payload.content.summary, /2 项/);
    assert.deepEqual(payload.actions, [{
        id: 'open-todos',
        label: '查看待办',
        deepLink: 'mycontrol://open?destination=today',
    }]);
});

test('todo reminder App-only payload omits WeCom configuration and changes key with schedule', () => {
    const base = {
        recipientId: 'platform-user',
        ownerId: 'owner-1',
        now: 1_000,
        includeWecom: false,
        recipients: {},
    };
    const first = buildTodoAppNotificationPayload({
        ...base,
        groups: [{ userId: 'owner-1', tasks: [{ id: 'task-1', title: 'Review', reminderAt: 900 }] }],
    });
    const rescheduled = buildTodoAppNotificationPayload({
        ...base,
        groups: [{ userId: 'owner-1', tasks: [{ id: 'task-1', title: 'Review', reminderAt: 1_100 }] }],
    });

    assert.deepEqual(first.channels, ['app']);
    assert.equal(Object.hasOwn(first, 'wecom'), false);
    assert.notEqual(first.idempotencyKey, rescheduled.idempotencyKey);
});

test('todo reminder sends to the platform App when WeCom is disabled', async () => {
    let capturedPayload = null;
    const updates = [];
    const result = await checkAndNotifyTodos({
        now: () => 1_000,
        NotifyConfigModel: {
            findById: async () => ({
                toObject: () => ({ ownerId: 'owner-1', qywxApiKey: 'notification-secret', qywxEnabled: false }),
            }),
        },
        TodoListModel: {
            find: async () => [{
                _id: 'owner-1',
                ownerName: 'Owner',
                tasks: [{
                    id: 'task-1',
                    title: 'Review chapter',
                    priority: 'high',
                    reminderAt: 900,
                    dueAt: 1_200,
                    reminderStatus: 'pending',
                    completed: false,
                }],
            }],
            updateOne: async (...args) => { updates.push(args); },
        },
        UserModel: {
            findById: () => ({
                select() { return this; },
                async lean() { return { _id: 'owner-1', userId: 'platform-user' }; },
            }),
        },
        sendApp: async (payload) => {
            capturedPayload = payload;
            return {
                data: {
                    notificationId: 'notification-1',
                    channels: { app: 'accepted', wecom: 'not-requested' },
                    push: { attempted: 1, sent: 0, deferred: 1, failed: 0, suppressed: 0 },
                },
            };
        },
        sendWecom: async () => { throw new Error('WeCom must not be called'); },
    });

    assert.equal(result.sent, true);
    assert.equal(result.channels.app.status, 'polling');
    assert.deepEqual(capturedPayload.audience, { users: ['platform-user'] });
    assert.deepEqual(capturedPayload.channels, ['app']);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1].$set['tasks.$[reminded].reminderStatus'], 'sent');
    assert.equal(updates[0][1].$set['tasks.$[reminded].remindedAt'], 1_000);
    assert.equal(Object.hasOwn(updates[0][1].$set, 'tasks'), false);
    assert.equal(updates[0][1].$inc.revision, 1);
    assert.equal(updates[0][2].arrayFilters[0].$or[0]['reminded.id'], 'task-1');
});

test('todo reminder falls back to WeCom when canonical delivery fails', async () => {
    let fallbackText = '';
    const updates = [];
    const result = await checkAndNotifyTodos({
        now: () => 1_000,
        NotifyConfigModel: {
            findById: async () => ({
                toObject: () => ({
                    ownerId: 'owner-1',
                    qywxApiKey: 'notification-secret',
                    qywxEnabled: true,
                    qywxToUser: 'wecom-user',
                }),
            }),
        },
        TodoListModel: {
            find: async () => [{
                _id: 'owner-1',
                tasks: [{
                    id: 'task-1',
                    title: 'Review chapter',
                    reminderAt: 900,
                    reminderStatus: 'pending',
                    completed: false,
                }],
            }],
            updateOne: async (...args) => { updates.push(args); },
        },
        UserModel: {
            findById: () => ({
                select() { return this; },
                async lean() { return { _id: 'owner-1', userId: 'platform-user' }; },
            }),
        },
        sendApp: async () => { throw new Error('canonical delivery unavailable'); },
        sendWecom: async (_config, text) => {
            fallbackText = text;
            return { errcode: 0, errmsg: 'ok' };
        },
    });

    assert.equal(result.sent, true);
    assert.equal(result.channels.app.status, 'failed');
    assert.equal(result.channels.wecom.status, 'sent');
    assert.match(fallbackText, /Review chapter/);
    assert.equal(updates.length, 1);
});
