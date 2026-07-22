const TuyaDevice = require('../models/TuyaDevice');
const logger = require('../utils/logger');
const { commandValuesMatch } = require('../utils/tuyaHeatPump');

const COMMAND_CONFIRM_TIMEOUT_MS = 30000;
const MAX_RECENT_COMMANDS = 20;
const ACTIVE_COMMAND_STATES = ['pending', 'accepted', 'timed_out'];
const TRANSITION_FIELDS = new Set(['state', 'acceptedAt', 'confirmedAt', 'error']);

function commandForResponse(command) {
    if (!command?.commandId) return null;
    return {
        commandId: command.commandId,
        commands: (command.commands || []).map((item) => ({ code: item.code, value: item.value })),
        state: command.state,
        issuedAt: command.issuedAt,
        acceptedAt: command.acceptedAt,
        confirmedAt: command.confirmedAt,
        error: command.error || null,
    };
}

function findCommand(device, commandId) {
    if (!device) return null;
    if (!commandId) return device.lastCommand || null;
    if (device.lastCommand?.commandId === commandId) return device.lastCommand;
    return (device.recentCommands || []).find((command) => command.commandId === commandId) || null;
}

function hasFreshObservation(device, command) {
    const observedAt = device?.lastStatusAt || device?.lastMessageAt;
    if (!observedAt || !command?.issuedAt) return false;
    return new Date(observedAt).getTime() >= new Date(command.issuedAt).getTime();
}

function confirmAcceptedLatestCommand(device, status, confirmedAt) {
    const command = device?.lastCommand;
    if (command?.state !== 'accepted' || !commandValuesMatch(status, command.commands)) return false;

    command.state = 'confirmed';
    command.confirmedAt = confirmedAt;
    command.error = undefined;
    const trackedCommand = (device.recentCommands || []).find(
        (item) => item.commandId === command.commandId,
    );
    if (trackedCommand) {
        trackedCommand.state = 'confirmed';
        trackedCommand.confirmedAt = confirmedAt;
        trackedCommand.error = undefined;
    }
    return true;
}

function buildPathUpdate(prefix, fields) {
    return Object.fromEntries(
        Object.entries(fields)
            .filter(([key]) => TRANSITION_FIELDS.has(key))
            .map(([key, value]) => [`${prefix}.${key}`, value]),
    );
}

class TuyaCommandTracker {
    constructor({
        deviceModel = TuyaDevice,
        log = logger,
        now = () => new Date(),
        confirmTimeoutMs = COMMAND_CONFIRM_TIMEOUT_MS,
        maxRecentCommands = MAX_RECENT_COMMANDS,
    } = {}) {
        this.deviceModel = deviceModel;
        this.log = log;
        this.now = now;
        this.confirmTimeoutMs = confirmTimeoutMs;
        this.maxRecentCommands = maxRecentCommands;
    }

    async record(deviceId, command) {
        await this.deviceModel.findOneAndUpdate(
            { deviceId },
            {
                $set: { lastCommand: command },
                $push: {
                    recentCommands: {
                        $each: [command],
                        $position: 0,
                        $slice: this.maxRecentCommands,
                    },
                },
            },
            { upsert: true },
        );
    }

    async transition(deviceId, commandId, fromStates, fields) {
        const recentUpdate = buildPathUpdate('recentCommands.$[command]', fields);
        const lastUpdate = buildPathUpdate('lastCommand', fields);
        try {
            await this.deviceModel.updateOne(
                { deviceId },
                { $set: recentUpdate },
                {
                    arrayFilters: [{
                        'command.commandId': commandId,
                        'command.state': { $in: fromStates },
                    }],
                },
            );
        } catch (error) {
            this.log.error('Unable to update recent Tuya command state:', error.message);
        }

        try {
            await this.deviceModel.updateOne(
                {
                    deviceId,
                    'lastCommand.commandId': commandId,
                    'lastCommand.state': { $in: fromStates },
                },
                { $set: lastUpdate },
            );
        } catch (error) {
            this.log.error('Unable to update latest Tuya command state:', error.message);
        }
    }

    async refresh(device, status = device?.status, commandId = null) {
        const command = findCommand(device, commandId);
        if (!command?.commandId || !ACTIVE_COMMAND_STATES.includes(command.state)) {
            return commandForResponse(command);
        }

        const now = this.now();
        const fields = {};
        if (hasFreshObservation(device, command) && commandValuesMatch(status, command.commands)) {
            fields.state = 'confirmed';
            fields.confirmedAt = now;
            fields.error = null;
        } else if (now.getTime() - new Date(command.issuedAt).getTime() > this.confirmTimeoutMs) {
            fields.state = 'timed_out';
            fields.error = 'Device state was not confirmed within 30 seconds';
        }

        if (Object.keys(fields).length > 0) {
            await this.transition(device.deviceId, command.commandId, ACTIVE_COMMAND_STATES, fields);
            Object.assign(command, fields);
        }
        return commandForResponse(command);
    }
}

module.exports = {
    ACTIVE_COMMAND_STATES,
    COMMAND_CONFIRM_TIMEOUT_MS,
    MAX_RECENT_COMMANDS,
    TuyaCommandTracker,
    commandForResponse,
    confirmAcceptedLatestCommand,
    findCommand,
    hasFreshObservation,
};
