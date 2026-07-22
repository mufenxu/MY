const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const {
    buildQuestionSnapshot,
    getChangedFields,
    recordQuestionVersions,
    updateQuestionWithVersion,
} = require('../src/services/questionVersionService');
const QuestionVersion = require('../src/models/QuestionVersion');

function makeQuestion(overrides = {}) {
    return {
        _id: '0123456789abcdef01234567',
        revision: 1,
        scopeType: 'personal',
        ownerOpenid: 'owner-1',
        categoryId: '1123456789abcdef01234567',
        type: 'single',
        content: 'Original question',
        options: [
            { label: 'A', value: 'Alpha' },
            { label: 'B', value: 'Beta' },
        ],
        answer: ['A'],
        analysis: '',
        analysisSource: 'manual',
        sortOrder: 0,
        ...overrides,
    };
}

test('question snapshots keep only restorable fields and report changes', () => {
    const before = makeQuestion();
    const after = makeQuestion({ content: 'Updated question', analysis: 'Explanation' });
    const snapshot = buildQuestionSnapshot(after);

    assert.equal(snapshot.content, 'Updated question');
    assert.equal(snapshot.categoryId, after.categoryId);
    assert.equal(snapshot.ownerOpenid, undefined);
    assert.deepEqual(getChangedFields(before, after), ['content', 'analysis']);
});

test('versioned update records a baseline and the new revision with actor metadata', async () => {
    const current = makeQuestion();
    let updateQuery;
    let updateDocument;
    const records = [];
    const QuestionModel = {
        async findOne() {
            return current;
        },
        async findOneAndUpdate(query, update) {
            updateQuery = query;
            updateDocument = update;
            return makeQuestion({
                ...update.$set,
                revision: current.revision + update.$inc.revision,
            });
        },
    };
    const QuestionVersionModel = {
        async updateOne(query, update) {
            if (!records.some((record) => record.revision === query.revision)) {
                records.push(update.$setOnInsert);
            }
        },
    };

    const updated = await updateQuestionWithVersion({
        query: { _id: current._id, scopeType: 'personal', ownerOpenid: 'owner-1' },
        update: { content: 'Updated question' },
        actor: {
            actorType: 'console',
            actorId: 'owner-1',
            actorName: 'ops_admin',
            requestId: 'request-1',
        },
        QuestionModel,
        QuestionVersionModel,
    });

    assert.equal(updated.revision, 2);
    assert.equal(updateDocument.$inc.revision, 1);
    assert.equal(updateQuery.$and[1].$or.length, 2);
    assert.deepEqual(records.map((record) => record.revision), [1, 2]);
    assert.equal(records[0].action, 'baseline');
    assert.equal(records[1].action, 'update');
    assert.equal(records[1].actorId, 'owner-1');
    assert.deepEqual(records[1].changedFields, ['content']);
});

test('versioned update rejects a stale concurrent write', async () => {
    const current = makeQuestion({ scopeType: 'admin', ownerOpenid: null });
    const QuestionModel = {
        async findOne() {
            return current;
        },
        async findOneAndUpdate() {
            return null;
        },
    };
    const QuestionVersionModel = { updateOne: async () => {} };

    await assert.rejects(
        updateQuestionWithVersion({
            query: { _id: current._id, scopeType: 'admin' },
            update: { content: 'Stale edit' },
            actor: { actorType: 'admin', actorId: 'admin-1' },
            QuestionModel,
            QuestionVersionModel,
        }),
        (error) => error.statusCode === 409 && /刷新后重试/.test(error.message),
    );
});

test('versioned update keeps the question and both version writes in one transaction', async () => {
    const current = makeQuestion();
    const session = {
        id: 'question-session',
        async withTransaction(callback) { await callback(); },
        async endSession() { this.ended = true; },
    };
    const seenSessions = [];
    const QuestionModel = {
        async findOne() { return current; },
        async findOneAndUpdate(query, update, options) {
            seenSessions.push(['update', options.session.id]);
            return makeQuestion({
                ...update.$set,
                revision: current.revision + update.$inc.revision,
            });
        },
    };
    const QuestionVersionModel = {
        async updateOne(query, update, options) {
            seenSessions.push([`version-${query.revision}`, options.session.id]);
        },
    };
    const mongooseInstance = {
        connection: { client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } } },
        async startSession() { return session; },
    };

    const updated = await updateQuestionWithVersion({
        query: { _id: current._id },
        update: { content: 'Transactional update' },
        actor: { actorType: 'admin', actorId: 'admin-1' },
        QuestionModel,
        QuestionVersionModel,
        mongooseInstance,
    });

    assert.equal(updated.revision, 2);
    assert.deepEqual(seenSessions, [
        ['update', 'question-session'],
        ['version-1', 'question-session'],
        ['version-2', 'question-session'],
    ]);
    assert.equal(session.ended, true);
});

