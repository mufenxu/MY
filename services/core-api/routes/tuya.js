const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const tuyaAutomationService = require('../services/tuyaAutomationService');
// ... other imports

// ... inside POST /heat-pump/automation handler
const tuyaService = require('../services/tuyaService');
const tuyaEnergyController = require('../controllers/tuyaEnergyController');
const tuyaMessageService = require('../services/tuyaMessageService');
const auth = require('../middleware/auth');
const authorizeAccess = require('../middleware/authorizeAccess');
const TuyaDevice = require('../models/TuyaDevice');
const TuyaDeviceLog = require('../models/TuyaDeviceLog');
const secretService = require('../services/secretService');
const logger = require('../utils/logger');
const {
    commandValuesMatch,
    normalizeAutomationUpdate,
    validateHeatPumpCommands,
} = require('../utils/tuyaHeatPump');

const STATUS_CACHE_TTL_MS = 60000;
const COMMAND_CONFIRM_TIMEOUT_MS = 30000;

function getConfiguredDeviceId() {
    const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
    if (!deviceId) {
        const error = new Error('Tuya heat pump device is not configured');
        error.statusCode = 503;
        throw error;
    }
    return deviceId;
}

function commandForResponse(lastCommand) {
    if (!lastCommand?.commandId) return null;
    return {
        commandId: lastCommand.commandId,
        commands: (lastCommand.commands || []).map((item) => ({ code: item.code, value: item.value })),
        state: lastCommand.state,
        issuedAt: lastCommand.issuedAt,
        acceptedAt: lastCommand.acceptedAt,
        confirmedAt: lastCommand.confirmedAt,
        error: lastCommand.error || null,
    };
}

async function refreshCommandState(device, status = device?.status) {
    const lastCommand = device?.lastCommand;
    if (!lastCommand?.commandId || !['pending', 'accepted', 'timed_out'].includes(lastCommand.state)) {
        return commandForResponse(lastCommand);
    }

    let state = lastCommand.state;
    const update = {};
    if (commandValuesMatch(status, lastCommand.commands)) {
        state = 'confirmed';
        update['lastCommand.state'] = state;
        update['lastCommand.confirmedAt'] = new Date();
        update['lastCommand.error'] = null;
    } else if (Date.now() - new Date(lastCommand.issuedAt).getTime() > COMMAND_CONFIRM_TIMEOUT_MS) {
        state = 'timed_out';
        update['lastCommand.state'] = state;
        update['lastCommand.error'] = 'Device state was not confirmed within 30 seconds';
    }

    if (Object.keys(update).length > 0) {
        await TuyaDevice.updateOne(
            { deviceId: device.deviceId, 'lastCommand.commandId': lastCommand.commandId },
            { $set: update },
        );
        Object.assign(lastCommand, {
            state,
            confirmedAt: update['lastCommand.confirmedAt'] || lastCommand.confirmedAt,
            error: update['lastCommand.error'] ?? lastCommand.error,
        });
    }
    return commandForResponse(lastCommand);
}

async function recordLastCommand(deviceId, command) {
    try {
        await TuyaDevice.findOneAndUpdate(
            { deviceId },
            { $set: { lastCommand: command } },
            { upsert: true },
        );
    } catch (error) {
        logger.error('Unable to persist Tuya command state:', error.message);
    }
}

async function transitionLastCommand(deviceId, commandId, fromStates, update) {
    try {
        await TuyaDevice.updateOne(
            {
                deviceId,
                'lastCommand.commandId': commandId,
                'lastCommand.state': { $in: fromStates },
            },
            { $set: update },
        );
    } catch (error) {
        logger.error('Unable to update Tuya command state:', error.message);
    }
}

const tuyaViewAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['tuya', 'view_tuya', 'manage_tuya'],
});

const tuyaManageAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['tuya', 'manage_tuya'],
});

const heatPumpViewAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['heat_pump', 'view_heat_pump', 'manage_heat_pump'],
});

const heatPumpManageAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['heat_pump', 'manage_heat_pump'],
});

/**
 * 获取设备状态
 */
