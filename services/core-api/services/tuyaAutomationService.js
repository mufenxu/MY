const cron = require('node-cron');
const TuyaDevice = require('../models/TuyaDevice');
const tuyaService = require('./tuyaService');
const logger = require('../utils/logger');
const secretService = require('./secretService');
const { resolveAutomationTarget } = require('../utils/tuyaHeatPump');

class TuyaAutomationService {
    constructor(options = {}) {
        this.job = null;
        this.runningPromise = null;
        this.deviceModel = options.deviceModel || TuyaDevice;
        this.tuyaService = options.tuyaService || tuyaService;
        this.secretService = options.secretService || secretService;
        this.now = options.now || (() => new Date());
    }

    startScheduler() {
        if (this.job) return;

        logger.info('Tuya Automation Scheduler Started');
        this.job = cron.schedule('0 * * * * *', () => {
            this.executeAutomation().catch((error) => {
                logger.error('Automation Scheduler Error', error);
            });
        });

        this.executeAutomation().catch((error) => {
            logger.error('Initial Automation Run Error', error);
        });
    }

    stopScheduler() {
        if (!this.job) return;
        this.job.stop();
        this.job = null;
        logger.info('Tuya Automation Scheduler Stopped');
    }

    async triggerNow() {
        logger.info('Manual Automation Triggered');
        return this.executeAutomation();
    }

    executeAutomation() {
        if (this.runningPromise) return this.runningPromise;
        this.runningPromise = this._executeAutomation().finally(() => {
            this.runningPromise = null;
        });
        return this.runningPromise;
    }

    async _executeAutomation() {
        const deviceId = this.secretService.getSecretSync('TUYA_DEVICE_ID');
        if (!deviceId) {
            logger.warn('Tuya automation skipped: TUYA_DEVICE_ID is not configured');
            return { success: false, skipped: 'device-not-configured' };
        }

        const device = await this.deviceModel.findOne({ deviceId });
        if (!device?.automation) {
            return { success: true, skipped: 'automation-not-configured' };
        }

        const decision = resolveAutomationTarget(device.automation, this.now());
        if (!decision || !Number.isInteger(decision.targetTemp)) {
            return { success: true, skipped: 'automation-disabled' };
        }

        const currentSetTemp = device.getDpValue('temp_set');
        if (currentSetTemp === decision.targetTemp) {
            return { success: true, changed: false, ...decision };
        }

        logger.info(`[Tuya Automation] source=${decision.source} target=${decision.targetTemp}`);
        const result = await this.tuyaService.sendCommand(deviceId, [
            { code: 'temp_set', value: decision.targetTemp }
        ]);
        if (!result?.success) {
            const error = new Error(`Tuya automation command rejected: ${result?.code || 'unknown'} ${result?.msg || ''}`.trim());
            error.code = result?.code;
            throw error;
        }

        return { success: true, changed: true, ...decision };
    }
}

module.exports = new TuyaAutomationService();
module.exports.TuyaAutomationService = TuyaAutomationService;
