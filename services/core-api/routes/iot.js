const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('node:crypto');
const auth = require('../middleware/auth');
const authorizeAccess = require('../middleware/authorizeAccess');
const secretService = require('../services/secretService');
const logger = require('../utils/logger');
const { resolveInternalServiceUrl } = require('../utils/internalServiceUrl');

const DEFAULT_PRIMARY_DEVICE_ID = 'esp8266_living';
const DEFAULT_SECONDARY_DEVICE_ID = 'esp01s_relay';
const DEFAULT_RELAY_ID = 'relay1';

function getMqttRequestTimeoutMs() {
    const parsed = Number.parseInt(process.env.CORE_MQTT_API_TIMEOUT_MS || '8000', 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1000), 9000) : 8000;
}

function getMqttProxyStatus(error) {
    if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return 504;
    const upstreamStatus = Number(error?.response?.status || error?.status);
    return Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599
        ? upstreamStatus
        : 502;
}

const smartControlViewAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['smart_control', 'view_smart_control', 'manage_smart_control'],
});

const smartControlManageAccess = authorizeAccess({
    roles: ['admin', 'super_admin'],
    permissions: ['smart_control', 'manage_smart_control'],
});

function getSecretValue(...keys) {
    for (const key of keys) {
        const value = secretService.getSecretSync(key);
        if (value) return value;
    }
    return null;
}

function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/+$/, '');
}

function getMqttApiBaseUrl() {
    const deploymentUrl = process.env.IOT_SERVICE_URL || process.env.MQTT_API_BASE_URL;
    const developmentOverride = process.env.NODE_ENV === 'production'
        ? ''
        : getSecretValue('MQTT_API_BASE_URL');
    return normalizeBaseUrl(resolveInternalServiceUrl({
        value: deploymentUrl || developmentOverride,
        serviceName: 'iot-service',
        developmentFallback: 'http://127.0.0.1:22102',
    }));
}

function getMqttApiKey() {
    return getSecretValue('MQTT_API_KEY', 'MQTT_API_TOKEN', 'MQTTAPI_TOKEN');
}

function getMqttApiHeaders(req = null) {
    const apiKey = getMqttApiKey();
    if (!apiKey) {
        const error = new Error('Server not configured: MQTT_API_KEY missing');
        error.status = 500;
        throw error;
    }

    return {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-Id': req?.id || req?.headers?.['x-request-id'] || crypto.randomUUID(),
        'X-Service-Caller': 'core-api',
        ...(req?.headers?.['idempotency-key'] ? { 'Idempotency-Key': req.headers['idempotency-key'] } : {}),
    };
}

function isTransientIotError(error) {
    const status = Number(error?.response?.status);
    return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)
        || status === 502
        || status === 503
        || status === 504;
}

async function getIotDevices(req) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            return await axios.get(`${getMqttApiBaseUrl()}/api/devices`, {
                headers: getMqttApiHeaders(req),
                timeout: getMqttRequestTimeoutMs(),
            });
        } catch (error) {
            lastError = error;
            if (attempt === 2 || !isTransientIotError(error)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw lastError;
}

function getConfiguredDevice(slot) {
    const prefix = slot === 'secondary' ? 'MQTT_SECONDARY' : 'MQTT_PRIMARY';
    return {
        deviceId: getSecretValue(`${prefix}_DEVICE_ID`)
            || (slot === 'secondary' ? DEFAULT_SECONDARY_DEVICE_ID : DEFAULT_PRIMARY_DEVICE_ID),
        relayId: getSecretValue(`${prefix}_RELAY_ID`) || DEFAULT_RELAY_ID,
    };
}

function getByPath(source, path) {
    if (!source || typeof source !== 'object') return undefined;
    return path.split('.').reduce((value, key) => {
        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
            return value[key];
        }
        return undefined;
    }, source);
}

function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

