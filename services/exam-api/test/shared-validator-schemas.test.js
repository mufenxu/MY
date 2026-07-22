const test = require('node:test');
const assert = require('node:assert/strict');
const consoleValidator = require('../src/validators/consoleValidator');
const manageValidator = require('../src/validators/manageValidator');

test('shared category schemas preserve console and manage scope behavior', () => {
    const category = {
        name: 'Networking',
        passingScore: 80,
        majorCategoryId: null,
    };
    assert.equal(consoleValidator.createCategory.body.validate(category).error, undefined);
    assert.equal(manageValidator.createCategory.body.validate({ ...category, scopeType: 'admin' }).error, undefined);
    assert.match(
        consoleValidator.createCategory.body.validate({ ...category, scopeType: 'admin' }).error.message,
        /scopeType/
    );
});

test('shared batch and AI schemas keep defaults and ObjectId validation', () => {
    const validId = '0123456789abcdef01234567';
    const batch = {
        questions: [{ type: 'single', content: 'Question', answer: ['A'] }],
        baseQuestions: [],
    };
    assert.equal(consoleValidator.batchUpdateQuestions.body.validate(batch).error, undefined);
    assert.equal(manageValidator.batchUpdateQuestions.body.validate({ ...batch, scopeType: 'demo' }).error, undefined);
    assert.match(
        consoleValidator.batchUpdateQuestions.body.validate({ questions: batch.questions }).error.message,
        /baseQuestions/,
    );
    assert.equal(consoleValidator.batchUpdateQuestions.body.validate({
        questions: [{ _id: validId, revision: 3, type: 'single', content: 'Question', answer: ['A'] }],
        baseQuestions: [{ _id: validId, revision: 3 }],
    }).error, undefined);

    const aiResult = consoleValidator.generateAiAnalyses.body.validate({ questionIds: [validId] });
    assert.equal(aiResult.error, undefined);
    assert.deepEqual(aiResult.value, { limit: 10, forceRefresh: false, questionIds: [validId] });
    assert.ok(consoleValidator.generateAiAnalyses.body.validate({ questionIds: ['invalid'] }).error);
});
