const express = require('express');
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
        // 优先从本地数据库获取最新状态
        const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const device = await TuyaDevice.findOne({ deviceId });

        // 智能缓存策略:
        // 1. 如果 WebSocket 长连接正常 (tuyaMessageService.connected)，完全信任本地数据库 (因为云端有变更会自动推过来)
        // 2. 如果 WebSocket 断开，则退化为 1 分钟 TTL 缓存机制

        const wsStatus = tuyaMessageService.getStatus();
        const isWsConnected = wsStatus.connected;
        const isCacheValid = device && (Date.now() - new Date(device.updatedAt).getTime() < 60000);

        if (device && (isWsConnected || isCacheValid)) {
            // 返回本地缓存
            return res.json({
                success: true,
                result: {
                    online: device.online,
                    status: device.status,
                    source: isWsConnected ? 'realtime-push' : 'cache'
                }
            });
        }

        // 如果长连接断了 且 本地数据也旧了，才主动去涂鸦云拉取
        const result = await tuyaService.getDeviceInfo();

        if (result.success) {
            await TuyaDevice.findOneAndUpdate(
                { deviceId },
                {
                    online: result.result.online,
                    status: result.result.status,
                    updatedAt: Date.now()
                },
                { upsert: true }
            );
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

        const result = await tuyaService.sendCommand(deviceId, commands);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 快捷控制热泵
 */
router.post('/heat-pump/control', auth.verifyToken, heatPumpManageAccess, async (req, res) => {
    try {
        const { commands } = req.body;
        const result = await tuyaService.sendCommand(undefined, commands);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        const { smartSchedule, otc } = req.body;

        const update = {};
        if (smartSchedule) update['automation.smartSchedule'] = smartSchedule;
        if (otc) update['automation.otc'] = otc;

        await TuyaDevice.findOneAndUpdate(
            { deviceId },
            { $set: update },
            { upsert: true }
        );

        // 立即触发自动化
        tuyaAutomationService.triggerNow();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 自动化配置快捷 API (默认设备)
 */
router.get('/heat-pump/automation', auth.verifyToken, heatPumpViewAccess, async (req, res) => {
    try {
        const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const device = await TuyaDevice.findOne({ deviceId });
        res.json({ success: true, automation: device ? device.automation : {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/heat-pump/automation', auth.verifyToken, heatPumpManageAccess, async (req, res) => {
    try {
        const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const { smartSchedule, otc, location, heatSchedule } = req.body;

        const update = {};
        if (smartSchedule) update['automation.smartSchedule'] = smartSchedule;
        if (otc) update['automation.otc'] = otc;
        if (location) update['automation.location'] = location;
        if (heatSchedule) update['automation.heatSchedule'] = heatSchedule;

        await TuyaDevice.findOneAndUpdate(
            { deviceId },
            { $set: update },
            { upsert: true }
        );

        // 立即触发自动化
        tuyaAutomationService.triggerNow();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
