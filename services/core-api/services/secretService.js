const SecretCache = require('../models/SecretCache');
const logger = require('../utils/logger');
const { encrypt, decrypt, isEncrypted } = require('../utils/crypto');

const ADMIN_CONFIGURABLE_SECRETS = Object.freeze([
    { key: 'GH_TOKEN', desc: 'GitHub Personal Access Token' },
    { key: 'GH_OWNER', desc: 'GitHub 仓库所有者' },
    { key: 'GH_REPO', desc: 'GitHub 仓库名' },
    { key: 'GH_WORKFLOW', desc: 'GitHub Actions 工作流文件名' },
    { key: 'GH_REF', desc: 'GitHub Actions 运行分支 (如: main)' },
    { key: 'GH_WEBHOOK_SECRET', desc: 'GitHub Webhook 密钥' },
    { key: 'EMQX_API_KEY', desc: 'EMQX MQTT 服务 API Key' },
    { key: 'EMQX_SECRET_KEY', desc: 'EMQX MQTT 服务 Secret Key' },
    { key: 'MQTT_API_KEY', desc: 'MQTT Smart Dashboard API Bearer Token' },
    { key: 'MQTT_API_BASE_URL', desc: 'MQTT Smart Dashboard API 域名' },
    { key: 'MQTT_PRIMARY_DEVICE_ID', desc: '智能控制主设备 ID' },
    { key: 'MQTT_PRIMARY_RELAY_ID', desc: '智能控制主继电器 ID' },
    { key: 'MQTT_SECONDARY_DEVICE_ID', desc: '智能控制第二设备 ID' },
    { key: 'MQTT_SECONDARY_RELAY_ID', desc: '智能控制第二继电器 ID' },
    { key: 'TUYA_ACCESS_KEY', desc: '涂鸦 IoT Client ID (Access Key)' },
    { key: 'TUYA_SECRET_KEY', desc: '涂鸦 IoT Client Secret' },
    { key: 'TUYA_ENDPOINT', desc: '涂鸦 OpenAPI 域名' },
    { key: 'TUYA_DEVICE_ID', desc: '涂鸦关联的设备 ID' },
    { key: 'TURNSTILE_SITE_KEY', desc: 'Cloudflare Turnstile Site Key' },
    { key: 'TURNSTILE_SECRET_KEY', desc: 'Cloudflare Turnstile Secret Key' },
]);
const ADMIN_CONFIGURABLE_SECRET_NAMES = new Set(ADMIN_CONFIGURABLE_SECRETS.map(({ key }) => key));

let memoryCache = Object.create(null);

function rawSecretValue(record) {
    if (!record) return '';
    if (typeof record.get === 'function') {
        return record.get('secret_value', null, { getters: false }) || '';
    }
    return record.secret_value || '';
}

function revealStoredSecret(record) {
    const stored = rawSecretValue(record);
    return stored ? decrypt(String(stored)) : '';
}

async function migrateLegacySecret(record, storedValue) {
    if (!storedValue || isEncrypted(storedValue)) return;
    const filter = record && record._id
        ? { _id: record._id }
        : { secret_name: record.secret_name };
    await SecretCache.updateOne(filter, { $set: { secret_value: encrypt(String(storedValue)) } });
}

class SecretService {
    static isAdminConfigurableSecret(name) {
        return ADMIN_CONFIGURABLE_SECRET_NAMES.has(String(name || ''));
    }

    /**
     * 初始化缓存，系统启动时调用
     */
    static async initCache() {
        try {
            const secrets = await SecretCache.find();
            memoryCache = Object.create(null);
            secrets.forEach(s => {
                memoryCache[s.secret_name] = revealStoredSecret(s);
            });
            await Promise.all(secrets.map(s => migrateLegacySecret(s, rawSecretValue(s))));
            logger.info(`Loaded ${secrets.length} secrets from database into memory cache.`);
        } catch (error) {
            logger.error('Failed to init secret cache from database', error);
        }
    }

    /**
     * 同步获取 Secret（推荐业务代码中使用）
     * 优先从内存缓存获取，如果没有则降级从 process.env 获取
     * @param {string} name 
     * @returns {string|null}
     */
    static getSecretSync(name) {
        if (memoryCache[name] !== undefined) {
            return memoryCache[name];
        }
        if (process.env[name] !== undefined) {
            return process.env[name];
        }
        return null;
    }

    /**
     * 异步获取 Secret
     * 优先从内存缓存获取，如果没有则尝试从数据库加载，最后降级到 process.env
     * @param {string} name 
     * @returns {Promise<string|null>}
     */
    static async getSecret(name) {
        if (memoryCache[name] !== undefined) {
            return memoryCache[name];
        }

        // 尝试从数据库获取
        try {
            const s = await SecretCache.findOne({ secret_name: name });
            if (s) {
                const stored = rawSecretValue(s);
                const value = revealStoredSecret(s);
                memoryCache[name] = value;
                await migrateLegacySecret(s, stored);
                return value;
            }
        } catch (err) {
            logger.error(`Error fetching secret ${name} from DB`, err);
        }

        if (process.env[name] !== undefined) {
            return process.env[name];
        }

        return null;
    }

    /**
     * 设置/更新 Secret
     * @param {string} name 
     * @param {string} value 
     * @param {string} username 操作人
     * @returns {Promise<object>}
     */
    static async setSecret(name, value, username = 'system') {
        try {
            const plainValue = String(value ?? '');
            const result = await SecretCache.findOneAndUpdate(
                { secret_name: name },
                { secret_value: encrypt(plainValue), updated_by: username },
                { new: true, upsert: true } // 如果不存在则创建
            );

            // 更新内存缓存
            memoryCache[name] = plainValue;
            return result;
        } catch (error) {
            logger.error(`Error setting secret ${name}`, error);
            throw error;
        }
    }

    /**
     * 删除指定的 Secret（恢复使用 process.env）
     * @param {string} name 
     * @param {string} username
     */
    static async deleteSecret(name, username = 'system') {
        try {
            await SecretCache.findOneAndDelete({ secret_name: name });
            delete memoryCache[name];
            return true;
        } catch (error) {
            logger.error(`Error deleting secret ${name}`, error);
            throw error;
        }
    }

    /**
     * 获取所有可配置的密钥列表及状态
     * 将预设允许配置的键名和数据库/env 的当前值进行合并展示
     */
    static async getAllSecrets() {
        const dbSecrets = await SecretCache.find();
        const dbSecretMap = new Map(dbSecrets.map(s => [s.secret_name, s]));

        return ADMIN_CONFIGURABLE_SECRETS.map(conf => {
            const dbData = dbSecretMap.get(conf.key);
            const envValue = process.env[conf.key];
            const hasDbValue = !!dbData;

            // 返回给前端展示，脱敏处理
            const rawValue = dbData ? rawSecretValue(dbData) : (envValue || '');
            // Recoverable secrets are never partially disclosed by list APIs.
            const displayValue = rawValue ? '********' : '';

            return {
                key: conf.key,
                desc: conf.desc,
                hasDbRecord: hasDbValue,
                isUsingDb: hasDbValue, // 如果数据库有记录，系统优先使用数据库的
                displayValue: displayValue,
                updated_at: dbData ? dbData.updated_at : null,
                updated_by: dbData ? dbData.updated_by : null
            };
        });
    }
}

module.exports = SecretService;
