const test = require('node:test');
const assert = require('node:assert/strict');

const { buildQuestionSavePlan } = require('../src/utils/questionBatchSave');

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
