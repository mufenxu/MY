const cron = require('node-cron');
const TuyaDevice = require('../models/TuyaDevice');
const tuyaService = require('./tuyaService');
const logger = require('../utils/logger');
const secretService = require('./secretService');

class TuyaAutomationService {
    constructor() {
        this.job = null;
    }

    // 启动定时任务 (每分钟检查一次)
    startScheduler() {
        if (this.job) {
            return;
        }
        logger.info('Tuya Automation Scheduler Started');
        // 每分钟执行一次 (秒 分 时 日 月 周)
        this.job = cron.schedule('0 * * * * *', async () => {
            try {
                await this.executeAutomation();
            } catch (err) {
                logger.error('Automation Scheduler Error', err);
            }
        });

        // 启动时立即执行一次
        this.executeAutomation();
    }

    stopScheduler() {
        if (!this.job) {
            return;
        }
        this.job.stop();
        this.job = null;
        logger.info('Tuya Automation Scheduler Stopped');
    }

    // 手动触发一次
    async triggerNow() {
        logger.info('Manual Automation Triggered');
        return await this.executeAutomation();
    }

    async executeAutomation() {
        // userId 暂时硬编码或从单一用户场景获取 (假设只有一个设备)
        const deviceId = secretService.getSecretSync('TUYA_DEVICE_ID');
        const device = await TuyaDevice.findOne({ deviceId });

        if (!device || !device.automation) return;

        // 1. 智能谷电定时
        if (device.automation.smartSchedule && device.automation.smartSchedule.enabled) {
            await this.checkSmartSchedule(device);
        }

        // 2. 制热时段配置 (优先级高于谷电定时)
        if (device.automation.heatSchedule && device.automation.heatSchedule.enabled) {
            await this.checkHeatSchedule(device);
        }
    }

    /**
     * 智能谷电策略 (16小时谷段)
     * 谷电时段: 20:00-08:00 及 13:00-17:00 -> 设定到 valleyTemp (储热)
     * 峰电时段: 08:00-13:00 及 17:00-20:00 -> 设定到 peakTemp (节能)
     */
    async checkSmartSchedule(device) {
        const now = new Date();
        const hour = now.getHours();

        const config = device.automation.smartSchedule;
        let targetTemp = config.peakTemp;

        // 谷电区间：20:00-08:00 或 13:00-17:00 (共16小时)
        const isValley = (hour >= 20 || hour < 8) || (hour >= 13 && hour < 17);

        if (isValley) {
            targetTemp = config.valleyTemp;
        } else {
            targetTemp = config.peakTemp;
        }

        // 检查当前设定温度
        const currentSetTemp = device.getDpValue('temp_set');

        // 只有当偏差超过 1 度时才下发指令，避免重复写入
        if (currentSetTemp !== undefined && Math.abs(currentSetTemp - targetTemp) > 0) {
            logger.info(`[Auto-Schedule] Time: ${hour}:00, Adjusting Temp to ${targetTemp} (Valley: ${isValley})`);
            await tuyaService.sendCommand(device.deviceId, [
                { code: 'temp_set', value: targetTemp }
            ]);
            return true;
        }

        return true;
    }

    /**
     * 制热时段配置
     * 检查当前时间是否在用户配置的时间段内，如果是则调整到对应温度
     */
    async checkHeatSchedule(device) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const config = device.automation.heatSchedule;
        const periods = config.periods || [];

        // 找到当前所在的时段
        let matchedPeriod = null;
        for (const period of periods) {
            const [startH, startM] = period.startTime.split(':').map(Number);
            const [endH, endM] = period.endTime.split(':').map(Number);

            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            // 支持跨日时段 (如 22:00 - 06:00)
            if (endMinutes > startMinutes) {
                // 同一天
                if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                    matchedPeriod = period;
                    break;
                }
            } else {
                // 跨日
                if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                    matchedPeriod = period;
                    break;
                }
            }
        }

        if (!matchedPeriod) {
            return false; // 不在任何配置时段内
        }

        const targetTemp = matchedPeriod.targetTemp;
        const currentSetTemp = device.getDpValue('temp_set');

        // 只有温度不同时才下发指令
        if (currentSetTemp !== undefined && currentSetTemp !== targetTemp) {
            logger.info(`[Heat-Schedule] Period: ${matchedPeriod.startTime}-${matchedPeriod.endTime}, Adjusting Temp to ${targetTemp}°C`);
            await tuyaService.sendCommand(device.deviceId, [
                { code: 'temp_set', value: targetTemp }
            ]);
            return true;
        }

        return true;
    }
}

module.exports = new TuyaAutomationService();
