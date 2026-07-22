const assert = require('node:assert/strict');
const test = require('node:test');

const {
    CommandConfirmationError,
    waitForCommandConfirmation,
} = require('../utils/heatPumpCommand');

function createClock() {
    let current = 0;
    return {
        delay: async (ms) => { current += ms; },
        now: () => current,
    };
}

test('waits until the same command is confirmed and periodically forces a cloud read', async () => {
    const clock = createClock();
    const calls = [];
    const states = ['accepted', 'accepted', 'confirmed'];
    const seen = [];

    const command = await waitForCommandConfirmation({
        commandId: 'command-1',
        requestStatus: async (options) => {
            calls.push(options);
            return {
                success: true,
                result: {
                    online: true,
                    command: { commandId: 'command-1', state: states.shift() },
                },
            };
        },
        onStatus: (result) => seen.push(result.online),
        delay: clock.delay,
        now: clock.now,
        pollIntervalMs: 100,
        timeoutMs: 1000,
    });

    assert.equal(command.state, 'confirmed');
    assert.deepEqual(calls.map((call) => call.forceRefresh), [false, false, true]);
    assert.deepEqual(seen, [true, true, true]);
});

test('ignores another client command while waiting for its own command id', async () => {
    const clock = createClock();
    let attempt = 0;
    const command = await waitForCommandConfirmation({
        commandId: 'command-1',
        requestStatus: async () => ({
            success: true,
            result: {
                command: attempt++ === 0
                    ? { commandId: 'command-2', state: 'confirmed' }
                    : { commandId: 'command-1', state: 'confirmed' },
            },
        }),
        delay: clock.delay,
        now: clock.now,
        pollIntervalMs: 100,
        timeoutMs: 500,
    });

    assert.equal(command.commandId, 'command-1');
});

test('surfaces device rejection without waiting for the timeout', async () => {
    const clock = createClock();
    await assert.rejects(
        waitForCommandConfirmation({
            commandId: 'command-1',
            requestStatus: async () => ({
                success: true,
                result: {
                    command: { commandId: 'command-1', state: 'rejected', error: 'Tuya rejected' },
                },
            }),
            delay: clock.delay,
            now: clock.now,
            pollIntervalMs: 100,
            timeoutMs: 500,
        }),
        (error) => error instanceof CommandConfirmationError
            && error.state === 'rejected'
            && error.message === 'Tuya rejected',
    );
});

test('stops polling when the page is no longer active', async () => {
    const clock = createClock();
    let active = true;
    await assert.rejects(
        waitForCommandConfirmation({
            commandId: 'command-1',
            requestStatus: async () => {
                active = false;
                return {
                    success: true,
                    result: { command: { commandId: 'command-1', state: 'accepted' } },
                };
            },
            isActive: () => active,
            delay: clock.delay,
            now: clock.now,
            pollIntervalMs: 100,
            timeoutMs: 500,
        }),
        (error) => error instanceof CommandConfirmationError && error.state === 'cancelled',
    );
});

test('retries transient status failures and times out deterministically', async () => {
    const clock = createClock();
    let calls = 0;
    await assert.rejects(
        waitForCommandConfirmation({
            commandId: 'command-1',
            requestStatus: async () => {
                calls += 1;
                throw new Error('temporary network error');
            },
            delay: clock.delay,
            now: clock.now,
            pollIntervalMs: 100,
            timeoutMs: 300,
        }),
        (error) => error instanceof CommandConfirmationError
            && error.state === 'timed_out'
            && error.message === 'temporary network error',
    );
    assert.equal(calls, 3);
});