function pickFirst(source, paths) {
    for (const path of paths) {
        const value = getByPath(source, path);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
}

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function normalizeTimestamp(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 1000000000000 ? value * 1000 : value;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeOnline(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value !== 'string') return false;

    const normalized = value.trim().toLowerCase();
    return ['online', 'connected', 'connect', 'active', 'ok', 'true', '1', 'up'].includes(normalized);
}

function normalizeRelayStatus(value) {
    if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
    if (typeof value === 'number') return value === 1 ? 'ON' : 'OFF';
    if (typeof value !== 'string') return undefined;

    const normalized = value.trim().toLowerCase();
    if (['on', 'close', 'closed', 'enable', 'enabled', 'true', '1'].includes(normalized)) return 'ON';
    if (['off', 'open', 'opened', 'disable', 'disabled', 'false', '0'].includes(normalized)) return 'OFF';
    return undefined;
}

function normalizeControlStatus(value) {
    const relayStatus = normalizeRelayStatus(value);
    if (!relayStatus) return undefined;
    return relayStatus === 'ON' ? 'on' : 'off';
}

function getDeviceId(device) {
    if (!device || typeof device !== 'object') return device;
    return firstDefined(
        device.deviceId,
        device.device_id,
        device.deviceID,
        device.id,
        device._id,
        device.clientId,
        device.clientid,
        device.name,
        device.sn
    );
}

function withDeviceIdFromKey(device, key) {
    if (!device || typeof device !== 'object' || Array.isArray(device)) return device;
    if (getDeviceId(device)) return device;
    return { deviceId: key, ...device };
}

function looksLikeDevice(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return [
        'deviceId',
        'device_id',
        'deviceID',
        'id',
        '_id',
        'clientId',
        'clientid',
        'temperature',
        'temp',
        'humidity',
        'hum',
        'metrics',
        'sensor',
        'sensors',
        'readings',
        'telemetry',
        'relays',
        'relay',
        'switches',
        'online',
        'onlineState',
        'online_state',
        'connectionStatus',
        'connection_status',
    ].some((key) => keys.includes(key));
}

function extractDevices(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    if (looksLikeDevice(payload)) {
        return [payload];
    }

    const candidates = [
        payload.data,
        payload.devices,
        payload.result,
        payload.results,
        payload.items,
        payload.list,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
        if (candidate && typeof candidate === 'object') {
            if (looksLikeDevice(candidate)) return [candidate];

            const mappedDevices = Object.entries(candidate)
                .filter(([, value]) => looksLikeDevice(value))
                .map(([key, value]) => withDeviceIdFromKey(value, key));
            if (mappedDevices.length > 0) return mappedDevices;

            const nested = extractDevices(candidate);
            if (nested.length > 0) return nested;
        }
    }

    const mappedDevices = Object.entries(payload)
        .filter(([, value]) => looksLikeDevice(value))
        .map(([key, value]) => withDeviceIdFromKey(value, key));
    if (mappedDevices.length > 0) return mappedDevices;

    return [];
}

function findDevice(devices, configuredId, fallbackIndex, allowFallback = true) {
    if (!Array.isArray(devices) || devices.length === 0) return null;

    const exact = devices.find((device) => String(getDeviceId(device)) === String(configuredId));
    if (exact) return exact;

    if (!allowFallback) return null;
    return devices[fallbackIndex] || devices[0] || null;
}

function getMetric(device, kind) {
    const tempPaths = [
        'temp',
        'temperature',
        'temperatureC',
        'temperature_c',
        'tempC',
        'temp_c',
        'metrics.temp.value',
        'metrics.temp',
        'metrics.temperature',
        'metrics.temperature.value',
        'metrics.temperature_c',
        'sensor.temp',
        'sensor.temp.value',
        'sensor.temperature',
        'sensor.temperature.value',
        'sensor.temperature_c',
        'sensors.temp',
        'sensors.temp.value',
        'sensors.temperature',
        'sensors.temperature.value',
        'sensors.temperature_c',
        'readings.temp',
        'readings.temperature',
        'readings.temperature_c',
        'telemetry.temp',
        'telemetry.temperature',
        'telemetry.temperature_c',
        'data.temp',
        'data.temperature',
        'data.temperature_c',
    ];
    const humPaths = [
        'hum',
        'humidity',
        'humidityPercent',
        'humidity_percent',
        'metrics.hum.value',
        'metrics.hum',
        'metrics.humidity',
        'metrics.humidity.value',
        'metrics.humidity_percent',
        'sensor.hum',
        'sensor.hum.value',
        'sensor.humidity',
        'sensor.humidity.value',
        'sensor.humidity_percent',
        'sensors.hum',
        'sensors.hum.value',
        'sensors.humidity',
        'sensors.humidity.value',
        'sensors.humidity_percent',
        'readings.hum',
        'readings.humidity',
        'readings.humidity_percent',
        'telemetry.hum',
        'telemetry.humidity',
        'telemetry.humidity_percent',
        'data.hum',
        'data.humidity',
        'data.humidity_percent',
    ];

    return toNumber(pickFirst(device, kind === 'humidity' ? humPaths : tempPaths));
}

function readRelayItemStatus(item) {
    if (item === undefined || item === null) return undefined;
    if (typeof item !== 'object') return item;
    return firstDefined(item.status, item.state, item.value, item.on, item.enabled, item.power);
}

function getRelayFromCollection(collection, relayId) {
    if (!collection) return undefined;

    if (Array.isArray(collection)) {
        const found = collection.find((relay) => {
            if (!relay || typeof relay !== 'object') return false;
            const id = firstDefined(relay.relayId, relay.relay_id, relay.id, relay.name, relay.channel);
            return String(id) === String(relayId);
        });
        return readRelayItemStatus(found || collection[0]);
    }

    if (typeof collection === 'object') {
        if (Object.prototype.hasOwnProperty.call(collection, relayId)) {
            return readRelayItemStatus(collection[relayId]);
        }

        const firstValue = Object.values(collection)[0];
        return readRelayItemStatus(firstValue);
    }

    return collection;
}

function getRelayStatus(device, relayId) {
    if (!device) return undefined;

    const directValue = firstDefined(
        device[relayId],
        pickFirst(device, [
            `${relayId}.status`,
            `${relayId}.state`,
            `status.${relayId}`,
            `state.${relayId}`,
            'relayStatus',
            'relay_status',
            'relay.status',
            'relay.state',
            'relay.value',
            'switchStatus',
            'switch_status',
            'switch.status',
            'switch.state',
        ])
    );
    if (directValue !== undefined) return normalizeRelayStatus(readRelayItemStatus(directValue));

    const collectionValue = firstDefined(
        getRelayFromCollection(device.relays, relayId),
        getRelayFromCollection(device.relay, relayId),
        getRelayFromCollection(device.relayStatuses, relayId),
        getRelayFromCollection(device.relay_statuses, relayId),
        getRelayFromCollection(device.switches, relayId),
        getRelayFromCollection(device.switchStatuses, relayId),
        getRelayFromCollection(device.switch_statuses, relayId)
    );

    return normalizeRelayStatus(collectionValue);
}

function getDeviceOnline(device) {
    if (!device) return false;
    const explicitStatus = firstDefined(
        device.deviceOnline,
        device.online,
        device.isOnline,
        device.is_online,
        device.onlineState,
        device.online_state,
        device.connected,
        device.isConnected,
        device.is_connected,
        device.connectionStatus,
        device.connection_status,
        device.connectStatus,
        device.connect_status,
        device.status,
        device.state
    );

    if (explicitStatus !== undefined) return normalizeOnline(explicitStatus);

    return getMetric(device, 'temperature') !== undefined ||
        getMetric(device, 'humidity') !== undefined ||
        getRelayStatus(device, getConfiguredDevice('primary').relayId) !== undefined;
}

function getDeviceTimestamp(device) {
    if (!device) return undefined;
    return normalizeTimestamp(firstDefined(
        device.timestamp,
        device.lastMsgTimestamp,
        device.lastSeen,
        device.last_seen,
        device.updatedAt,
        device.updated_at,
        device.createdAt,
        device.created_at
    ));
}

function normalizeDeviceSnapshots(payload) {
    const devices = extractDevices(payload);
    const primaryConfig = getConfiguredDevice('primary');
    const secondaryConfig = getConfiguredDevice('secondary');
    const exactPrimaryDevice = findDevice(devices, primaryConfig.deviceId, 0, false);
    const primaryDevice = exactPrimaryDevice
        || devices.find((device) => getMetric(device, 'temperature') !== undefined || getMetric(device, 'humidity') !== undefined)
        || findDevice(devices, primaryConfig.deviceId, 0);
    const secondaryDevice = findDevice(devices, secondaryConfig.deviceId, 1, false)
        || devices.find((device) => device !== primaryDevice)
        || null;
    const timestamp = getDeviceTimestamp(primaryDevice) || getDeviceTimestamp(secondaryDevice) || Date.now();
    const temp = getMetric(primaryDevice, 'temperature');
    const hum = getMetric(primaryDevice, 'humidity');
    const hasDevices = devices.length > 0;
    const primaryDeviceId = getDeviceId(primaryDevice);
    const diagnosticMessage = !hasDevices
        ? '新 API 没有返回设备快照，请检查 MQTT_API_KEY 权限或设备是否已注册'
        : (!temp && temp !== 0) && (!hum && hum !== 0)
            ? `已获取 ${devices.length} 台设备，但未在主设备 ${primaryDeviceId || primaryConfig.deviceId} 中解析到温湿度字段`
            : '';

    return {
        temp,
        hum,
        timestamp,
        mqttConnected: hasDevices,
        subscribed: hasDevices,
        deviceOnline: getDeviceOnline(primaryDevice),
        lastMsgTimestamp: timestamp,
        relayStatus: getRelayStatus(primaryDevice, primaryConfig.relayId),
        relay2Status: getRelayStatus(secondaryDevice, secondaryConfig.relayId),
        esp01sOnline: getDeviceOnline(secondaryDevice),
        diagnosticMessage,
        configuredPrimaryDeviceId: primaryConfig.deviceId,
        matchedPrimaryDeviceId: primaryDeviceId || '',
        devices: devices.map((device) => ({
            deviceId: getDeviceId(device),
            online: getDeviceOnline(device),
            timestamp: getDeviceTimestamp(device),
        })),
    };
}

function resolveControlTarget(body) {
    if (body.deviceId && body.relayId) {
        return {
            deviceId: body.deviceId,
            relayId: body.relayId,
        };
    }

    const target = body.target || body.slot;
    if (target === 'secondary' || (body.topic && String(body.topic).includes('home/relay'))) {
        return getConfiguredDevice('secondary');
    }

    return getConfiguredDevice('primary');
}

// 获取IoT设备信息 (温湿度+状态)
router.get('/info', auth.verifyToken, smartControlViewAccess, async (req, res) => {
    try {
        const response = await getIotDevices(req);

        res.json({
            success: true,
            data: normalizeDeviceSnapshots(response.data),
        });
    } catch (error) {
        logger.error('IoT Info Error:', error.response ? error.response.data : error.message);
        const statusCode = getMqttProxyStatus(error);
        res.status(statusCode).json({
            success: false,
            code: statusCode === 504 ? 'IOT_UPSTREAM_TIMEOUT' : 'IOT_UPSTREAM_UNAVAILABLE',
            error: statusCode >= 500 ? 'IoT service is temporarily unavailable' : error.message,
            data: null,
        });
    }
});

// 控制设备
router.post('/control', auth.verifyToken, smartControlManageAccess, async (req, res) => {
    try {
        const { payload, status } = req.body;
        const controlStatus = normalizeControlStatus(firstDefined(status, payload));

        if (!controlStatus) {
            return res.status(400).json({ success: false, error: 'Missing or invalid control status' });
        }

        const target = resolveControlTarget(req.body);

        const response = await axios.post(
            `${getMqttApiBaseUrl()}/api/devices/${encodeURIComponent(target.deviceId)}/relays/${encodeURIComponent(target.relayId)}/control`,
            { status: controlStatus },
            {
                headers: getMqttApiHeaders(req),
                timeout: getMqttRequestTimeoutMs(),
            }
        );

        logger.info('IoT control command queued', {
            deviceId: target.deviceId,
            relayId: target.relayId,
            status: controlStatus,
            commandId: response.data?.commandId,
        });

        res.status(202).json({
            success: true,
            commandId: response.data?.commandId,
            state: response.data?.state || 'queued',
            deviceConfirmed: false,
            data: response.data,
        });

    } catch (error) {
        logger.error('IoT Control Error:', error.response ? error.response.data : error.message);
        const statusCode = getMqttProxyStatus(error);
        res.status(statusCode).json({
            success: false,
            code: statusCode === 504 ? 'IOT_COMMAND_TIMEOUT' : 'IOT_COMMAND_REJECTED',
            error: statusCode >= 500 ? 'IoT command was not accepted' : error.message,
        });
    }
});

module.exports = router;
