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
const mongoose = require('mongoose');
const TuyaDevice = require('../models/TuyaDevice');
const TuyaDeviceLog = require('../models/TuyaDeviceLog');
const TuyaMessageReceipt = require('../models/TuyaMessageReceipt');
const logger = require('../utils/logger');
const secretService = require('./secretService');
const { commandValuesMatch } = require('../utils/tuyaHeatPump');

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

function positiveInteger(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, minimum), maximum);
}

function resolveMessageConfig(env = process.env) {
    const region = String(env.TUYA_MESSAGE_REGION || 'CN').trim().toUpperCase();
    if (!WS_URLS[region]) {
        throw new Error(`Unsupported TUYA_MESSAGE_REGION: ${region}`);
    }

    const channelInput = String(env.TUYA_MESSAGE_CHANNEL || ENV_CONFIG.PROD).trim().toLowerCase();
    const channel = channelInput === 'test' ? ENV_CONFIG.TEST
        : channelInput === 'prod' ? ENV_CONFIG.PROD
            : channelInput;
    if (!Object.values(ENV_CONFIG).includes(channel)) {
        throw new Error(`Unsupported TUYA_MESSAGE_CHANNEL: ${channelInput}`);
    }
    if (env.NODE_ENV === 'production' && channel === ENV_CONFIG.TEST) {
        throw new Error('TUYA_MESSAGE_CHANNEL=event-test is forbidden in production');
    }

    return {
        wsUrl: WS_URLS[region],
        region,
        channel,
        maxQueueSize: positiveInteger(env.TUYA_MESSAGE_MAX_QUEUE, 1000, 1, 10000),
        maxDeviceQueueSize: positiveInteger(env.TUYA_MESSAGE_MAX_DEVICE_QUEUE, 100, 1, 1000),
        maxConcurrency: positiveInteger(env.TUYA_MESSAGE_MAX_CONCURRENCY, 8, 1, 64),
        receiptTtlDays: positiveInteger(env.TUYA_MESSAGE_RECEIPT_TTL_DAYS, 7, 1, 30)
    };
}

function isDuplicateKeyError(error) {
    return error?.code === 11000 || error?.code === 11001;
}

function receiptId(messageId) {
    return crypto.createHash('sha256').update(String(messageId)).digest('hex');
}

function extractBizMessage(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.bizCode && payload.data && typeof payload.data === 'object') {
        return { bizCode: payload.bizCode, bizData: payload.data };
    }
    if (payload.data?.bizCode && payload.data?.bizData) {
        return { bizCode: payload.data.bizCode, bizData: payload.data.bizData };
    }
    if (Number(payload.protocol) === 4 && payload.data && typeof payload.data === 'object') {
        return { bizCode: 'statusReport', bizData: payload.data };
    }
    return null;
}

