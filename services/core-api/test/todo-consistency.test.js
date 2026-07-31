const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'todo-consistency-secret';

const TodoList = require('../models/TodoList');
const todoController = require('../controllers/todoController');

function responseRecorder() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return body; }
    };
}

test('todo operations preserve unrelated remote tasks and deletions', () => {
    const tasks = [
        { id: 'a', title: 'A', completed: false, createdAt: 1, updatedAt: 1 },
        { id: 'b', title: 'B', completed: false, createdAt: 2, updatedAt: 2 }
    ];
    const result = todoController.applyOperations(tasks, [
        { type: 'delete', id: 'a' },
        { type: 'upsert', task: { id: 'c', title: 'C', completed: false, createdAt: 3, updatedAt: 3 } }
    ]);
    assert.deepEqual(result.map((task) => task.id), ['b', 'c']);
});

test('todo task normalization upgrades legacy tasks and validates Todo 2.0 fields', () => {
    const legacy = todoController.normalizeTask({
        id: 'legacy',
        title: ' Legacy task ',
        completed: false,
        createdAt: 1,
        updatedAt: 2,
    }, 3);
    assert.equal(legacy.title, 'Legacy task');
    assert.equal(legacy.priority, 'normal');
    assert.equal(legacy.recurrence, 'none');
    assert.equal(legacy.dueAt, null);
    assert.deepEqual(legacy.courseRef, { id: '', name: '' });
    assert.equal(legacy.reminderStatus, 'pending');

    const enriched = todoController.normalizeTask({
        ...legacy,
        dueAt: 100,
        priority: 'high',
        recurrence: 'weekly',
        courseRef: { id: 'math-1', name: 'Math' },
        reminderAt: 90,
    });
    assert.equal(enriched.dueAt, 100);
    assert.equal(enriched.priority, 'high');
    assert.equal(enriched.recurrence, 'weekly');
    assert.deepEqual(enriched.courseRef, { id: 'math-1', name: 'Math' });
    assert.throws(() => todoController.normalizeTask({ ...legacy, priority: 'urgent' }), /priority/);
});

test('legacy full-list sync preserves unseen remote tasks and newer remote edits', async () => {
    const originalFindById = TodoList.findById;
    const originalFindOneAndUpdate = TodoList.findOneAndUpdate;
    const originalCreate = TodoList.create;
    const remoteTasks = [
        { id: 'a', title: 'Remote newer', completed: false, createdAt: 1, updatedAt: 10 },
        { id: 'b', title: 'Remote only', completed: false, createdAt: 2, updatedAt: 2 }
    ];
    let committedTasks;

    TodoList.findById = async () => ({
        _id: 'legacy-client',
        revision: 4,
        ownerName: 'Legacy',
        tasks: remoteTasks
    });
    TodoList.findOneAndUpdate = async (_filter, update) => {
        committedTasks = update.$set.tasks;
        return { _id: 'legacy-client', revision: 5, tasks: committedTasks };
    };
    TodoList.create = async () => { throw new Error('unexpected create'); };
    const response = responseRecorder();

    try {
        await todoController.syncTodos({
            user: { _id: 'legacy-client', username: 'Legacy' },
            headers: {},
            body: {
                tasks: [
                    { id: 'a', title: 'Stale local', completed: true, createdAt: 1, updatedAt: 3 },
                    { id: 'c', title: 'Local addition', completed: false, createdAt: 3, updatedAt: 3 }
                ]
            }
        }, response);

        assert.equal(response.statusCode, 200);
        assert.equal(response.headers.deprecation, 'true');
        assert.deepEqual(committedTasks.map((task) => task.id), ['a', 'b', 'c']);
        assert.equal(committedTasks[0].title, 'Remote newer');
    } finally {
        TodoList.findById = originalFindById;
        TodoList.findOneAndUpdate = originalFindOneAndUpdate;
        TodoList.create = originalCreate;
    }
});

test('first mutation upgrades a legacy todo document without a revision field', async () => {
    const originalFindById = TodoList.findById;
    const originalFindOneAndUpdate = TodoList.findOneAndUpdate;
    const originalCreate = TodoList.create;
    let updateFilter;

    TodoList.findById = async () => ({
        _id: 'legacy-user',
        tasks: [{ id: 'a', title: 'A', completed: false, createdAt: 1, updatedAt: 1 }]
    });
    TodoList.findOneAndUpdate = async (filter, update) => {
        updateFilter = filter;
        return {
            _id: 'legacy-user',
            revision: 1,
            tasks: update.$set.tasks
        };
    };
    TodoList.create = async () => { throw new Error('unexpected create'); };
    const response = responseRecorder();

    try {
        await todoController.mutateTodos({
            user: { _id: 'legacy-user', username: 'Legacy' },
            headers: {},
            body: {
                revision: 0,
                operations: [{
                    type: 'upsert',
                    task: { id: 'a', title: 'Updated', completed: false, createdAt: 1, updatedAt: 2 }
                }]
            }
        }, response);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(updateFilter.$or, [
            { revision: 0 },
            { revision: { $exists: false } }
        ]);
    } finally {
        TodoList.findById = originalFindById;
        TodoList.findOneAndUpdate = originalFindOneAndUpdate;
        TodoList.create = originalCreate;
    }
});

test('concurrent todo mutations allow one revision winner and return a 409 snapshot to the loser', async () => {
    const originalFindById = TodoList.findById;
    const originalFindOneAndUpdate = TodoList.findOneAndUpdate;
    const originalCreate = TodoList.create;
    let state = {
        _id: 'user-1',
        revision: 1,
        ownerName: 'User',
        tasks: [{ id: 'base', title: 'Base', completed: false, createdAt: 1, updatedAt: 1 }]
    };
    let initialReads = 0;
    let releaseReads;
    const readsReady = new Promise((resolve) => { releaseReads = resolve; });

    TodoList.findById = async () => {
        if (initialReads < 2) {
            initialReads += 1;
            if (initialReads === 2) releaseReads();
            await readsReady;
        }
        return JSON.parse(JSON.stringify(state));
    };
    TodoList.findOneAndUpdate = async (filter, update) => {
        const expectedRevision = filter.revision ?? filter.$or?.[0]?.revision;
        if (state.revision !== expectedRevision) return null;
        state = {
            ...state,
            ...update.$set,
            revision: state.revision + update.$inc.revision
        };
        return JSON.parse(JSON.stringify(state));
    };
    TodoList.create = async () => { throw new Error('unexpected create'); };

    const makeRequest = (id) => ({
        user: { _id: 'user-1', username: 'User' },
        headers: {},
        body: {
            revision: 1,
            operations: [{
                type: 'upsert',
                task: { id, title: id, completed: false, createdAt: 2, updatedAt: 2 }
            }]
        }
    });
    const firstResponse = responseRecorder();
    const secondResponse = responseRecorder();

    try {
        await Promise.all([
            todoController.mutateTodos(makeRequest('first'), firstResponse),
            todoController.mutateTodos(makeRequest('second'), secondResponse)
        ]);
        assert.deepEqual([firstResponse.statusCode, secondResponse.statusCode].sort(), [200, 409]);
        const conflict = firstResponse.statusCode === 409 ? firstResponse : secondResponse;
        assert.equal(conflict.body.code, 'TODO_REVISION_CONFLICT');
        assert.equal(conflict.body.data.revision, 2);
        assert.equal(conflict.headers.etag, '"todo-2"');
    } finally {
        TodoList.findById = originalFindById;
        TodoList.findOneAndUpdate = originalFindOneAndUpdate;
        TodoList.create = originalCreate;
    }
});
