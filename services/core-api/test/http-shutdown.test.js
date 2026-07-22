const test = require('node:test');
const assert = require('node:assert/strict');
const { closeHttpServer, withDeadline } = require('../services/httpShutdown');

test('HTTP shutdown closes idle connections and waits for completion', async () => {
    let closedIdle = false;
    const server = {
        close(callback) { setImmediate(callback); },
        closeIdleConnections() { closedIdle = true; },
    };

    await closeHttpServer(server, { timeoutMs: 1000 });
    assert.equal(closedIdle, true);
});

test('HTTP shutdown force closes connections at the deadline', async () => {
    let callback;
    let forced = false;
    const server = {
        close(closeCallback) { callback = closeCallback; },
        closeAllConnections() {
            forced = true;
            callback();
        },
    };

    await closeHttpServer(server, { timeoutMs: 1000, onForce: () => { forced = true; } });
    assert.equal(forced, true);
});

test('runtime shutdown operations have a deadline', async () => {
    await assert.rejects(
        withDeadline(new Promise(() => {}), { timeoutMs: 1000, message: 'deadline reached' }),
        /deadline reached/,
    );
});
