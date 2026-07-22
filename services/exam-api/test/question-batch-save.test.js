const test = require('node:test');
const assert = require('node:assert/strict');

const {
    assertPersistedQuestionState,
    assertQuestionRevisions,
    buildQuestionSavePlan,
    canUseNonTransactionalReplacement,
    replaceCategoryQuestions,
} = require('../src/utils/questionBatchSave');

test('batch revision guard rejects stale or deleted persisted questions', () => {
    const current = [{ _id: '0123456789abcdef01234567', revision: 4 }];
    assert.doesNotThrow(() => assertQuestionRevisions([
        { _id: current[0]._id, revision: 4 },
        { type: 'single' },
    ], current));
    assert.throws(
        () => assertQuestionRevisions([{ _id: current[0]._id, revision: 3 }], current),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
    assert.throws(
        () => assertQuestionRevisions([{ _id: '1123456789abcdef01234567', revision: 1 }], current),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
    assert.throws(
        () => assertQuestionRevisions([{ _id: current[0]._id }], current),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
});

test('persisted revision guard rejects changes made after the request snapshot', () => {
    const expected = [
        { _id: '0123456789abcdef01234567', revision: 2 },
        { _id: '1123456789abcdef01234567' },
    ];
    assert.doesNotThrow(() => assertPersistedQuestionState(expected, expected));
    assert.throws(
        () => assertPersistedQuestionState(expected, [
            { ...expected[0], revision: 3 },
            expected[1],
        ]),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
    assert.throws(
        () => assertPersistedQuestionState(expected, [expected[0]]),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
});

test('persisted revision guard distinguishes an intentional delete from a stale load', () => {
    const baseline = [
        { _id: '0123456789abcdef01234567', revision: 2 },
        { _id: '1123456789abcdef01234567', revision: 1 },
    ];
    const savedQuestions = [baseline[0]];
    assert.doesNotThrow(() => assertPersistedQuestionState(baseline, baseline));
    assert.doesNotThrow(() => assertQuestionRevisions(savedQuestions, baseline));
    assert.throws(
        () => assertPersistedQuestionState(savedQuestions, baseline),
        (error) => error.statusCode === 409 && error.code === 'QUESTION_REVISION_CONFLICT',
    );
});

test('non-transactional replacement is forbidden in production', () => {
    assert.equal(canUseNonTransactionalReplacement('production'), false);
    assert.equal(canUseNonTransactionalReplacement('development'), true);
    assert.equal(canUseNonTransactionalReplacement('test'), true);
});

test('buildQuestionSavePlan keeps identities, ordering, and scope assignment', () => {
    const oldQuestions = [{
        _id: 'q-1',
        type: 'single',
        content: 'Existing',
        options: [{ label: 'A', value: 'a' }],
        answer: ['a'],
        analysis: 'Existing analysis',
        analysisSource: 'ai',
    }];
    const plan = buildQuestionSavePlan({
        oldQuestions,
        questionsToSave: [
            { ...oldQuestions[0] },
            { type: 'judge', content: 'New', options: [], answer: ['true'], analysis: '' },
        ],
        categoryId: 'category-1',
        scopeAssignment: { scopeType: 'personal', ownerOpenid: 'owner-1' },
    });

    assert.equal(plan.questions[0]._id, 'q-1');
    assert.equal(plan.questions[0].analysisSource, 'ai');
    assert.equal(plan.questions[1]._id, undefined);
    assert.equal(plan.questions[1].sortOrder, 1);
    assert.equal(plan.questions[1].ownerOpenid, 'owner-1');
    assert.deepEqual(plan.invalidatedAiQuestionIds, []);
});

test('buildQuestionSavePlan invalidates removed and materially changed AI analyses', () => {
    const oldQuestions = [
        { _id: 'removed', type: 'judge', content: 'Old', options: [], answer: ['true'], analysis: 'A' },
        { _id: 'changed', type: 'judge', content: 'Before', options: [], answer: ['true'], analysis: 'B' },
    ];
    const plan = buildQuestionSavePlan({
        oldQuestions,
        questionsToSave: [{ ...oldQuestions[1], content: 'After' }],
        categoryId: 'category-1',
        scopeAssignment: { scopeType: 'admin' },
    });

    assert.deepEqual(new Set(plan.invalidatedAiQuestionIds), new Set(['removed', 'changed']));
    assert.equal(plan.questions[0].analysisSource, 'manual');
});

test('buildQuestionSavePlan preserves unchanged revisions and increments changed questions', () => {
    const oldQuestion = {
        _id: '0123456789abcdef01234567',
        revision: 7,
        type: 'single',
        content: 'Existing',
        options: [{ label: 'A', value: 'Alpha' }, { label: 'B', value: 'Beta' }],
        answer: ['A'],
        analysis: 'Analysis',
        analysisSource: 'manual',
        categoryId: '1123456789abcdef01234567',
        scopeType: 'admin',
        ownerOpenid: null,
        sortOrder: 0,
    };
    const baseOptions = {
        oldQuestions: [oldQuestion],
        categoryId: oldQuestion.categoryId,
        scopeAssignment: { scopeType: 'admin', ownerOpenid: null },
    };

    const unchanged = buildQuestionSavePlan({
        ...baseOptions,
        questionsToSave: [{ ...oldQuestion }],
    });
    const changed = buildQuestionSavePlan({
        ...baseOptions,
        questionsToSave: [{ ...oldQuestion, content: 'Changed' }],
    });

    assert.equal(unchanged.questions[0].revision, 7);
    assert.equal(changed.questions[0].revision, 8);
});

test('version write failure rolls back the batch replacement transaction', async () => {
    const originalQuestions = [{ _id: 'old-question' }];
    const state = {
        questions: [...originalQuestions],
        categoryCount: 1,
        rolledBack: false,
        sessionEnded: false,
    };
    const session = {
        id: 'batch-session',
        async withTransaction(callback) {
            const snapshot = {
                questions: [...state.questions],
                categoryCount: state.categoryCount,
            };
            try {
                await callback();
            } catch (error) {
                state.questions = snapshot.questions;
                state.categoryCount = snapshot.categoryCount;
                state.rolledBack = true;
                throw error;
            }
        },
        endSession() {
            state.sessionEnded = true;
        },
    };
    class FakeQuestionModel {
        constructor(value) {
            this.value = value;
        }

        async validate() {}

        static find() {
            return {
                select() { return this; },
                session(value) {
                    assert.equal(value, session);
                    return this;
                },
                async lean() { return [...state.questions]; },
            };
        }

        static async deleteMany(query, options) {
            assert.equal(options.session, session);
            state.questions = [];
        }

        static async insertMany(questions, options) {
            assert.equal(options.session, session);
            state.questions = [...questions];
        }
    }
    const Category = {
        async findOneAndUpdate(query, update, options) {
            assert.equal(options.session, session);
            state.categoryCount = update.count;
        },
    };
    const mongooseInstance = {
        connection: {
            client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } },
        },
        async startSession() {
            return session;
        },
    };

    await assert.rejects(
        replaceCategoryQuestions({
            questionQuery: { categoryId: 'category-1' },
            categoryQuery: { _id: 'category-1' },
            categoryUpdate: { count: 1 },
            questions: [{ _id: 'new-question' }],
            expectedQuestions: originalQuestions,
            versionEntries: [{ question: { _id: 'new-question' }, action: 'create' }],
            Category,
            QuestionModel: FakeQuestionModel,
            mongooseInstance,
            recordVersions: async ({ session: versionSession }) => {
                assert.equal(versionSession, session);
                throw new Error('version write failed');
            },
        }),
        /version write failed/,
    );

    assert.deepEqual(state.questions, originalQuestions);
    assert.equal(state.categoryCount, 1);
    assert.equal(state.rolledBack, true);
    assert.equal(state.sessionEnded, true);
});
