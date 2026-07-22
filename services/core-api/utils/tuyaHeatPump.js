const crypto = require('crypto');

const TEMP_MIN = 15;
const TEMP_MAX = 60;
const TANK_TEMP_MIN = 20;
const TANK_TEMP_MAX = 60;
const MAX_COMMANDS = 4;
const MAX_PERIODS = 12;

const COMMAND_SPECS = Object.freeze({
    switch: { type: 'boolean' },
    mode: { type: 'enum', values: ['cold', 'heating'] },
    temp_set: { type: 'integer', min: TEMP_MIN, max: TEMP_MAX },
    SET_TANK_TEMP: { type: 'integer', min: TANK_TEMP_MIN, max: TANK_TEMP_MAX },
});

class TuyaHeatPumpValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TuyaHeatPumpValidationError';
        this.statusCode = 400;
    }
}

function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TuyaHeatPumpValidationError(`${label} must be an object`);
    }
}

function assertBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new TuyaHeatPumpValidationError(`${label} must be a boolean`);
    }
}

function assertIntegerInRange(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new TuyaHeatPumpValidationError(`${label} must be an integer between ${min} and ${max}`);
    }
    return value;
}

function validateHeatPumpCommands(commands) {
    if (!Array.isArray(commands) || commands.length === 0 || commands.length > MAX_COMMANDS) {
        throw new TuyaHeatPumpValidationError(`commands must contain between 1 and ${MAX_COMMANDS} items`);
    }

    const seenCodes = new Set();
    return commands.map((command, index) => {
        assertPlainObject(command, `commands[${index}]`);
        const code = typeof command.code === 'string' ? command.code.trim() : '';
        const spec = COMMAND_SPECS[code];
        if (!spec) {
            throw new TuyaHeatPumpValidationError(`Unsupported heat pump command: ${code || '(empty)'}`);
        }
        if (seenCodes.has(code)) {
            throw new TuyaHeatPumpValidationError(`Duplicate heat pump command: ${code}`);
        }
        seenCodes.add(code);

        const value = command.value;
        if (spec.type === 'boolean' && typeof value !== 'boolean') {
            throw new TuyaHeatPumpValidationError(`${code} must be a boolean`);
        }
        if (spec.type === 'enum' && !spec.values.includes(value)) {
            throw new TuyaHeatPumpValidationError(`${code} must be one of: ${spec.values.join(', ')}`);
        }
        if (spec.type === 'integer') {
            assertIntegerInRange(value, spec.min, spec.max, code);
        }

        return { code, value };
    });
}

function parseTime(value, label) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
        throw new TuyaHeatPumpValidationError(`${label} must use HH:mm format`);
    }
    const [hour, minute] = value.split(':').map(Number);
    if (hour > 23 || minute > 59) {
        throw new TuyaHeatPumpValidationError(`${label} is not a valid time`);
    }
    return hour * 60 + minute;
}

function forEachPeriodMinute(start, end, callback) {
    let minute = start;
    while (minute !== end) {
        callback(minute);
        minute = (minute + 1) % 1440;
    }
}

