const assert = require('node:assert/strict');
const test = require('node:test');

const { closeHttpServer } = require('../src/services/httpShutdown');

test('HTTP shutdown waits for close completion', async () => {
    let idleClosed = false;
    const server = {
        close(callback) { setImmediate(callback); },
        closeIdleConnections() { idleClosed = true; },
    };

    await closeHttpServer(server, { timeoutMs: 100 });
    assert.equal(idleClosed, true);
});

test('HTTP shutdown force-closes connections at the deadline', async () => {
    let callback;
    let forced = false;
    const server = {
        close(closeCallback) { callback = closeCallback; },
        closeAllConnections() {
            forced = true;
            callback();
        },
    };

    await closeHttpServer(server, { timeoutMs: 5 });
    assert.equal(forced, true);
});