function createMongoMessageDeduplicator({
    receiptModel = TuyaMessageReceipt,
    startSession = () => mongoose.startSession(),
    ttlDays = 7,
} = {}) {
    return {
        async runOnce(messageId, processMessage) {
            const id = receiptId(messageId);
            const session = await startSession();
            let processed = false;
            let value = null;
            try {
                await session.withTransaction(async () => {
                    const existing = await receiptModel.findById(id).session(session).lean();
                    if (existing) return;

                    value = await processMessage(session);
                    await receiptModel.create([{
                        _id: id,
                        processedAt: new Date(),
                        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
                    }], { session });
                    processed = true;
                });
            } catch (error) {
                if (!isDuplicateKeyError(error) || !await receiptModel.exists({ _id: id })) throw error;
                processed = false;
                value = null;
            } finally {
                await session.endSession();
            }
            return { processed, value };
        },
    };
}

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
    constructor(options = {}) {
        super();
        this.WebSocket = options.WebSocket || WebSocket;
        const messageConfig = options.messageConfig || resolveMessageConfig(options.env || process.env);
        this.wsUrl = messageConfig.wsUrl;
        this.region = messageConfig.region;
        this.maxQueueSize = messageConfig.maxQueueSize;
        this.maxDeviceQueueSize = messageConfig.maxDeviceQueueSize;
        this.maxConcurrency = messageConfig.maxConcurrency || 8;
        this.messageDeduplicator = options.messageDeduplicator || createMongoMessageDeduplicator({
            ttlDays: messageConfig.receiptTtlDays || 7,
        });
        this.env = messageConfig.channel;
        this.maxRetryTimes = 100;
        this.retryTimeout = 5000;

        this.ws = null;
        this.timer = null;
        this.reconnectTimer = null;
        this.retryTimes = 0;
        this.isConnected = false;
        this.shouldRun = false;
        this.deviceQueues = new Map();
        this.processingQueues = new Set();
        this.scheduledQueues = new Set();
        this.readyQueues = [];
        this.pendingMessageIds = new Set();
        this.totalQueued = 0;
        this.activeWorkers = 0;
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

        if (process.env.NODE_ENV === 'production' && this.env === ENV_CONFIG.TEST) {
            throw new Error('Tuya Message Service refuses to use the test channel in production');
        }

        this.shouldRun = true;
        logger.info(`Tuya Message Service: Initializing region=${this.region} channel=${this.env}`);
        this._connect(true);
    }

    /**
     * 停止服务
     */
    stop() {
        this.shouldRun = false;
        this._clearTimer();
        this._clearReconnectTimer();
        if (this.ws) {
            this.ws.removeAllListeners('close');
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        logger.info('Tuya Message Service: Stopped');
    }

    /**
     * 确认消息已处理
     */
    ackMessage(messageId, socket = this.ws) {
        if (!socket || socket.readyState !== this.WebSocket.OPEN) {
            return Promise.reject(new Error('Tuya message socket is not open'));
        }

        return new Promise((resolve, reject) => {
            socket.send(JSON.stringify({ messageId }), (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    /**
     * 建立 WebSocket 连接
     */
    _connect(isInit = false) {
        if (!this.shouldRun) return;

        const topicUrl = getTopicUrl(this.wsUrl, this.accessId, this.env);
        const password = buildPassword(this.accessId, this.accessKey);

        logger.info(`Tuya Message Service: Connecting to ${this.wsUrl.replace('wss://', '').split(':')[0]}...`);

        const socket = new this.WebSocket(topicUrl, {
            rejectUnauthorized: true,
            headers: {
                'username': this.accessId,
                'password': password
            }
        });
        this.ws = socket;

        socket.on('open', () => {
            if (this.ws !== socket) return;
            this.retryTimes = 0;
            this.isConnected = true;
            this._keepAlive();
            logger.info('Tuya Message Service: Connected!');
            this.emit(isInit ? 'open' : 'reconnect');
        });

        socket.on('message', (data) => {
            if (this.ws !== socket) return;
            this._keepAlive();
            try {
                const envelope = this._handleMessage(data.toString());
                if (envelope) this._enqueueMessage({ ...envelope, socket });
            } catch (e) {
                logger.error('Tuya Message Service: Message handling error:', e.message);
            }
        });

        socket.on('ping', () => {
            if (this.ws !== socket) return;
            this._keepAlive();
            socket.pong(this.accessId);
        });

        socket.on('pong', () => {
            if (this.ws !== socket) return;
            this._keepAlive();
        });

        socket.on('error', (err) => {
            logger.error('Tuya Message Service: WebSocket error:', err.message);
        });

        socket.on('close', (code, reason) => {
            if (this.ws !== socket) return;
            this._clearTimer();
            this.ws = null;
            this.isConnected = false;
            logger.warn(`Tuya Message Service: Connection closed (${code})`);
            if (this.shouldRun) this._reconnect();
        });
    }

    /**
     * 解析收到的消息
     */
    _handleMessage(data) {
        const { payload, properties, messageId } = JSON.parse(data);

        if (!payload) return messageId ? { messageId, payload: null } : null;

        const encryptMode = properties?.em;
        const payloadStr = Buffer.from(payload, 'base64').toString('utf-8');
        const payloadJson = JSON.parse(payloadStr);

        // 解密数据部分
        if (payloadJson.data && typeof payloadJson.data === 'string') {
            const decrypted = decrypt(payloadJson.data, this.accessKey, encryptMode);
            if (!decrypted) throw new Error('Tuya message payload decryption failed');
            payloadJson.data = decrypted;
        }

        return { messageId, payload: payloadJson };
    }

    _getQueueKey(payload) {
        return String(extractBizMessage(payload)?.bizData?.devId || '__unscoped__');
    }

    _enqueueMessage(envelope) {
        const { messageId } = envelope;
        if (messageId && this.pendingMessageIds.has(messageId)) return false;

        const queueKey = this._getQueueKey(envelope.payload);
        const queue = this.deviceQueues.get(queueKey) || [];
        if (this.totalQueued >= this.maxQueueSize || queue.length >= this.maxDeviceQueueSize) {
            logger.warn(`Tuya Message Service: Queue full, leaving message unacked (device=${queueKey})`);
            return false;
        }

        queue.push(envelope);
        this.deviceQueues.set(queueKey, queue);
        this.totalQueued += 1;
        if (messageId) this.pendingMessageIds.add(messageId);
        this._scheduleQueue(queueKey);
        return true;
    }

    _scheduleQueue(queueKey) {
        if (this.processingQueues.has(queueKey) || this.scheduledQueues.has(queueKey)) return;
        this.scheduledQueues.add(queueKey);
        this.readyQueues.push(queueKey);
        this._pumpQueues();
    }

    _pumpQueues() {
        while (this.activeWorkers < this.maxConcurrency && this.readyQueues.length > 0) {
            const queueKey = this.readyQueues.shift();
            this.scheduledQueues.delete(queueKey);
            if (!(this.deviceQueues.get(queueKey) || []).length || this.processingQueues.has(queueKey)) continue;

            this.activeWorkers += 1;
            this.processingQueues.add(queueKey);
            this._processNextMessage(queueKey).catch((error) => {
                logger.error('Tuya Message Service: Queue drain error:', error.message);
            }).finally(() => {
                this.activeWorkers = Math.max(0, this.activeWorkers - 1);
                this.processingQueues.delete(queueKey);
                const queue = this.deviceQueues.get(queueKey) || [];
                if (queue.length > 0) this._scheduleQueue(queueKey);
                else this.deviceQueues.delete(queueKey);
                this._pumpQueues();
            });
        }
    }

    _emitProcessedEvent(event) {
        if (event?.name) this.emit(event.name, event.payload);
    }

    async _processEnvelope(envelope) {
        const processMessage = async (session = null) => {
            if (!envelope.payload) return null;
            return this._processDeviceMessage(envelope.payload, { session });
        };

        if (!envelope.messageId) {
            this._emitProcessedEvent(await processMessage());
            return;
        }

        const result = await this.messageDeduplicator.runOnce(envelope.messageId, processMessage);
        if (result.processed) this._emitProcessedEvent(result.value);
    }

    async _processNextMessage(queueKey) {
        const queue = this.deviceQueues.get(queueKey);
        if (!queue || queue.length === 0) return;
        const envelope = queue[0];
        try {
            await this._processEnvelope(envelope);
            if (envelope.messageId) await this.ackMessage(envelope.messageId, envelope.socket);
        } catch (error) {
            logger.error(`Tuya Message Service: Processing failed, message left unacked: ${error.message}`);
        } finally {
            queue.shift();
            this.totalQueued = Math.max(0, this.totalQueued - 1);
            if (envelope.messageId) this.pendingMessageIds.delete(envelope.messageId);
            if (queue.length === 0 && !this.processingQueues.has(queueKey)) {
                this.deviceQueues.delete(queueKey);
            }
        }
    }

    /**
     * 处理设备消息
     */
    async _processDeviceMessage(payload, { session = null } = {}) {
        // Tuya V2 Message Structure:
        // payload = { data: { bizCode: '...', bizData: { ... } }, protocol: 20, ... }
        // We need to handle both direct structure (if V1) and nested structure (V2) safely.

        const message = extractBizMessage(payload);
        if (!message) {
            logger.debug('Unknown Tuya payload structure', JSON.stringify(payload).substring(0, 200));
            return;
        }
        const { bizCode, bizData } = message;

        if (!bizData) return;

        const devId = bizData.devId;
        if (!devId) return;

        logger.debug(`Tuya Message [${bizCode}] for device ${devId}`);

        switch (bizCode) {
            case 'statusReport':
            case 'devicePropertyMessage':
                if (bizData.properties) {
                    bizData.status = bizData.properties;
                }
                return this._handleStatusReport(devId, bizData, { session });
            case 'online':
            case 'deviceOnline':
                return this._handleDeviceOnline(devId, { session });
            case 'offline':
            case 'deviceOffline':
                return this._handleDeviceOffline(devId, { session });
            default:
                logger.debug(`Tuya Message: Unhandled bizCode ${bizCode}`);
                return null;
        }
    }

    /**
     * 处理状态上报
     */
    async _handleStatusReport(devId, data, { session = null } = {}) {
        const { status } = data;
        if (!status || !Array.isArray(status)) return;

        logger.debug(`Tuya Status Report [${devId}]: ${JSON.stringify(status.map(s => `${s.code}=${JSON.stringify(s.value)}`))}`);

        // 更新数据库中的设备状态
        try {
            let deviceQuery = TuyaDevice.findOne({ deviceId: devId });
            if (session) deviceQuery = deviceQuery.session(session);
            let device = await deviceQuery;

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
            device.lastStatusAt = now;
            device.online = true;
            if (
                ['pending', 'accepted'].includes(device.lastCommand?.state)
                && commandValuesMatch(device.status, device.lastCommand.commands)
            ) {
                device.lastCommand.state = 'confirmed';
                device.lastCommand.confirmedAt = now;
                device.lastCommand.error = undefined;
            }
            await device.save(session ? { session } : undefined);

            if (logDocs.length > 0) {
                await TuyaDeviceLog.insertMany(logDocs, { ordered: false, ...(session ? { session } : {}) });
            }

            return { name: 'statusUpdate', payload: { devId, status } };

        } catch (err) {
            logger.error('Tuya Message: Save status to DB error:', err.message);
            throw err;
        }
    }

    /**
     * 处理设备上线
     */
    async _handleDeviceOnline(devId, { session = null } = {}) {
        logger.info(`Tuya Device Online: ${devId}`);

        try {
            await TuyaDevice.findOneAndUpdate(
                { deviceId: devId },
                { $set: { online: true, updatedAt: new Date(), lastMessageAt: new Date() } },
                { upsert: true, ...(session ? { session } : {}) }
            );
            return { name: 'deviceOnline', payload: { devId } };
        } catch (err) {
            logger.error('Tuya Message: Update online status error:', err.message);
            throw err;
        }
    }

    /**
     * 处理设备下线
     */
    async _handleDeviceOffline(devId, { session = null } = {}) {
        logger.warn(`Tuya Device Offline: ${devId}`);

        try {
            await TuyaDevice.findOneAndUpdate(
                { deviceId: devId },
                { $set: { online: false, updatedAt: new Date(), lastMessageAt: new Date() } },
                { upsert: true, ...(session ? { session } : {}) }
            );
            return { name: 'deviceOffline', payload: { devId } };
        } catch (err) {
            logger.error('Tuya Message: Update offline status error:', err.message);
            throw err;
        }
    }

    /**
     * 保持连接活跃
     */
    _keepAlive() {
        this._clearTimer();
        this.timer = setTimeout(() => {
            if (this.ws && this.ws.readyState === this.WebSocket.OPEN) {
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

    _clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * 自动重连
     */
    _reconnect() {
        if (!this.shouldRun || this.reconnectTimer) return;
        if (this.retryTimes < this.maxRetryTimes) {
            this.retryTimes++;
            logger.info(`Tuya Message Service: Reconnecting in ${this.retryTimeout / 1000}s (${this.retryTimes}/${this.maxRetryTimes})`);
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this._connect(false);
            }, this.retryTimeout);
            this.reconnectTimer.unref?.();
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
            retryTimes: this.retryTimes,
            region: this.region,
            channel: this.env,
            queued: this.totalQueued
        };
    }
}

module.exports = new TuyaMessageService();
module.exports.TuyaMessageService = TuyaMessageService;
module.exports.resolveMessageConfig = resolveMessageConfig;
module.exports.extractBizMessage = extractBizMessage;
