const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildWecomPayload,
    isWecomEnabled,
    isWecomResponseOk,
    normalizeRequestTimeout,
} = require('../services/wecomNotification');

test('WeCom payload normalizes recipients and optional fields once', () => {
    const payload = buildWecomPayload({
        qywxToUser: ' user-a ',
        qywxToParty: ' ',
        qywxToTag: 'tag-a',
        qywxAgentId: '42',
        qywxSafe: true,
    }, 'hello');

    assert.deepEqual(payload, {
        msg_type: 'text',
        data: { content: 'hello' },
        touser: 'user-a',
        totag: 'tag-a',
        agent_id: 42,
        safe: 1,
    });
});

test('WeCom enablement and response checks share strict semantics', () => {
    const config = { qywxEnabled: true, qywxApiKey: 'key', qywxToUser: 'user-a' };
    assert.equal(isWecomEnabled(config), true);
    assert.equal(isWecomEnabled({ ...config, qywxToUser: '' }), false);
    assert.equal(isWecomResponseOk({ errcode: 0, detail: { errcode: 0 } }), true);
    assert.equal(isWecomResponseOk({ errcode: 0, detail: { errcode: 1 } }), false);
});

test('WeCom request timeout stays inside the service boundary', () => {
    assert.equal(normalizeRequestTimeout('100'), 1000);
    assert.equal(normalizeRequestTimeout('50000'), 30000);
    assert.equal(normalizeRequestTimeout('invalid'), 8000);
});