test('versioned update runs restore side effects inside the same transaction', async () => {
    const current = makeQuestion({ revision: 4, content: 'Current' });
    const updated = makeQuestion({ revision: 5, content: 'Restored' });
    const session = {
        async withTransaction(callback) { await callback(); },
        async endSession() {},
    };
    const QuestionModel = {
        async findOne() { return current; },
        async findOneAndUpdate(query, update, options) {
            assert.equal(options.session, session);
            return updated;
        },
    };
    const QuestionVersionModel = {
        async updateOne(filter, update, options) {
            assert.equal(options.session, session);
        },
    };
    const mongooseInstance = {
        connection: { client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } } },
        async startSession() { return session; },
    };
    let sideEffectSession = null;

    await updateQuestionWithVersion({
        query: { _id: current._id },
        update: { content: 'Restored' },
        actor: { actorType: 'admin' },
        action: 'rollback',
        sourceRevision: 2,
        afterUpdate: async ({ current: before, updated: after, session: activeSession }) => {
            assert.equal(before, current);
            assert.equal(after, updated);
            sideEffectSession = activeSession;
        },
        QuestionModel,
        QuestionVersionModel,
        mongooseInstance,
    });

    assert.equal(sideEffectSession, session);
});

test('transaction callback retries keep the request-start revision guard', async () => {
    const current = makeQuestion({ revision: 5 });
    let reads = 0;
    let updates = 0;
    const retry = new Error('transient write conflict');
    const session = {
        async withTransaction(callback) {
            try {
                await callback();
            } catch (error) {
                assert.equal(error, retry);
                await callback();
            }
        },
        async endSession() {},
    };
    const QuestionModel = {
        async findOne() { reads += 1; return current; },
        async findOneAndUpdate(query) {
            updates += 1;
            assert.equal(query.$and[1].$or[0].revision, 5);
            if (updates === 1) throw retry;
            return null;
        },
    };
    const mongooseInstance = {
        connection: { client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } } },
        async startSession() { return session; },
    };

    await assert.rejects(
        updateQuestionWithVersion({
            query: { _id: current._id },
            update: { content: 'Concurrent update' },
            actor: { actorType: 'admin', actorId: 'admin-1' },
            QuestionModel,
            QuestionVersionModel: { updateOne: async () => {} },
            mongooseInstance,
        }),
        (error) => error.statusCode === 409,
    );
    assert.equal(reads, 1);
    assert.equal(updates, 2);
});

test('bulk version writes are idempotent across transaction retries', async () => {
    const stored = new Map();
    const QuestionVersionModel = {
        async bulkWrite(operations, options) {
            assert.equal(options.ordered, false);
            assert.equal(options.session.id, 'session-1');
            operations.forEach(({ updateOne }) => {
                const key = `${updateOne.filter.questionId}:${updateOne.filter.revision}`;
                if (!stored.has(key)) stored.set(key, updateOne.update.$setOnInsert);
            });
        },
    };
    const entries = [{
        question: makeQuestion(),
        action: 'create',
        actor: { actorType: 'console', actorId: 'owner-1' },
    }];

    await recordQuestionVersions({
        entries,
        session: { id: 'session-1' },
        QuestionVersionModel,
    });
    await recordQuestionVersions({
        entries,
        session: { id: 'session-1' },
        QuestionVersionModel,
    });

    assert.equal(stored.size, 1);
    assert.equal(stored.values().next().value.action, 'create');
});

test('question version identity is protected by a unique compound index', () => {
    const indexes = QuestionVersion.schema.indexes();
    const identityIndex = indexes.find(([fields]) => (
        fields.questionId === 1 && fields.revision === 1
    ));

    assert.ok(identityIndex);
    assert.equal(identityIndex[1].unique, true);
});
