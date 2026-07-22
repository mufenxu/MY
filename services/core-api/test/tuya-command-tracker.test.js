const assert = require('node:assert/strict');
const test = require('node:test');

const {
    MAX_RECENT_COMMANDS,
    TuyaCommandTracker,
    confirmAcceptedLatestCommand,
    findCommand,
} = require('../services/tuyaCommandTracker');

test('command tracker keeps a bounded command history alongside the latest command', async () => {
    const writes = [];
    const tracker = new TuyaCommandTracker({
        deviceModel: {
            findOneAndUpdate: async (...args) => writes.push(args),
        },
    });
    const command = {
        commandId: 'command-1',
        commands: [{ code: 'switch', value: true }],
        state: 'pending',
        issuedAt: new Date(),
    };

    await tracker.record('device-1', command);

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][0], { deviceId: 'device-1' });
    assert.equal(writes[0][1].$set.lastCommand, command);
    assert.deepEqual(writes[0][1].$push.recentCommands, {
        $each: [command],
        $position: 0,
        $slice: MAX_RECENT_COMMANDS,
    });
});

test('command tracker confirms a requested older command without confusing it with the latest command', async () => {
    const updates = [];
    const confirmedAt = new Date('2026-07-22T12:00:30.000Z');
    const tracker = new TuyaCommandTracker({
        deviceModel: {
            updateOne: async (...args) => updates.push(args),
        },
        now: () => confirmedAt,
    });
    const older = {
        commandId: 'command-older',
        commands: [{ code: 'mode', value: 'heating' }],
        state: 'accepted',
        issuedAt: new Date('2026-07-22T12:00:10.000Z'),
    };
    const latest = {
        commandId: 'command-latest',
        commands: [{ code: 'mode', value: 'cold' }],
        state: 'accepted',
        issuedAt: new Date('2026-07-22T12:00:20.000Z'),
    };
    const device = {
        deviceId: 'device-1',
        lastStatusAt: new Date('2026-07-22T12:00:25.000Z'),
        lastCommand: latest,
        recentCommands: [latest, older],
    };

    const result = await tracker.refresh(
        device,
        [{ code: 'mode', value: 'heating' }],
        older.commandId,
    );

    assert.equal(result.state, 'confirmed');
    assert.equal(result.confirmedAt, confirmedAt);
    assert.equal(latest.state, 'accepted');
    assert.equal(updates.length, 2);
    assert.equal(updates[0][2].arrayFilters[0]['command.commandId'], older.commandId);
    assert.equal(updates[1][0]['lastCommand.commandId'], older.commandId);
});

test('command tracker never confirms from a status snapshot older than the command', async () => {
    const updates = [];
    const command = {
        commandId: 'command-1',
        commands: [{ code: 'switch', value: true }],
        state: 'accepted',
        issuedAt: new Date('2026-07-22T12:00:10.000Z'),
    };
    const tracker = new TuyaCommandTracker({
        deviceModel: { updateOne: async (...args) => updates.push(args) },
        now: () => new Date('2026-07-22T12:00:20.000Z'),
    });

    const result = await tracker.refresh({
        deviceId: 'device-1',
        lastStatusAt: new Date('2026-07-22T12:00:09.000Z'),
        lastCommand: command,
        recentCommands: [command],
    }, [{ code: 'switch', value: true }], command.commandId);

    assert.equal(result.state, 'accepted');
    assert.equal(updates.length, 0);
});

test('command tracker marks an unconfirmed command as timed out', async () => {
    const tracker = new TuyaCommandTracker({
        deviceModel: { updateOne: async () => ({}) },
        now: () => new Date('2026-07-22T12:00:31.000Z'),
    });
    const command = {
        commandId: 'command-1',
        commands: [{ code: 'switch', value: true }],
        state: 'accepted',
        issuedAt: new Date('2026-07-22T12:00:00.000Z'),
    };

    const result = await tracker.refresh(
        {
            deviceId: 'device-1',
            lastStatusAt: new Date('2026-07-22T12:00:31.000Z'),
            lastCommand: command,
            recentCommands: [command],
        },
        [{ code: 'switch', value: false }],
        command.commandId,
    );

    assert.equal(result.state, 'timed_out');
    assert.match(result.error, /30 seconds/);
});

test('latest command state is still updated when the history update fails', async () => {
    const updates = [];
    const errors = [];
    const tracker = new TuyaCommandTracker({
        deviceModel: {
            updateOne: async (...args) => {
                updates.push(args);
                if (updates.length === 1) throw new Error('legacy history missing');
                return {};
            },
        },
        log: { error: (...args) => errors.push(args) },
    });

    await tracker.transition('device-1', 'command-1', ['pending'], { state: 'accepted' });

    assert.equal(updates.length, 2);
    assert.equal(updates[1][0]['lastCommand.commandId'], 'command-1');
    assert.equal(errors.length, 1);
});

test('push reports confirm accepted commands in both latest and recent command records', () => {
    const confirmedAt = new Date('2026-07-22T12:00:20.000Z');
    const tracked = {
        commandId: 'command-1',
        commands: [{ code: 'switch', value: true }],
        state: 'accepted',
    };
    const device = {
        lastCommand: { ...tracked },
        recentCommands: [{ ...tracked }],
    };

    assert.equal(confirmAcceptedLatestCommand(
        device,
        [{ code: 'switch', value: true }],
        confirmedAt,
    ), true);
    assert.equal(device.lastCommand.state, 'confirmed');
    assert.equal(device.recentCommands[0].state, 'confirmed');
    assert.equal(device.recentCommands[0].confirmedAt, confirmedAt);
});

test('push reports never confirm a command before Tuya accepts it', () => {
    const device = {
        lastCommand: {
            commandId: 'command-1',
            commands: [{ code: 'switch', value: true }],
            state: 'pending',
        },
    };

    assert.equal(confirmAcceptedLatestCommand(
        device,
        [{ code: 'switch', value: true }],
        new Date(),
    ), false);
    assert.equal(device.lastCommand.state, 'pending');
});

test('findCommand uses command history for command-specific lookups', () => {
    const device = {
        lastCommand: { commandId: 'latest' },
        recentCommands: [{ commandId: 'latest' }, { commandId: 'older' }],
    };
    assert.equal(findCommand(device).commandId, 'latest');
    assert.equal(findCommand(device, 'older').commandId, 'older');
    assert.equal(findCommand(device, 'missing'), null);
});