router.get('/devices/:deviceId/status', auth.verifyToken, tuyaViewAccess, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const result = await tuyaService.getDeviceInfo(deviceId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 默认热泵设备状态 (使用环境变量中的内容)
 */
router.get('/heat-pump/status', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const deviceId = getConfiguredDeviceId();
        const device = await TuyaDevice.findOne({ deviceId });
        const wsStatus = tuyaMessageService.getStatus();
        const lastStatusAt = device?.lastStatusAt || device?.lastMessageAt;
        const statusAgeMs = lastStatusAt ? Date.now() - new Date(lastStatusAt).getTime() : Number.POSITIVE_INFINITY;
        const isCacheValid = device && statusAgeMs < STATUS_CACHE_TTL_MS;
        const forceRefresh = req.query.fresh === '1';

        if (isCacheValid && !forceRefresh) {
            const messageAgeMs = device.lastMessageAt
                ? Date.now() - new Date(device.lastMessageAt).getTime()
                : null;
            return res.json({
                success: true,
                result: {
                    online: device.online,
                    status: device.status,
                    source: wsStatus.connected && messageAgeMs !== null && messageAgeMs < STATUS_CACHE_TTL_MS
                        ? 'realtime-push'
                        : 'cache',
                    lastStatusAt,
                    messageConnection: wsStatus,
                    lastCommand: await refreshCommandState(device),
                }
            });
        }

        const result = await tuyaService.getDeviceInfo(deviceId);

        if (result.success) {
            const now = new Date();
            const updatedDevice = await TuyaDevice.findOneAndUpdate(
                { deviceId },
                {
                    online: result.result.online,
                    status: result.result.status,
                    lastStatusAt: now,
                    lastCloudSyncAt: now,
                    updatedAt: Date.now()
                },
                { upsert: true, new: true }
            );
            result.result.source = 'cloud-api';
            result.result.lastStatusAt = now;
            result.result.messageConnection = wsStatus;
            result.result.lastCommand = await refreshCommandState(updatedDevice, result.result.status);
        }

        res.json(result);
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.get('/heat-pump/health', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const deviceId = getConfiguredDeviceId();
        const device = await TuyaDevice.findOne({ deviceId }).select(
            'deviceId online lastMessageAt lastStatusAt lastCloudSyncAt lastCommand.state',
        );
        const now = Date.now();
        res.json({
            success: true,
            result: {
                apiConfigured: Boolean(tuyaService.accessKey && tuyaService.secretKey && tuyaService.baseUrl),
                deviceConfigured: true,
                deviceOnline: device?.online ?? null,
                lastMessageAgeMs: device?.lastMessageAt ? now - new Date(device.lastMessageAt).getTime() : null,
                lastStatusAgeMs: device?.lastStatusAt ? now - new Date(device.lastStatusAt).getTime() : null,
                lastCloudSyncAt: device?.lastCloudSyncAt || null,
                lastCommandState: device?.lastCommand?.state || null,
                messageConnection: tuyaMessageService.getStatus(),
            },
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

/**
 * 发送设备指令
 */
router.post('/devices/:deviceId/commands', auth.verifyToken, tuyaManageAccess, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { commands } = req.body;

        if (!commands || !Array.isArray(commands)) {
            return res.status(400).json({ success: false, error: 'Invalid commands format' });
        }

        const configuredDeviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const validatedCommands = deviceId === configuredDeviceId
            ? validateHeatPumpCommands(commands)
            : commands;
        const result = await tuyaService.sendCommand(deviceId, validatedCommands);
        res.json(result);
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

/**
 * 快捷控制热泵
 */
router.post('/heat-pump/control', auth.verifyToken, heatPumpManageAccess, async (req, res) => {
    let deviceId;
    let commandId;
    let commands = [];
    let issuedAt;
    try {
        deviceId = getConfiguredDeviceId();
        commands = validateHeatPumpCommands(req.body?.commands);
        commandId = crypto.randomUUID();
        issuedAt = new Date();
        await recordLastCommand(deviceId, {
            commandId,
            commands,
            state: 'pending',
            issuedAt,
        });

        const result = await tuyaService.sendCommand(deviceId, commands);
        if (!result?.success) {
            const error = [result?.code, result?.msg].filter(Boolean).join(': ') || 'Tuya rejected the command';
            await transitionLastCommand(deviceId, commandId, ['pending', 'accepted'], {
                'lastCommand.state': 'rejected',
                'lastCommand.error': error,
            });
            return res.status(502).json({ ...result, commandId, commandState: 'rejected' });
        }

        await transitionLastCommand(deviceId, commandId, ['pending', 'accepted'], {
            'lastCommand.state': 'accepted',
            'lastCommand.acceptedAt': new Date(),
            'lastCommand.error': null,
        });
        res.json({ ...result, commandId, commandState: 'accepted' });
    } catch (error) {
        if (deviceId && commandId) {
            await transitionLastCommand(deviceId, commandId, ['pending', 'accepted'], {
                'lastCommand.state': 'rejected',
                'lastCommand.error': error.message,
            });
        }
        res.status(error.statusCode || 502).json({ success: false, error: error.message, commandId });
    }
});

/**
 * 自动化配置 API
 */
router.get('/devices/:deviceId/automation', auth.verifyToken, tuyaViewAccess, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await TuyaDevice.findOne({ deviceId });
        res.json({ success: true, automation: device ? device.automation : {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/devices/:deviceId/automation', auth.verifyToken, tuyaManageAccess, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const normalized = normalizeAutomationUpdate(req.body);
        const update = Object.fromEntries(
            Object.entries(normalized).map(([key, value]) => [`automation.${key}`, value]),
        );

        await TuyaDevice.findOneAndUpdate(
            { deviceId },
            { $set: update },
            { upsert: true }
        );

        // 立即触发自动化
        tuyaAutomationService.triggerNow().catch((error) => {
            logger.error('Immediate Tuya automation run failed:', error.message);
        });

        res.json({ success: true });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

/**
 * 自动化配置快捷 API (默认设备)
 */
router.get('/heat-pump/automation', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const deviceId = getConfiguredDeviceId();
        const device = await TuyaDevice.findOne({ deviceId });
        res.json({ success: true, automation: device ? device.automation : {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/heat-pump/automation', auth.verifyToken, heatPumpManageAccess, async (req, res) => {
    try {
        const deviceId = getConfiguredDeviceId();
        const normalized = normalizeAutomationUpdate(req.body);
        const update = Object.fromEntries(
            Object.entries(normalized).map(([key, value]) => [`automation.${key}`, value]),
        );

        await TuyaDevice.findOneAndUpdate(
            { deviceId },
            { $set: update },
            { upsert: true }
        );

        let automationRun;
        try {
            automationRun = await tuyaAutomationService.triggerNow();
        } catch (error) {
            logger.error('Immediate Tuya automation run failed:', error.message);
            automationRun = { success: false, error: 'initial-evaluation-failed' };
        }

        res.json({ success: true, automationRun });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

/**
 * 城市搜索 API
 */
router.get('/weather/search', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const { city } = req.query;
        if (!city) return res.status(400).json({ success: false, error: 'City name required' });

        const weatherService = require('../services/weatherService');
        const results = await weatherService.searchCity(city);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 获取设备 24小时 历史趋势数据 (聚合查询)
 */
// 获取能耗统计 (新增)
router.get('/heat-pump/energy-stats', auth.verifyToken, heatPumpViewAccess, tuyaEnergyController.getDailyEnergyStats);

// 获取最近 7 天能耗统计 (新增)
router.get('/heat-pump/energy-weekly', auth.verifyToken, heatPumpViewAccess, tuyaEnergyController.getWeeklyEnergyStats);

// 获取图表数据
router.get('/heat-pump/chart-data', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const endTime = new Date();
        const startTime = new Date(endTime - 24 * 60 * 60 * 1000); // 24小时前

        // 聚合查询
        const logs = await TuyaDeviceLog.aggregate([
            {
                $match: {
                    deviceId: deviceId,
                    timestamp: { $gte: startTime, $lte: endTime },
                    code: { $in: ['WATER_BACK_TEMP', 'ACIN_VOL', 'RUN_CURRENT'] }
                }
            },
            {
                // 按相关字段投射，方便后续处理
                $project: {
                    code: 1,
                    value: 1,
                    // 将时间向下取整到最近的 15 分钟 (900000ms)
                    timeBucket: {
                        $toDate: {
                            $subtract: [
                                { $toLong: "$timestamp" },
                                { $mod: [{ $toLong: "$timestamp" }, 900000] }
                            ]
                        }
                    }
                }
            },
            {
                // 按时间桶分组
                $group: {
                    _id: "$timeBucket",
                    temp: {
                        $avg: {
                            $cond: [{ $eq: ["$code", "WATER_BACK_TEMP"] }, { $toDouble: "$value" }, null]
                        }
                    },
                    vol: {
                        $avg: {
                            $cond: [{ $eq: ["$code", "ACIN_VOL"] }, { $toDouble: "$value" }, null]
                        }
                    },
                    current: {
                        $avg: {
                            $cond: [{ $eq: ["$code", "RUN_CURRENT"] }, { $toDouble: "$value" }, null]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 格式化输出
        const result = logs.map(item => {
            // 数据修正: 涂鸦协议中温度和电流通常放大10倍
            const realTemp = item.temp ? (item.temp / 10) : null;
            const realCurrent = item.current ? (item.current / 10) : 0;
            const realVol = item.vol || 220;

            // 计算平均功率 P = U * I * 0.96 (与前端保持一致)
            let power = 0;
            if (realCurrent > 0) {
                // 暂时简单估算，历史数据若要精确加 370W 需要 switch 状态，这里先修复量级问题
                power = realVol * realCurrent * 0.96;
            }

            // 格式化时间 HH:mm
            const date = new Date(item._id);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

            return {
                time: timeStr,
                temp: realTemp ? parseFloat(realTemp.toFixed(1)) : null,
                power: Math.round(power)
            };
        });

        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});




module.exports = router;
