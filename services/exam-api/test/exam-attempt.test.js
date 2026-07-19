const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const {
    assertCurrentExamAttempt,
    assertExamAttemptCanSubmit,
    resolveExamAttempt,
    startOrResumeExamAttempt,
    toAttemptPayload,
} = require('../src/services/examAttemptService');

class FakeProgressModel {
    constructor() {
        this.state = null;
    }

    async findOneAndUpdate(query, update) {
        if (!this.state && update.$setOnInsert) {
            this.state = {
                _id: 'progress-1',
                attemptId: null,
                attemptSubmittedAt: null,
                ...query,
                ...update.$setOnInsert,
            };
            return { ...this.state };
        }

        if (query._id && (
            this.state._id !== query._id
            || (this.state.attemptId || null) !== (query.attemptId || null)
        )) {
            return null;
        }

        if (update.$set) Object.assign(this.state, update.$set);
        return { ...this.state };
    }

    async findOne() {
        return this.state ? { ...this.state } : null;
    }
}

test('concurrent start and retry calls converge on one persisted attempt', async () => {
    const progressModel = new FakeProgressModel();
    const now = new Date('2026-07-19T00:00:00.000Z');
    const options = {
        progressModel,
        userId: 'user-1',
        category: { _id: 'category-1', duration: 2, scopeType: 'personal' },
        now,
        submissionGraceMs: 30000,
    };

    const attempts = await Promise.all(Array.from({ length: 8 }, () => startOrResumeExamAttempt(options)));
    assert.equal(new Set(attempts.map((item) => item.attemptId)).size, 1);
    assert.equal(attempts[0].durationSeconds, 120);
    assert.equal(new Date(attempts[0].deadlineAt).getTime(), now.getTime() + 120000);

    const requestId = '94f2f09e-d13f-477c-9e54-e8689ea326b1';
    const restarted = await Promise.all(Array.from({ length: 4 }, () => startOrResumeExamAttempt({
        ...options,
        restart: true,
        requestId,
    })));
    assert.equal(new Set(restarted.map((item) => item.attemptId)).size, 1);
    assert.notEqual(restarted[0].attemptId, attempts[0].attemptId);
});

test('submission grace accepts network delay but rejects a late attempt', () => {
    const progress = {
        attemptId: 'attempt-1',
        attemptDurationSeconds: 60,
        deadlineAt: new Date('2026-07-19T00:01:00.000Z'),
    };

    assert.doesNotThrow(() => assertExamAttemptCanSubmit({
        progress,
        attemptId: 'attempt-1',
        categoryDuration: 1,
        now: new Date('2026-07-19T00:01:30.000Z'),
        submissionGraceMs: 30000,
    }));
    assert.throws(() => assertExamAttemptCanSubmit({
        progress,
        attemptId: 'attempt-1',
        categoryDuration: 1,
        now: new Date('2026-07-19T00:01:30.001Z'),
        submissionGraceMs: 30000,
    }), /考试已超时/);

    assert.equal(toAttemptPayload(progress, {
        now: new Date('2026-07-19T00:01:31.000Z'),
        submissionGraceMs: 30000,
    }).canSubmit, false);

    assert.throws(() => assertExamAttemptCanSubmit({
        progress: null,
        attemptId: '',
        categoryDuration: 1,
    }), /版本已更新/);
    assert.throws(() => assertExamAttemptCanSubmit({
        progress: null,
        attemptId: '',
        categoryDuration: 0,
    }), /版本已更新/);
});

test('timed progress mutations must stay bound to the current attempt', () => {
    const progress = { attemptId: 'attempt-current' };
    assert.throws(() => assertCurrentExamAttempt({
        progress,
        attemptId: '',
        categoryDuration: 10,
    }), /版本已更新/);
    assert.throws(() => assertCurrentExamAttempt({
        progress,
        attemptId: 'attempt-stale',
        categoryDuration: 10,
    }), /场次已失效/);
    assert.doesNotThrow(() => assertCurrentExamAttempt({
        progress,
        attemptId: 'attempt-current',
        categoryDuration: 10,
    }));
});

test('legacy clients cannot bind to another device current attempt', () => {
    const active = {
        attemptId: 'attempt-current',
        attemptSubmittedAt: null,
    };
    assert.throws(() => resolveExamAttempt({
        progresses: [active],
        attemptId: '',
        categoryDuration: 10,
    }), /版本已更新/);

    assert.throws(() => resolveExamAttempt({
        progresses: [{ ...active, attemptSubmittedAt: new Date() }],
        attemptId: '',
        categoryDuration: 10,
    }), /版本已更新/);
    assert.throws(() => resolveExamAttempt({
        progresses: [active, { ...active, attemptId: 'attempt-other' }],
        attemptId: '',
        categoryDuration: 10,
    }), /版本已更新/);
    assert.throws(() => resolveExamAttempt({
        progresses: [],
        attemptId: '',
        categoryDuration: 10,
    }), /版本已更新/);
});

test('explicit attempt ids remain strict', () => {
    const current = { attemptId: 'attempt-current', attemptSubmittedAt: null };
    const resolved = resolveExamAttempt({
        progresses: [current],
        attemptId: 'attempt-current',
        categoryDuration: 10,
    });
    assert.equal(resolved.attemptId, 'attempt-current');

    assert.throws(() => resolveExamAttempt({
        progresses: [current],
        attemptId: 'attempt-stale',
        categoryDuration: 10,
    }), /考试场次已失效/);
});

test('progress reads never create or restart an exam attempt', () => {
    const controllerPath = path.join(__dirname, '..', 'src', 'controllers', 'clientController.js');
    const source = fs.readFileSync(controllerPath, 'utf8');
    const start = source.indexOf('exports.getProgress =');
    const end = source.indexOf('exports.clearProgress =', start);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(source.slice(start, end), /startOrResumeExamAttempt|findOneAndUpdate|\.create\(/);
});

test('exam write handlers never create a replacement attempt', () => {
    const controllerPath = path.join(__dirname, '..', 'src', 'controllers', 'clientController.js');
    const source = fs.readFileSync(controllerPath, 'utf8');
    const ranges = [
        ['exports.submitExam =', 'exports.getLatestResult ='],
        ['exports.saveProgress =', 'exports.getProgress ='],
        ['exports.clearProgress =', 'exports.getWrongQuestions ='],
    ];

    ranges.forEach(([startMarker, endMarker]) => {
        const start = source.indexOf(startMarker);
        const end = source.indexOf(endMarker, start);
        const handler = source.slice(start, end);
        assert.ok(start >= 0 && end > start);
        assert.match(handler, /resolveExamAttempt/);
        assert.doesNotMatch(handler, /startOrResumeExamAttempt/);
    });
});

test('starting a deadline preserves legacy answers unless restart is explicit', async () => {
    const progressModel = new FakeProgressModel();
    progressModel.state = {
        _id: 'progress-legacy',
        userId: 'user-1',
        categoryId: 'category-1',
        mode: 'exam',
        attemptId: null,
        attemptSubmittedAt: null,
        currentIndex: 3,
        answers: { question: ['A'] },
    };

    await startOrResumeExamAttempt({
        progressModel,
        userId: 'user-1',
        category: { _id: 'category-1', duration: 2, scopeType: 'personal' },
        now: new Date('2026-07-19T00:00:00.000Z'),
    });

    assert.equal(progressModel.state.currentIndex, 3);
    assert.deepEqual(progressModel.state.answers, { question: ['A'] });
});
