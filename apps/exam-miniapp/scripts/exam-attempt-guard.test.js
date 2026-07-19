const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    canUseExamSession,
    requiresServerExamAttempt,
} = require('../miniprogram/utils/examAttemptGuard');

test('only personal exam mode requires a server-side attempt', () => {
    assert.equal(requiresServerExamAttempt('exam', 'personal'), true);
    assert.equal(requiresServerExamAttempt('exam', 'demo'), false);
    assert.equal(requiresServerExamAttempt('practice', 'personal'), false);
});

test('a personal exam stays blocked until attempt initialization succeeds', () => {
    assert.equal(canUseExamSession('exam', 'personal', false), false);
    assert.equal(canUseExamSession('exam', 'personal', true), true);
    assert.equal(canUseExamSession('practice', 'personal', false), true);
    assert.equal(canUseExamSession('exam', 'demo', false), true);
});

test('exam page guards persistence and submission and renders a retry state', () => {
    const pageRoot = path.join(__dirname, '..', 'miniprogram', 'pages', 'exam');
    const pageSource = fs.readFileSync(path.join(pageRoot, 'exam.ts'), 'utf8');
    const template = fs.readFileSync(path.join(pageRoot, 'exam.wxml'), 'utf8');

    const saveStart = pageSource.indexOf('saveProgress(immediate = false)');
    const clearStart = pageSource.indexOf('clearSavedProgress()', saveStart);
    const submitStart = pageSource.indexOf('async onSubmit(isAuto = false)');
    const restoreStart = pageSource.indexOf('buildReciteRestoreState', submitStart);
    assert.match(pageSource.slice(saveStart, clearStart), /isExamSessionReady\(\)/);
    assert.match(pageSource.slice(submitStart, restoreStart), /isExamSessionReady\(\)/);
    assert.match(template, /attemptInitializationError/);
    assert.match(template, /bindtap="onRetryAttemptInitialization"/);
    assert.match(template, /main-content[\s\S]*?!attemptInitializationError/);
});
