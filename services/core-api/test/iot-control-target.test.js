const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'iot-control-target-test-secret';

const secretService = require('../services/secretService');
const iotRouter = require('../routes/iot');

function withSecrets(values, callback) {
    const originalGetSecretSync = secretService.getSecretSync;
    secretService.getSecretSync = (key) => values[key] || null;
    try {
        return callback();
    } finally {
        secretService.getSecretSync = originalGetSecretSync;
    }
}

test('smart control defaults match the IoT service relay configuration', () => {
    withSecrets({}, () => {
        assert.deepEqual(iotRouter._test.resolveControlTarget({ target: 'primary' }), {
            deviceId: 'esp8266_living',
            relayId: 'relay1',
        });
        assert.deepEqual(iotRouter._test.resolveControlTarget({ target: 'secondary' }), {
            deviceId: 'relay_balcony',
            relayId: 'relay2',
        });
    });
});

test('explicit relay target and configured secrets override smart control defaults', () => {
    withSecrets({
        MQTT_SECONDARY_DEVICE_ID: 'custom_secondary',
        MQTT_SECONDARY_RELAY_ID: 'custom_relay',
    }, () => {
        assert.deepEqual(iotRouter._test.resolveControlTarget({
            deviceId: 'direct_device',
            relayId: 'direct_relay',
            target: 'secondary',
        }), {
            deviceId: 'direct_device',
            relayId: 'direct_relay',
        });
        assert.deepEqual(iotRouter._test.resolveControlTarget({
            topic: 'home/relay/control',
        }), {
            deviceId: 'custom_secondary',
            relayId: 'custom_relay',
        });
    });
});
