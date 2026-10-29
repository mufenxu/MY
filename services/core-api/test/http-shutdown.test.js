const test = require('node:test');
const assert = require('node:assert/strict');
const { closeHttpServer, withDeadline } = require('../services/httpShutdown');

/**
 * 关机相关的定时器都调了 unref()，这是刻意的：关机超时不应独自把进程吊住。
 * 代价是——当被测代码是本进程里唯一的活动句柄时，事件循环会提前清空，测试
 * 会被运行器判为 cancelled。要观察 deadline，就得像真实进程那样先持有句柄。
 */
function keepEventLoopAlive() {
    const timer = setInterval(() => {}, 1000);
    return () => clearInterval(timer);
}

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
    const release = keepEventLoopAlive();
    try {
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
    } finally {
        release();
    }
});

test('runtime shutdown operations have a deadline', async () => {
    const release = keepEventLoopAlive();
    try {
        await assert.rejects(
            withDeadline(new Promise(() => {}), { timeoutMs: 1000, message: 'deadline reached' }),
            /deadline reached/,
        );
    } finally {
        release();
    }
});
