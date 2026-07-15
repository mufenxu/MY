const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const secretService = require('./secretService');

/**
 * Tuya OpenAPI Service
 */
class TuyaService {
    constructor() {
        this.token = null;
        this.tokenExpireTime = 0;
    }

    get accessKey() { return secretService.getSecretSync('TUYA_ACCESS_KEY'); }
    get secretKey() { return secretService.getSecretSync('TUYA_SECRET_KEY'); }
    get baseUrl() { return secretService.getSecretSync('TUYA_ENDPOINT') || 'https://openapi.tuyacn.com'; }
    get deviceId() { return secretService.getSecretSync('TUYA_DEVICE_ID'); }

    /**
     * Generate Tuya 2.0 Signature
     */
    calcSign(method, url, body = '', timestamp, accessToken = '') {
        const hash = crypto.createHash('sha256').update(body === '' ? '' : JSON.stringify(body)).digest('hex');
        const str = [method, hash, '', url].join('\n');
        const signStr = this.accessKey + accessToken + timestamp + str;
        return crypto.createHmac('sha256', this.secretKey).update(signStr).digest('hex').toUpperCase();
    }

    /**
     * Get/Refresh Access Token
     */
    async getAccessToken() {
        if (this.token && Date.now() < this.tokenExpireTime) {
            return this.token;
        }

        const timestamp = Date.now();
        const url = '/v1.0/token?grant_type=1';
        const sign = this.calcSign('GET', url, '', timestamp);

        try {
            const startTime = Date.now();
            const res = await axios.get(`${this.baseUrl}${url}`, {
                headers: {
                    t: timestamp,
                    sign: sign,
                    client_id: this.accessKey,
                    sign_method: 'HMAC-SHA256'
                },
                timeout: 10000 // 10s timeout
            });

            logger.info(`Tuya Auth Token fetched in ${Date.now() - startTime}ms`);

            if (res.data.success) {
                this.token = res.data.result.access_token;
                // Expire 1 minute early to be safe
                this.tokenExpireTime = Date.now() + (res.data.result.expire_time - 60) * 1000;
                return this.token;
            } else {
                throw new Error(`Tuya Token Error: ${res.data.msg}`);
            }
        } catch (error) {
            logger.error('Tuya Auth Failed:', error.message);
            throw error;
        }
    }

    /**
     * Generic Tuya Request
     */
    async request(method, path, body = null) {
        const accessToken = await this.getAccessToken();
        const timestamp = Date.now();
        const sign = this.calcSign(method, path, body || '', timestamp, accessToken);

        const config = {
            method,
            url: `${this.baseUrl}${path}`,
            headers: {
                t: timestamp,
                sign: sign,
                client_id: this.accessKey,
                access_token: accessToken,
                sign_method: 'HMAC-SHA256',
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10s timeout
        };

        if (body) config.data = body;

        try {
            const startTime = Date.now();
            const res = await axios(config);
            const duration = Date.now() - startTime;

            if (res.data && !res.data.success) {
                logger.warn(`Tuya API ${method} ${path} Warning [${res.data.code}]: ${res.data.msg} (${duration}ms)`);
            } else {
                logger.info(`Tuya API ${method} ${path} Success (${duration}ms)`);
            }

            return res.data;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Tuya API ${method} ${path} Failed after ${duration}ms:`, error.message);
            throw error;
        }
    }

    /**
     * Get Device Info (including status and online state)
     */
    async getDeviceInfo(deviceId = this.deviceId) {
        if (!deviceId) throw new Error('Device ID not provided');
        const res = await this.request('GET', `/v1.0/devices/${deviceId}`);
        if (res.success) {
            logger.info(`Tuya Device [${deviceId}] Raw Data: ${JSON.stringify(res.result.status)}`);
        }
        return res;
    }

    /**
     * Send Device Command
     */
    async sendCommand(deviceId = this.deviceId, commands) {
        if (!deviceId) throw new Error('Device ID not provided');
        return this.request('POST', `/v1.0/devices/${deviceId}/commands`, { commands });
    }
}

module.exports = new TuyaService();
