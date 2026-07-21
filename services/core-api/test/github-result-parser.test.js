const test = require('node:test');
const assert = require('node:assert/strict');
const {
    extractWorkflowSummary,
    normalizeWorkflowResults,
    pickFirst
} = require('../utils/githubResultParser');

test('workflow result parser normalizes nested, map, and line-delimited payloads', () => {
    assert.deepEqual(normalizeWorkflowResults({ results: [{ host: 'nested', success: true }] }), [
        { host: 'nested', success: true }
    ]);
    assert.deepEqual(normalizeWorkflowResults({ alpha: { ok: true }, beta: { status: 'failed' } }), [
        { host: 'alpha', ok: true },
        { host: 'beta', status: 'failed' }
    ]);
    assert.deepEqual(normalizeWorkflowResults('{"host":"one"}\n{"host":"two"}'), [
        { host: 'one' },
        { host: 'two' }
    ]);
});

test('workflow result parser marks split success and failed lists', () => {
    assert.deepEqual(normalizeWorkflowResults({ success: ['alpha'], failed: ['beta'] }), [
        { host: 'alpha', success: true },
        { host: 'beta', success: false }
    ]);
});

test('workflow summary keeps callback and artifact missing-value contracts', () => {
    const body = {
        stats: { success_count: '3', failed_count: 1 },
        workflow_run: { conclusion: 'success' }
    };
    assert.deepEqual(extractWorkflowSummary(body, [], { missingValue: undefined, includeNestedStatus: true }), {
        total: 4,
        success: 3,
        failed: 1,
        status: undefined,
        workflow_conclusion: 'success'
    });
    assert.deepEqual(extractWorkflowSummary({}, [{ host: 'alpha' }]), {
        total: 1,
        success: null,
        failed: null,
        status: undefined,
        workflow_conclusion: undefined
    });
    assert.deepEqual(extractWorkflowSummary({}, [], { missingValue: undefined }), {
        total: 0,
        success: undefined,
        failed: undefined,
        status: undefined,
        workflow_conclusion: undefined
    });
});

test('pickFirst ignores only absent and empty values', () => {
    assert.equal(pickFirst(undefined, null, '', 0, 1), 0);
    assert.equal(pickFirst(undefined, false, true), false);
});
