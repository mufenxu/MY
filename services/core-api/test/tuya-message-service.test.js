const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'tuya-message-security-test-key';

const {
    TuyaMessageService,
    resolveMessageConfig,
} = require('../services/tuyaMessageService');

function messageConfig(overrides = {}) {
    return {
        wsUrl: 'wss://mqe.tuyaeu.com:8285/',
        region: 'EU',
        channel: 'event',
        maxQueueSize: 2,
        maxDeviceQueueSize: 2,
        ...overrides,
    };
}

function inMemoryDeduplicator() {
    return {
        runOnce: async (_messageId, processMessage) => ({
            processed: true,
            value: await processMessage()
        })
    };
}

async function waitForQueue(service) {
    while (service.totalQueued > 0 || service.processingQueues.size > 0) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

test('Tuya message configuration validates region and forbids test channel in production', () => {
    assert.equal(resolveMessageConfig({ TUYA_MESSAGE_REGION: 'eu' }).region, 'EU');
    assert.equal(resolveMessageConfig({ TUYA_MESSAGE_CHANNEL: 'test' }).channel, 'event-test');
    assert.throws(
        () => resolveMessageConfig({ NODE_ENV: 'production', TUYA_MESSAGE_CHANNEL: 'event-test' }),
        /forbidden in production/,
    );
    assert.throws(() => resolveMessageConfig({ TUYA_MESSAGE_REGION: 'unknown' }), /Unsupported/);
});

test('Tuya websocket enables certificate verification', () => {
    class FakeWebSocket extends EventEmitter {
        static OPEN = 1;
        constructor(url, options) {
            super();
            this.url = url;
            this.options = options;
            this.readyState = 0;
            FakeWebSocket.instance = this;
        }
        close() {}
    }

    const service = new TuyaMessageService({ WebSocket: FakeWebSocket, messageConfig: messageConfig() });
    Object.defineProperty(service, 'accessId', { value: 'access-id' });
    Object.defineProperty(service, 'accessKey', { value: '0123456789abcdef0123456789abcdef' });
    service.shouldRun = true;
    service._connect();

    assert.equal(FakeWebSocket.instance.options.rejectUnauthorized, true);
    assert.match(FakeWebSocket.instance.url, /\/event\/access-id-sub/);
    service.stop();
});

test('Tuya messages are acked only after successful processing', async () => {
    const events = [];
    const service = new TuyaMessageService({
        messageConfig: messageConfig(),
        messageDeduplicator: inMemoryDeduplicator()
    });
    service.ws = {
        readyState: service.WebSocket.OPEN,
        send(payload, callback) {
            events.push(`ack:${JSON.parse(payload).messageId}`);
            callback();
        },
    };
    service._processDeviceMessage = async () => {
        events.push('process:start');
        await new Promise((resolve) => setImmediate(resolve));
        events.push('process:end');
    };

    assert.equal(service._enqueueMessage({
        messageId: 'message-1',
        payload: { bizCode: 'online', data: { devId: 'device-1' } },
    }), true);
    await waitForQueue(service);
    assert.deepEqual(events, ['process:start', 'process:end', 'ack:message-1']);

    service._processDeviceMessage = async () => { throw new Error('database unavailable'); };
    service._enqueueMessage({
        messageId: 'message-2',
        payload: { bizCode: 'online', data: { devId: 'device-1' } },
    });
    await waitForQueue(service);
    assert.equal(events.includes('ack:message-2'), false);
});

test('Tuya per-device queue is bounded and stop cancels reconnect', async () => {
    const service = new TuyaMessageService({
        messageConfig: messageConfig({ maxQueueSize: 2, maxDeviceQueueSize: 2 }),
        messageDeduplicator: inMemoryDeduplicator()
    });
    let release;
    service._processDeviceMessage = () => new Promise((resolve) => { release = resolve; });
    service.ackMessage = async () => {};
    const envelope = (id) => ({
        messageId: id,
        payload: { bizCode: 'online', data: { devId: 'device-1' } },
    });

    assert.equal(service._enqueueMessage(envelope('one')), true);
    assert.equal(service._enqueueMessage(envelope('two')), true);
    assert.equal(service._enqueueMessage(envelope('three')), false);
    assert.equal(service.totalQueued, 2);
    release();
    while (typeof release === 'function' && service.totalQueued > 1) await new Promise((resolve) => setImmediate(resolve));
    release();
    await waitForQueue(service);

    let reconnects = 0;
    service.shouldRun = true;
    service.retryTimeout = 5;
    service._connect = () => { reconnects += 1; };
    service._reconnect();
    service.stop();
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(reconnects, 0);
    assert.equal(service.reconnectTimer, null);
});
