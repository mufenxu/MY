const TodoList = require('../models/TodoList');

const MAX_TASKS = 500;
const MAX_OPERATIONS = 100;
const MAX_TITLE_LENGTH = 200;

function parseRevision(req) {
    const bodyRevision = req.body && req.body.revision;
    if (Number.isSafeInteger(bodyRevision) && bodyRevision >= 0) return bodyRevision;

    const ifMatch = String(req.headers?.['if-match'] || '').trim();
    const match = ifMatch.match(/^(?:W\/)?"?todo-(\d+)"?$/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeTask(raw, now = Date.now()) {
    const id = String(raw?.id || '').trim();
    const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
    if (!id || id.length > 128 || !title || title.length > MAX_TITLE_LENGTH) {
        const error = new Error('Invalid todo task');
        error.statusCode = 400;
        throw error;
    }

    const createdAt = Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : now;
    const updatedAt = Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : createdAt;
    return {
        id,
        title,
        completed: Boolean(raw.completed),
        createdAt,
        updatedAt
    };
}

function normalizeTasks(raw) {
    if (!Array.isArray(raw) || raw.length > MAX_TASKS) {
        const error = new Error(`tasks must be an array with at most ${MAX_TASKS} items`);
        error.statusCode = 400;
        throw error;
    }
    const ids = new Set();
    return raw.map((item) => {
        const task = normalizeTask(item);
        if (ids.has(task.id)) {
            const error = new Error('Duplicate todo task id');
            error.statusCode = 400;
            throw error;
        }
        ids.add(task.id);
        return task;
    });
}

function normalizeOwnerName(value) {
    return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function revisionOf(todoList) {
    return Number.isSafeInteger(todoList?.revision) && todoList.revision >= 0
        ? todoList.revision
        : 0;
}

function setRevisionHeaders(res, revision) {
    res.setHeader('ETag', `"todo-${revision}"`);
    res.setHeader('X-Todo-Revision', String(revision));
}

function sendSnapshot(res, todoList, statusCode = 200) {
    const revision = revisionOf(todoList);
    const tasks = todoList?.tasks || [];
    setRevisionHeaders(res, revision);
    return res.status(statusCode).json({
        success: true,
        data: tasks,
        revision
    });
}

async function sendConflict(res, userId) {
    const current = await TodoList.findById(userId);
    const revision = revisionOf(current);
    setRevisionHeaders(res, revision);
    return res.status(409).json({
        success: false,
        code: 'TODO_REVISION_CONFLICT',
        message: 'Todo list changed on another device',
        data: {
            tasks: current?.tasks || [],
            revision
        }
    });
}

async function commitTasks({ userId, expectedRevision, tasks, ownerName }) {
    const now = Date.now();
    const revisionFilter = expectedRevision === 0
        ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
        : { revision: expectedRevision };
    const update = {
        $set: {
            tasks,
            updatedAt: now,
            ownerName,
            pendingCount: tasks.filter((task) => !task.completed).length
        },
        $inc: { revision: 1 }
    };
    const updated = await TodoList.findOneAndUpdate(
        { _id: userId, ...revisionFilter },
        update,
        { new: true, runValidators: true }
    );
    if (updated) return updated;

    if (expectedRevision !== 0) return null;
    try {
        return await TodoList.create({
            _id: userId,
            tasks,
            revision: 1,
            updatedAt: now,
            ownerName,
            pendingCount: tasks.filter((task) => !task.completed).length
        });
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }
}

function applyOperations(tasks, rawOperations) {
    if (!Array.isArray(rawOperations) || rawOperations.length === 0 || rawOperations.length > MAX_OPERATIONS) {
        const error = new Error(`operations must contain 1-${MAX_OPERATIONS} items`);
        error.statusCode = 400;
        throw error;
    }

    const taskMap = new Map(normalizeTasks(tasks).map((task) => [task.id, task]));
    for (const operation of rawOperations) {
        if (operation?.type === 'upsert') {
            const task = normalizeTask(operation.task);
            taskMap.set(task.id, task);
            continue;
        }
        if (operation?.type === 'delete') {
            const id = String(operation.id || '').trim();
            if (!id || id.length > 128) {
                const error = new Error('Invalid todo delete operation');
                error.statusCode = 400;
                throw error;
            }
            taskMap.delete(id);
            continue;
        }
        const error = new Error('Unsupported todo operation');
        error.statusCode = 400;
        throw error;
    }

    if (taskMap.size > MAX_TASKS) {
        const error = new Error(`Todo list cannot exceed ${MAX_TASKS} items`);
        error.statusCode = 400;
        throw error;
    }
    return [...taskMap.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function mergeLegacyTasks(currentTasks, incomingTasks) {
    const merged = new Map(normalizeTasks(currentTasks).map((task) => [task.id, task]));
    for (const incoming of normalizeTasks(incomingTasks)) {
        const current = merged.get(incoming.id);
        if (!current || incoming.updatedAt >= current.updatedAt) {
            merged.set(incoming.id, incoming);
        }
    }
    if (merged.size > MAX_TASKS) {
        const error = new Error(`Todo list cannot exceed ${MAX_TASKS} items`);
        error.statusCode = 400;
        throw error;
    }
    return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
}

async function syncLegacyClient(req, res) {
    const incomingTasks = normalizeTasks(req.body?.tasks);
    const ownerName = normalizeOwnerName(req.body?.ownerName || req.user.username);

    // Compatibility clients may add/update tasks, but cannot delete remote
    // tasks that their stale snapshot may never have observed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await TodoList.findById(req.user._id);
        const expectedRevision = revisionOf(current);
        const tasks = mergeLegacyTasks(current?.tasks || [], incomingTasks);
        const updated = await commitTasks({
            userId: req.user._id,
            expectedRevision,
            tasks,
            ownerName: ownerName || normalizeOwnerName(current?.ownerName)
        });
        if (updated) {
            res.setHeader('Deprecation', 'true');
            return sendSnapshot(res, updated);
        }
    }
    return sendConflict(res, req.user._id);
}

function sendControllerError(res, error, label) {
    console.error(label, error);
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
        success: false,
        code: statusCode === 400 ? 'TODO_INVALID_REQUEST' : 'TODO_SERVER_ERROR',
        error: statusCode === 500 ? 'Server Error' : error.message
    });
}

exports.getTodos = async (req, res) => {
    try {
        const todoList = await TodoList.findById(req.user._id);
        return sendSnapshot(res, todoList);
    } catch (error) {
        return sendControllerError(res, error, 'Get todos error:');
    }
};

exports.syncTodos = async (req, res) => {
    try {
        const expectedRevision = parseRevision(req);
        if (expectedRevision === null) {
            return await syncLegacyClient(req, res);
        }
        const tasks = normalizeTasks(req.body?.tasks);
        const updated = await commitTasks({
            userId: req.user._id,
            expectedRevision,
            tasks,
            ownerName: normalizeOwnerName(req.body?.ownerName || req.user.username)
        });
        if (!updated) return sendConflict(res, req.user._id);
        return sendSnapshot(res, updated);
    } catch (error) {
        return sendControllerError(res, error, 'Sync todos error:');
    }
};

exports.mutateTodos = async (req, res) => {
    try {
        const expectedRevision = parseRevision(req);
        if (expectedRevision === null) {
            return res.status(428).json({
                success: false,
                code: 'TODO_REVISION_REQUIRED',
                error: 'revision or If-Match is required'
            });
        }

        const current = await TodoList.findById(req.user._id);
        if (revisionOf(current) !== expectedRevision) {
            return sendConflict(res, req.user._id);
        }
        const tasks = applyOperations(current?.tasks || [], req.body?.operations);
        const updated = await commitTasks({
            userId: req.user._id,
            expectedRevision,
            tasks,
            ownerName: normalizeOwnerName(req.body?.ownerName || current?.ownerName || req.user.username)
        });
        if (!updated) return sendConflict(res, req.user._id);
        return sendSnapshot(res, updated);
    } catch (error) {
        return sendControllerError(res, error, 'Mutate todos error:');
    }
};

exports.applyOperations = applyOperations;
exports.mergeLegacyTasks = mergeLegacyTasks;
exports.parseRevision = parseRevision;
