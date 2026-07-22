const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const {
    diagnoseQuestion,
    getContentFingerprint,
    scanQuestionQuality,
} = require('../src/services/questionQualityService');
const consoleValidator = require('../src/validators/consoleValidator');
const manageValidator = require('../src/validators/manageValidator');

function makeCursorFactory(questions) {
    return () => (async function* iterate() {
        for (const question of questions) yield question;
    }());
}

test('quality diagnosis catches content and answer defects without exposing full records', () => {
    const issues = diagnoseQuestion({
        type: 'single',
        content: 'Question',
        options: [
            { label: 'A', value: 'Alpha' },
            { label: 'A', value: '' },
        ],
        answer: ['B', 'C'],
        analysis: '',
        updateTime: '2024-01-01T00:00:00.000Z',
    }, {
        duplicateCount: 2,
        staleBefore: new Date('2025-01-01T00:00:00.000Z'),
    });
    const codes = new Set(issues.map((issue) => issue.code));

    assert.deepEqual(codes, new Set([
        'missing_analysis',
        'duplicate_option_label',
        'empty_option',
        'answer_not_in_options',
        'single_answer_count',
        'duplicate_content',
        'stale_question',
    ]));
    assert.equal(getContentFingerprint('  Ａ  B '), getContentFingerprint('a b'));
});

test('quality scan is bounded, paginates problematic questions, and reports truncation', async () => {
    const questions = [
        {
            _id: 'q1',
            categoryId: 'c1',
            type: 'single',
            content: 'Duplicate',
            options: [{ label: 'A', value: 'Yes' }, { label: 'B', value: 'No' }],
            answer: ['A'],
            analysis: '',
            updateTime: '2025-01-01T00:00:00.000Z',
        },
        {
            _id: 'q2',
            categoryId: 'c1',
            type: 'single',
            content: ' duplicate ',
            options: [{ label: 'A', value: 'Yes' }, { label: 'B', value: 'No' }],
            answer: ['A'],
            analysis: 'OK',
            updateTime: '2026-07-01T00:00:00.000Z',
        },
    ];

    const result = await scanQuestionQuality({
        query: { scopeType: 'admin' },
        page: 1,
        limit: 1,
        issue: 'duplicate_content',
        staleDays: 365,
        scanLimit: 2,
        now: new Date('2026-07-22T00:00:00.000Z'),
        cursorFactory: makeCursorFactory(questions),
        totalDocuments: 3,
    });

    assert.equal(result.list.length, 1);
    assert.equal(result.total, 2);
    assert.equal(result.summary.scanned, 2);
    assert.equal(result.summary.problematic, 2);
    assert.equal(result.summary.issues.duplicate_content, 2);
    assert.equal(result.summary.truncated, true);
    assert.equal(result.list[0].issues[0].code, 'duplicate_content');
});

test('quality and version validators enforce bounded pagination and managed scopes', () => {
    const id = '0123456789abcdef01234567';
    assert.equal(consoleValidator.questionQuality.query.validate({ scanLimit: 10000 }).error, undefined);
    assert.ok(consoleValidator.questionQuality.query.validate({ scanLimit: 10001 }).error);
    assert.equal(manageValidator.questionQuality.query.validate({ scopeType: 'demo' }).error, undefined);
    assert.ok(manageValidator.questionQuality.query.validate({ scopeType: 'personal' }).error);
    assert.equal(manageValidator.questionVersionParam.params.validate({ id, revision: 2 }).error, undefined);
    assert.ok(manageValidator.questionVersionParam.params.validate({ id, revision: 0 }).error);
});
