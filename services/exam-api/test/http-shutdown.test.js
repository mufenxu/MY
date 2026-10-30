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

    // closeHttpServer 的兜底定时器是 unref 的（生产上由 HTTP socket 自己维持事件循环）。
    // 这个假 server 没有任何 handle，事件循环会提前排空、定时器永不触发，
    // 测试就会以 "Promise resolution is still pending" 被取消。这里手动保活。
    const keepAlive = setInterval(() => {}, 1000);
    try {
        await closeHttpServer(server, { timeoutMs: 5 });
    } finally {
        clearInterval(keepAlive);
    }
    assert.equal(forced, true);
});
