const assert = require('node:assert/strict');
const test = require('node:test');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'tuya-heat-pump-test-key';

const TuyaDevice = require('../models/TuyaDevice');
const { TuyaAutomationService } = require('../services/tuyaAutomationService');
const {
    commandValuesMatch,
    normalizeAutomationUpdate,
    resolveAutomationTarget,
    validateHeatPumpCommands,
} = require('../utils/tuyaHeatPump');

test('heat pump commands allow only known DPs with valid values', () => {
    assert.deepEqual(validateHeatPumpCommands([
        { code: 'switch', value: true },
        { code: 'mode', value: 'heating' },
        { code: 'temp_set', value: 60 },
        { code: 'SET_TANK_TEMP', value: 60 },
    ]), [
        { code: 'switch', value: true },
        { code: 'mode', value: 'heating' },
        { code: 'temp_set', value: 60 },
        { code: 'SET_TANK_TEMP', value: 60 },
    ]);

    assert.throws(
        () => validateHeatPumpCommands([{ code: 'temp_set', value: 61 }]),
        /between 15 and 60/,
    );
    assert.throws(
        () => validateHeatPumpCommands([{ code: 'factory_reset', value: true }]),
        /Unsupported heat pump command/,
    );
    assert.throws(
        () => validateHeatPumpCommands([{ code: 'SET_TANK_TEMP', value: 19 }]),
        /between 20 and 60/,
    );
    assert.throws(
        () => validateHeatPumpCommands([
            { code: 'switch', value: true },
            { code: 'switch', value: false },
        ]),
        /Duplicate heat pump command/,
    );
});

test('automation validation persists default temperature and rejects overlapping periods', () => {
    const normalized = normalizeAutomationUpdate({
        smartSchedule: { enabled: true, valleyTemp: 50, peakTemp: 45 },
        heatSchedule: {
            enabled: true,
            defaultTemp: 35,
            periods: [{ id: 'morning', startTime: '08:00', endTime: '10:00', targetTemp: 48 }],
        },
    });
    assert.equal(normalized.heatSchedule.defaultTemp, 35);

    const document = new TuyaDevice({ deviceId: 'device-1', automation: normalized });
    assert.equal(document.automation.heatSchedule.defaultTemp, 35);

    assert.throws(() => normalizeAutomationUpdate({
        heatSchedule: {
            enabled: true,
            defaultTemp: 35,
            periods: [
                { id: 'one', startTime: '23:00', endTime: '02:00', targetTemp: 45 },
                { id: 'two', startTime: '01:00', endTime: '03:00', targetTemp: 46 },
            ],
        },
    }), /must not overlap/);
});

test('heat schedule has priority and uses its default outside configured periods', () => {
    const automation = {
        smartSchedule: { enabled: true, valleyTemp: 50, peakTemp: 45 },
        heatSchedule: {
            enabled: true,
            defaultTemp: 35,
            periods: [{ id: 'morning', startTime: '08:00', endTime: '09:00', targetTemp: 48 }],
        },
    };

    const outsidePeriod = resolveAutomationTarget(automation, new Date(2026, 6, 22, 10, 0));
    assert.deepEqual(outsidePeriod, { source: 'heat-default', targetTemp: 35, periodId: null });

    const insidePeriod = resolveAutomationTarget(automation, new Date(2026, 6, 22, 8, 30));
    assert.deepEqual(insidePeriod, { source: 'heat-period', targetTemp: 48, periodId: 'morning' });
});

test('automation executions are single-flight and issue one final command', async () => {
    let release;
    const calls = [];
    const service = new TuyaAutomationService({
        deviceModel: {
            findOne: async () => ({
                automation: {
                    smartSchedule: { enabled: true, valleyTemp: 50, peakTemp: 45 },
                    heatSchedule: { enabled: true, defaultTemp: 35, periods: [] },
                },
                getDpValue: () => 45,
            }),
        },
        tuyaService: {
            sendCommand: async (deviceId, commands) => {
                calls.push({ deviceId, commands });
                await new Promise((resolve) => { release = resolve; });
                return { success: true };
            },
        },
        secretService: { getSecretSync: () => 'device-1' },
        now: () => new Date(2026, 6, 22, 10, 0),
    });

    const first = service.executeAutomation();
    const second = service.executeAutomation();
    assert.equal(first, second);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    release();
    const result = await first;

    assert.equal(result.source, 'heat-default');
    assert.deepEqual(calls, [{
        deviceId: 'device-1',
        commands: [{ code: 'temp_set', value: 35 }],
    }]);
});

test('command confirmation requires every requested DP value', () => {
    const status = [
        { code: 'switch', value: true },
        { code: 'mode', value: 'heating' },
    ];
    assert.equal(commandValuesMatch(status, [
        { code: 'switch', value: true },
        { code: 'mode', value: 'heating' },
    ]), true);
    assert.equal(commandValuesMatch(status, [{ code: 'mode', value: 'cold' }]), false);
});
