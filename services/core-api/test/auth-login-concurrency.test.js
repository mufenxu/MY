const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'core-login-concurrency-secret';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authService = require('../services/authService');

function queryResult(factory) {
    let promise;
    const getPromise = () => {
        promise ||= Promise.resolve().then(factory);
        return promise;
    };
    return {
        select() { return getPromise(); },
        then(resolve, reject) { return getPromise().then(resolve, reject); }
    };
}

test('admin login failures increment atomically and lock exactly at the threshold', async () => {
    const originalCompare = bcrypt.compare;
    const originalFindOne = User.findOne;
    const originalFindOneAndUpdate = User.findOneAndUpdate;
    const state = { failedLoginAttempts: 0, lockUntil: 0 };
    let sawPipelineUpdate = false;

    bcrypt.compare = async () => false;
    User.findOne = () => queryResult(() => ({
        _id: 'admin-concurrent',
        userId: 'admin',
        password: 'hash',
        role: 'admin',
        status: 'active',
        tokenVersion: 0,
        ...state
    }));
    User.findOneAndUpdate = (_filter, update) => queryResult(() => {
        assert.ok(Array.isArray(update), 'failed login must use an aggregation pipeline update');
        sawPipelineUpdate = true;
        const now = Date.now();
        if (state.lockUntil > now) return null;
        if (state.lockUntil > 0 && state.lockUntil <= now) state.failedLoginAttempts = 0;
        state.failedLoginAttempts += 1;
        if (state.failedLoginAttempts >= 5) state.lockUntil = now + 15 * 60 * 1000;
        return { _id: 'admin-concurrent', ...state };
    });

    try {
        const results = await Promise.allSettled(
            Array.from({ length: 8 }, () => authService.adminLogin('admin', 'wrong'))
        );
        const statusCodes = results.map((result) => result.reason?.statusCode).sort();
        assert.deepEqual(statusCodes, [401, 401, 401, 401, 423, 423, 423, 423]);
        assert.equal(state.failedLoginAttempts, 5);
        assert.ok(state.lockUntil > Date.now());
        assert.equal(sawPipelineUpdate, true);
    } finally {
        bcrypt.compare = originalCompare;
        User.findOne = originalFindOne;
        User.findOneAndUpdate = originalFindOneAndUpdate;
    }
});

test('userId unique index excludes legacy empty identifiers', () => {
    const definition = User.schema.indexes().find(([, options]) => options.name === 'userId_unique_nonempty');
    assert.ok(definition);
    assert.deepEqual(definition[0], { userId: 1 });
    assert.equal(definition[1].unique, true);
    assert.deepEqual(definition[1].partialFilterExpression, {
        userId: { $type: 'string', $gt: '' }
    });
});
