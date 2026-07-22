const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const secretService = require('./secretService');

const configuredTimeout = Number.parseInt(process.env.TUYA_API_TIMEOUT_MS || '', 10);
const TUYA_API_TIMEOUT_MS = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 1000), 30000)
    : 10000;

/**
 * Tuya OpenAPI Service
 */
class TuyaService {
    constructor() {
        this.token = null;
        this.tokenExpireTime = 0;
        this.tokenPromise = null;
    }

    get accessKey() { return secretService.getSecretSync('TUYA_ACCESS_KEY'); }
    get secretKey() { return secretService.getSecretSync('TUYA_SECRET_KEY'); }
    get baseUrl() { return secretService.getSecretSync('TUYA_ENDPOINT') || 'https://openapi.tuyacn.com'; }
    get deviceId() { return secretService.getSecretSync('TUYA_DEVICE_ID'); }

    assertCredentials() {
        if (!this.accessKey || !this.secretKey) {
            const error = new Error('Tuya API credentials are not configured');
            error.statusCode = 503;
            throw error;
        }
    }

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
        this.assertCredentials();
        if (this.token && Date.now() < this.tokenExpireTime) {
            return this.token;
        }

        if (this.tokenPromise) return this.tokenPromise;

        this.tokenPromise = this._fetchAccessToken();
        try {
            return await this.tokenPromise;
        } finally {
            this.tokenPromise = null;
        }
    }

    async _fetchAccessToken() {

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
                timeout: TUYA_API_TIMEOUT_MS
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
    async request(method, path, body = null, options = {}) {
        const retryAuth = options.retryAuth !== false;
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
            timeout: TUYA_API_TIMEOUT_MS
        };

        if (body) config.data = body;

        const startTime = Date.now();
        try {
            const res = await axios(config);
            const duration = Date.now() - startTime;

            if (res.data && !res.data.success) {
                logger.warn(`Tuya API ${method} ${path} Warning [${res.data.code}]: ${res.data.msg} (${duration}ms)`);
                if (retryAuth && ['1010', '1011', '1400'].includes(String(res.data.code))) {
                    this.token = null;
                    this.tokenExpireTime = 0;
                    logger.warn(`Tuya API ${method} ${path}: refreshing rejected access token once`);
                    return this.request(method, path, body, { retryAuth: false });
                }
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