function normalizeHeatSchedule(value) {
    assertPlainObject(value, 'heatSchedule');
    assertBoolean(value.enabled, 'heatSchedule.enabled');
    const defaultTemp = assertIntegerInRange(
        value.defaultTemp,
        TEMP_MIN,
        TEMP_MAX,
        'heatSchedule.defaultTemp',
    );
    if (!Array.isArray(value.periods) || value.periods.length > MAX_PERIODS) {
        throw new TuyaHeatPumpValidationError(`heatSchedule.periods must contain at most ${MAX_PERIODS} items`);
    }

    const occupiedMinutes = new Set();
    const periods = value.periods.map((period, index) => {
        assertPlainObject(period, `heatSchedule.periods[${index}]`);
        const startTime = String(period.startTime || '');
        const endTime = String(period.endTime || '');
        const start = parseTime(startTime, `heatSchedule.periods[${index}].startTime`);
        const end = parseTime(endTime, `heatSchedule.periods[${index}].endTime`);
        if (start === end) {
            throw new TuyaHeatPumpValidationError(`heatSchedule.periods[${index}] cannot cover a full day`);
        }
        forEachPeriodMinute(start, end, (minute) => {
            if (occupiedMinutes.has(minute)) {
                throw new TuyaHeatPumpValidationError('heatSchedule periods must not overlap');
            }
            occupiedMinutes.add(minute);
        });

        return {
            id: typeof period.id === 'string' && period.id.trim()
                ? period.id.trim().slice(0, 64)
                : crypto.randomUUID(),
            startTime,
            endTime,
            targetTemp: assertIntegerInRange(
                period.targetTemp,
                TEMP_MIN,
                TEMP_MAX,
                `heatSchedule.periods[${index}].targetTemp`,
            ),
        };
    });

    return { enabled: value.enabled, defaultTemp, periods };
}

function normalizeSmartSchedule(value) {
    assertPlainObject(value, 'smartSchedule');
    assertBoolean(value.enabled, 'smartSchedule.enabled');
    return {
        enabled: value.enabled,
        valleyTemp: assertIntegerInRange(value.valleyTemp, TEMP_MIN, TEMP_MAX, 'smartSchedule.valleyTemp'),
        peakTemp: assertIntegerInRange(value.peakTemp, TEMP_MIN, TEMP_MAX, 'smartSchedule.peakTemp'),
    };
}

function normalizeAutomationUpdate(body) {
    assertPlainObject(body, 'request body');
    const update = {};
    if (Object.prototype.hasOwnProperty.call(body, 'smartSchedule')) {
        update.smartSchedule = normalizeSmartSchedule(body.smartSchedule);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'heatSchedule')) {
        update.heatSchedule = normalizeHeatSchedule(body.heatSchedule);
    }
    if (Object.keys(update).length === 0) {
        throw new TuyaHeatPumpValidationError('No supported automation configuration was provided');
    }
    return update;
}

function isMinuteInPeriod(current, start, end) {
    return end > start
        ? current >= start && current < end
        : current >= start || current < end;
}

function resolveAutomationTarget(automation, now = new Date()) {
    if (!automation) return null;
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    const heatSchedule = automation.heatSchedule;

    if (heatSchedule?.enabled) {
        const matchedPeriod = (heatSchedule.periods || []).find((period) => {
            const start = parseTime(period.startTime, 'period.startTime');
            const end = parseTime(period.endTime, 'period.endTime');
            return start !== end && isMinuteInPeriod(currentMinute, start, end);
        });
        return {
            source: matchedPeriod ? 'heat-period' : 'heat-default',
            targetTemp: matchedPeriod?.targetTemp ?? heatSchedule.defaultTemp,
            periodId: matchedPeriod?.id || null,
        };
    }

    const smartSchedule = automation.smartSchedule;
    if (smartSchedule?.enabled) {
        const hour = now.getHours();
        const isValley = (hour >= 20 || hour < 8) || (hour >= 13 && hour < 17);
        return {
            source: isValley ? 'smart-valley' : 'smart-peak',
            targetTemp: isValley ? smartSchedule.valleyTemp : smartSchedule.peakTemp,
            periodId: null,
        };
    }

    return null;
}

function commandValuesMatch(status, commands) {
    if (!Array.isArray(status) || !Array.isArray(commands) || commands.length === 0) return false;
    return commands.every((command) => {
        const current = status.find((item) => item.code === command.code);
        return current && current.value === command.value;
    });
}

module.exports = {
    COMMAND_SPECS,
    TEMP_MIN,
    TEMP_MAX,
    TuyaHeatPumpValidationError,
    commandValuesMatch,
    normalizeAutomationUpdate,
    resolveAutomationTarget,
    validateHeatPumpCommands,
};
