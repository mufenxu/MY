const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_readiness_test';
process.env.EXAM_JWT_SECRET ||= 'exam-readiness-test-secret-at-least-32-characters';

const { readinessHandler, setRuntimeReady } = require('../src/runtimeState');
const { initializeCriticalIndexes } = require('../src/server');

function getReadinessResponse() {
    const response = {
        statusCode: 0,
        body: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    readinessHandler({}, response);
    return response;
}

test('readiness fails before initialization and during shutdown', () => {
    setRuntimeReady(false);
    const notReady = getReadinessResponse();
    assert.equal(notReady.statusCode, 503);
    assert.equal(notReady.headers['Cache-Control'], 'no-store');
    setRuntimeReady(true);
    assert.equal(getReadinessResponse().statusCode, 200);
    setRuntimeReady(false);
    assert.equal(getReadinessResponse().statusCode, 503);
});

test('critical unique indexes must finish before runtime can become ready', async () => {
    const calls = [];
    const models = ['Admin', 'ExamProgress', 'ExamResult'].map((name) => ({
        async init() { calls.push(name); },
    }));
    await initializeCriticalIndexes(models);
    assert.deepEqual(calls.sort(), ['Admin', 'ExamProgress', 'ExamResult']);

    await assert.rejects(
        initializeCriticalIndexes([{ init: async () => { throw new Error('index conflict'); } }]),
        /index conflict/,
    );
});
