/**
 * 涂鸦消息订阅服务 - Pulsar WebSocket 实现
 * 
 * 用于接收设备实时状态推送，支持热泵设备的实时数据通讯
 * 基于涂鸦官方 SDK 实现
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const EventEmitter = require('events');
const TuyaDevice = require('../models/TuyaDevice');
const TuyaDeviceLog = require('../models/TuyaDeviceLog');
const logger = require('../utils/logger');
const secretService = require('./secretService');

// ========================= 配置 =========================

const WS_URLS = {
    CN: 'wss://mqe.tuyacn.com:8285/',
    US: 'wss://mqe.tuyaus.com:8285/',
    EU: 'wss://mqe.tuyaeu.com:8285/',
    IN: 'wss://mqe.tuyain.com:8285/'
};

const ENV_CONFIG = {
    PROD: 'event',
    TEST: 'event-test'
};

// ========================= 工具函数 =========================

/**
 * 生成 Topic URL
 * 格式: wss://xxx/ws/v2/consumer/persistent/{accessId}/out/{env}/{accessId}-sub
 */
function getTopicUrl(wsUrl, accessId, env) {
    const query = 'ackTimeoutMillis=30000&subscriptionType=Failover';
    return `${wsUrl}ws/v2/consumer/persistent/${accessId}/out/${env}/${accessId}-sub?${query}`;
}

/**
 * 生成认证密码
 * 算法: MD5(accessId + MD5(accessKey)).substr(8, 16)
 */
function buildPassword(accessId, accessKey) {
    const key = CryptoJS.MD5(accessKey).toString();
    return CryptoJS.MD5(accessId + key).toString().substr(8, 16);
}

/**
 * AES-GCM 解密
 */
function decryptGCM(data, accessKey) {
    try {
        const buffer = Buffer.from(data, 'base64');
        const iv = buffer.slice(0, 12);
        const tag = buffer.slice(-16);
        const ciphertext = buffer.slice(12, buffer.length - 16);
        const key = accessKey.substring(8, 24);

        const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
        decipher.setAuthTag(tag);
        let str = decipher.update(ciphertext);
        str += decipher.final('utf8');
        return JSON.parse(str);
    } catch (e) {
        logger.error('Tuya Message Decrypt GCM Failed:', e.message);
        return null;
    }
}

/**
 * AES-ECB 解密 (备用)
 */
function decryptECB(data, accessKey) {
    try {
        const realKey = CryptoJS.enc.Utf8.parse(accessKey.substring(8, 24));
        const decrypted = CryptoJS.AES.decrypt(data, realKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        });
        return JSON.parse(CryptoJS.enc.Utf8.stringify(decrypted));
    } catch (e) {
        logger.error('Tuya Message Decrypt ECB Failed:', e.message);
        return null;
    }
}

/**
 * 根据加密模式解密
 */
function decrypt(data, accessKey, mode) {
    if (mode === 'aes_gcm') {
        return decryptGCM(data, accessKey);
    }
    return decryptECB(data, accessKey);
}

// ========================= 消息订阅服务 =========================

class TuyaMessageService extends EventEmitter {
    constructor() {
        super();
        this.wsUrl = WS_URLS.CN;
        this.env = ENV_CONFIG.TEST; // 切换到测试环境 (event-test)以接收调试设备消息
        this.maxRetryTimes = 100;
        this.retryTimeout = 5000;

        this.ws = null;
        this.timer = null;
        this.retryTimes = 0;
        this.isConnected = false;
    }

    get accessId() { return secretService.getSecretSync('TUYA_ACCESS_KEY'); }
    get accessKey() { return secretService.getSecretSync('TUYA_SECRET_KEY'); }

    /**
     * 初始化并启动连接
     */
    init() {
        if (!this.accessId || !this.accessKey) {
            logger.warn('Tuya Message Service: Credentials missing, skipping initialization');
            return;
        }

        logger.info('Tuya Message Service: Initializing...');
        this._connect(true);
    }

