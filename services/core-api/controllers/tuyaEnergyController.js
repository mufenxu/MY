/**
 * 涂鸦能耗统计控制器
 * 
 * 基于 TuyaDeviceLog 的历史数据（电流 x 电压）积分计算能耗
 */

const TuyaDeviceLog = require('../models/TuyaDeviceLog');
const logger = require('../utils/logger');
const dayjs = require('dayjs');

const tuyaEnergyController = {

    /**
     * 获取今日能耗统计
     * 路由: GET /api/tuya/heat-pump/energy-stats
     */
    async getDailyEnergyStats(req, res) {
        try {
            // 定义“今日”的时间范围 (00:00:00 - 现在)
            const startOfDay = dayjs().startOf('day').toDate();
            const endOfDay = dayjs().endOf('day').toDate();

            // 默认使用的设备ID，如果支持多设备可以从 query 或 user context 获取
            // 这里为了简单，先查询最近活跃的一个设备
            const latestLog = await TuyaDeviceLog.findOne().sort({ timestamp: -1 });
            if (!latestLog) {
                return res.json({ success: true, result: { dailyConsumption: '0.00', estimatedCost: '0.00' } });
            }
            const deviceId = latestLog.deviceId;

            // 获取今日所有相关日志 (电压、电流、开关)，并按时间正序排列
            const logs = await TuyaDeviceLog.find({
                deviceId: deviceId,
                timestamp: { $gte: startOfDay, $lte: endOfDay },
                code: { $in: ['ACIN_VOL', 'RUN_CURRENT', 'switch'] }
            }).sort({ timestamp: 1 });

            if (logs.length === 0) {
                return res.json({ success: true, result: { dailyConsumption: '0.00', estimatedCost: '0.00' } });
            }

            const stats = tuyaEnergyController._calculateStats(logs);

            logger.info(`[EnergyCalc] Dev:${deviceId} Pts:${logs.length} Energy:${stats.kwh} kWh Cost:¥${stats.cost}`);

            res.json({
                success: true,
                result: {
                    dailyConsumption: stats.kwh,
                    estimatedCost: stats.cost,
                    updateTime: dayjs().format('HH:mm:ss')
                }
            });

        } catch (err) {
            logger.error('Get Energy Stats Error:', err);
            res.status(500).json({ success: false, msg: '服务器内部错误' });
        }
    },

    /**
     * 获取最近 7 天能耗统计
     * 路由: GET /api/tuya/heat-pump/energy-weekly
     */
    async getWeeklyEnergyStats(req, res) {
        try {
            // 获取最近活跃的一个设备
            const latestLog = await TuyaDeviceLog.findOne().sort({ timestamp: -1 });
            if (!latestLog) {
                return res.json({ success: true, result: [] });
            }
            const deviceId = latestLog.deviceId;

            const weeklyData = [];

            // 循环过去 7 天 (包括今天)
            for (let i = 6; i >= 0; i--) {
                const targetDay = dayjs().subtract(i, 'day');
                const startOfDay = targetDay.startOf('day').toDate();
                const endOfDay = targetDay.endOf('day').toDate();
                const dateLabel = targetDay.format('MM-DD');

                // 查询当天的日志
                const logs = await TuyaDeviceLog.find({
                    deviceId: deviceId,
                    timestamp: { $gte: startOfDay, $lte: endOfDay },
                    code: { $in: ['ACIN_VOL', 'RUN_CURRENT', 'switch'] }
                }).sort({ timestamp: 1 });

                let energy = '0.00';
                let cost = '0.00';

                // 只有当有日志时才计算，否则保持 0
                if (logs.length > 0) {
                    const stats = tuyaEnergyController._calculateStats(logs);
                    energy = stats.kwh;
                    cost = stats.cost;
                }

                weeklyData.push({
                    date: dateLabel,
                    energy: energy,
                    cost: cost,
                    isToday: i === 0
                });
            }

            res.json({
                success: true,
                result: weeklyData
            });

        } catch (err) {
            logger.error('Get Weekly Energy Stats Error:', err);
            res.status(500).json({ success: false, msg: '服务器内部错误' });
        }
    },

    /**
     * 内部帮助函数：根据日志列表计算能耗和费用
     * @param {Array} logs 按时间正序排列的日志
     * @returns {Object} { kwh: string, cost: string }
     */
    _calculateStats(logs) {
        // --- 数据重组 ---
        let currentVol = 220; // 默认电压 220V
        let currentCur = 0;   // 默认电流 0A
        let isSwitchOn = false; // 默认开关状态
        const timeSeries = [];

        logs.forEach(log => {
            if (log.code === 'ACIN_VOL') currentVol = parseFloat(log.value);
            if (log.code === 'RUN_CURRENT') currentCur = parseFloat(log.value);
            if (log.code === 'switch') {
                // 兼容 boolean 和 string
                isSwitchOn = (log.value === true || log.value === 'true');
            }

            timeSeries.push({
                time: new Date(log.timestamp).getTime(),
                vol: currentVol,
                cur: currentCur,
                isOn: isSwitchOn
            });
        });

        // --- 积分计算 (黎曼和) ---
        let totalJoules = 0;
        let totalMoney = 0; // 总电费 (元)
        const PF = 0.985; // 功率因数 (根据铭牌 3kW/13.8A 修正)

        // 电价配置 (元/kWh)
        const PRICE = {
            PEAK: 0.4986,   // 峰段: 8:00-13:00, 17:00-20:00
            VALLEY: 0.2486  // 谷段: 13:00-17:00, 20:00-8:00
        };

        for (let i = 0; i < timeSeries.length - 1; i++) {
            const p1 = timeSeries[i];
            const p2 = timeSeries[i + 1];

            const durationSeconds = (p2.time - p1.time) / 1000;

            // 如果时间间隔过大 (比如 > 1小时)，可能设备离线了，忽略这段积分
            if (durationSeconds > 3600) continue;

            const realVol = p1.vol;
            const realCur = p1.cur / 10.0; // 电流除以 10

            // 主机功率 (W) = U * I * PF
            let powerW = realVol * realCur * PF;

            // 加上水循环泵功率 (370W)
            if (p1.isOn) {
                powerW += 370;
            }

            const joules = powerW * durationSeconds;
            const kwhSegment = joules / 3600000;

            totalJoules += joules;

            // --- 电费计算 ---
            const hour = new Date(p1.time).getHours();

            // 判断是否为峰段
            // 峰段: 8:00-13:00 (即 8,9,10,11,12) 及 17:00-20:00 (即 17,18,19)
            let isPeak = (hour >= 8 && hour < 13) || (hour >= 17 && hour < 20);

            const currentPrice = isPeak ? PRICE.PEAK : PRICE.VALLEY;
            totalMoney += kwhSegment * currentPrice;
        }

        const kwh = totalJoules / 3600000;

        return {
            kwh: kwh.toFixed(2),
            cost: totalMoney.toFixed(2)
        };
    }
};

module.exports = tuyaEnergyController;
