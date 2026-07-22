const test = require('node:test');
const assert = require('node:assert/strict');
const { getExternalHttpOptions, isExternalHttpTimeout } = require('../utils/externalHttp');

test('external HTTP options enforce bounded timeouts and response sizes', () => {
    assert.equal(getExternalHttpOptions({ timeoutMs: 1 }).timeout, 1000);
    assert.equal(getExternalHttpOptions({ timeoutMs: 999999 }).timeout, 30000);
    assert.equal(getExternalHttpOptions({ maxRedirects: 99 }).maxRedirects, 5);
    assert.ok(getExternalHttpOptions().maxContentLength <= 5 * 1024 * 1024);
});

test('external HTTP timeout detection covers axios and abort errors', () => {
    assert.equal(isExternalHttpTimeout({ code: 'ECONNABORTED' }), true);
    assert.equal(isExternalHttpTimeout({ code: 'ETIMEDOUT' }), true);
    assert.equal(isExternalHttpTimeout({ name: 'AbortError' }), true);
    assert.equal(isExternalHttpTimeout({ code: 'ECONNREFUSED' }), false);
});