    /**
     * 停止服务
     */
    stop() {
        this._clearTimer();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        logger.info('Tuya Message Service: Stopped');
    }

    /**
     * 确认消息已处理
     */
    ackMessage(messageId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ messageId }));
        }
    }

    /**
     * 建立 WebSocket 连接
     */
    _connect(isInit = false) {
        const topicUrl = getTopicUrl(this.wsUrl, this.accessId, this.env);
        const password = buildPassword(this.accessId, this.accessKey);

        logger.info(`Tuya Message Service: Connecting to ${this.wsUrl.replace('wss://', '').split(':')[0]}...`);

        this.ws = new WebSocket(topicUrl, {
            rejectUnauthorized: false,
            headers: {
                'username': this.accessId,
                'password': password
            }
        });

        this.ws.on('open', () => {
            this.retryTimes = 0;
            this.isConnected = true;
            this._keepAlive();
            logger.info('Tuya Message Service: Connected!');
            this.emit(isInit ? 'open' : 'reconnect');
        });

        this.ws.on('message', (data) => {
            this._keepAlive();
            try {
                const message = this._handleMessage(data.toString());
                if (message) {
                    this._processDeviceMessage(message);
                }
            } catch (e) {
                logger.error('Tuya Message Service: Message handling error:', e.message);
            }
        });

        this.ws.on('ping', () => {
            this._keepAlive();
            this.ws.pong(this.accessId);
        });

        this.ws.on('pong', () => {
            this._keepAlive();
        });

        this.ws.on('error', (err) => {
            logger.error('Tuya Message Service: WebSocket error:', err.message);
        });

        this.ws.on('close', (code, reason) => {
            this._clearTimer();
            this.isConnected = false;
            logger.warn(`Tuya Message Service: Connection closed (${code})`);
            this._reconnect();
        });
    }

    /**
     * 解析收到的消息
     */
    _handleMessage(data) {
        const { payload, properties, messageId } = JSON.parse(data);

        // 自动 ACK
        if (messageId) {
            this.ackMessage(messageId);
        }

        if (!payload) return null;

        const encryptMode = properties?.em;
        const payloadStr = Buffer.from(payload, 'base64').toString('utf-8');
        const payloadJson = JSON.parse(payloadStr);

        // 解密数据部分
        if (payloadJson.data && typeof payloadJson.data === 'string') {
            payloadJson.data = decrypt(payloadJson.data, this.accessKey, encryptMode);
        }

        return payloadJson;
    }

    /**
     * 处理设备消息
     */
    async _processDeviceMessage(payload) {
        // Tuya V2 Message Structure:
        // payload = { data: { bizCode: '...', bizData: { ... } }, protocol: 20, ... }
        // We need to handle both direct structure (if V1) and nested structure (V2) safely.

        let bizCode, bizData, ts;

        if (payload.bizCode) {
            // V1 or simplified structure
            bizCode = payload.bizCode;
            bizData = payload.data;
            ts = payload.ts;
        } else if (payload.data && payload.data.bizCode) {
            // V2 structure (as seen in logs)
            bizCode = payload.data.bizCode;
            bizData = payload.data.bizData;
            ts = payload.data.ts;
        } else {
            logger.debug('Unknown Tuya payload structure', JSON.stringify(payload).substring(0, 200));
            return;
        }

        if (!bizData) return;

        const devId = bizData.devId;
        if (!devId) return;

        logger.debug(`Tuya Message [${bizCode}] for device ${devId}`);

        try {
            switch (bizCode) {
                case 'statusReport':
                case 'devicePropertyMessage': // Added support for V2 property message
                    // V2 reports properties in 'properties' array, V1 in 'status'
                    // Normalize to 'status' for internal handler
                    if (bizData.properties) {
                        bizData.status = bizData.properties;
                    }
                    await this._handleStatusReport(devId, bizData);
                    break;
                case 'online':
                case 'deviceOnline':
                    await this._handleDeviceOnline(devId);
                    break;
                case 'offline':
                case 'deviceOffline':
                    await this._handleDeviceOffline(devId);
                    break;
                default:
                    logger.debug(`Tuya Message: Unhandled bizCode ${bizCode}`);
            }
        } catch (err) {
            logger.error('Tuya Message: Process device message error:', err.message);
        }
    }

    /**
     * 处理状态上报
     */
    async _handleStatusReport(devId, data) {
        const { status } = data;
        if (!status || !Array.isArray(status)) return;

        logger.debug(`Tuya Status Report [${devId}]: ${JSON.stringify(status.map(s => `${s.code}=${JSON.stringify(s.value)}`))}`);

        // 更新数据库中的设备状态
        try {
            let device = await TuyaDevice.findOne({ deviceId: devId });

            if (!device) {
                // 如果设备不存在，创建新记录
                device = new TuyaDevice({
                    deviceId: devId,
                    status: [],
                    online: true
                });
            }

            const now = new Date();
            const logDocs = [];

            // 更新状态
            for (const item of status) {
                const existingIndex = device.status.findIndex(s => s.code === item.code);
                if (existingIndex > -1) {
                    device.status[existingIndex].value = item.value;
                    device.status[existingIndex].updatedAt = now;
                } else {
                    device.status.push({
                        code: item.code,
                        value: item.value,
                        updatedAt: now
                    });
                }

                logDocs.push({
                    deviceId: devId,
                    code: item.code,
                    value: item.value
                });
            }

            device.updatedAt = now;
            device.lastMessageAt = now;
            await device.save();

            if (logDocs.length > 0) {
                TuyaDeviceLog.insertMany(logDocs, { ordered: false }).catch((insertErr) => {
                    logger.error('Tuya Message: Batch write log error:', insertErr.message);
                });
            }

            // 触发事件，可用于 WebSocket 推送给前端
            this.emit('statusUpdate', { devId, status });

        } catch (err) {
            logger.error('Tuya Message: Save status to DB error:', err.message);
        }
    }

    /**
     * 处理设备上线
     */
    async _handleDeviceOnline(devId) {
        logger.info(`Tuya Device Online: ${devId}`);

        try {
            await TuyaDevice.findOneAndUpdate(
                { deviceId: devId },
                { $set: { online: true, updatedAt: new Date() } },
                { upsert: true }
            );
            this.emit('deviceOnline', { devId });
        } catch (err) {
            logger.error('Tuya Message: Update online status error:', err.message);
        }
    }

    /**
     * 处理设备下线
     */
    async _handleDeviceOffline(devId) {
        logger.warn(`Tuya Device Offline: ${devId}`);

        try {
            await TuyaDevice.findOneAndUpdate(
                { deviceId: devId },
                { $set: { online: false, updatedAt: new Date() } },
                { upsert: true }
            );
            this.emit('deviceOffline', { devId });
        } catch (err) {
            logger.error('Tuya Message: Update offline status error:', err.message);
        }
    }

    /**
     * 保持连接活跃
     */
    _keepAlive() {
        this._clearTimer();
        this.timer = setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping(this.accessId);
            }
        }, 30000);
    }

    /**
     * 清除定时器
     */
    _clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * 自动重连
     */
    _reconnect() {
        if (this.retryTimes < this.maxRetryTimes) {
            this.retryTimes++;
            logger.info(`Tuya Message Service: Reconnecting in ${this.retryTimeout / 1000}s (${this.retryTimes}/${this.maxRetryTimes})`);
            setTimeout(() => this._connect(false), this.retryTimeout);
        } else {
            logger.error('Tuya Message Service: Max retry attempts reached');
        }
    }

    /**
     * 获取连接状态
     */
    getStatus() {
        return {
            connected: this.isConnected,
            retryTimes: this.retryTimes
        };
    }
}

module.exports = new TuyaMessageService();
