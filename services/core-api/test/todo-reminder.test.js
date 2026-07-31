const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSummaryMessage, selectReminderTasks } = require('../services/todoReminder');

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
