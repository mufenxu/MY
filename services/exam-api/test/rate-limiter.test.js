const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const { MongoRateLimitStore } = require('../src/middleware/rateLimiter');

test('fallback rate limiter prunes expired keys and fails closed at its hard limit', () => {
    const store = new MongoRateLimitStore('test_rate_limit', { memoryMaxEntries: 2 });
    store.init({ windowMs: 100 });

    assert.equal(store.incrementMemory('a', 1000).totalHits, 1);
    assert.equal(store.incrementMemory('b', 1000).totalHits, 1);
    assert.equal(store.memoryHits.size, 2);
    assert.equal(store.incrementMemory('c', 1000).totalHits, Number.MAX_SAFE_INTEGER);
    assert.equal(store.memoryHits.has('c'), false);

    assert.equal(store.incrementMemory('c', 1101).totalHits, 1);
    assert.equal(store.memoryHits.size, 1);
    assert.equal(store.memoryHits.has('c'), true);
});
