const nodemailer = require('nodemailer');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const NotifyConfig = require('../models/NotifyConfig');
const CronConfig = require('../models/CronConfig');
const AppError = require('../utils/AppError');
const { TASKS, startTask, stopTask } = require('./cronScheduler');
const cron = require('node-cron');
const { encrypt, decrypt, isEncrypted } = require('../utils/crypto');

const WECOM_NOTIFY_URL = 'https://tongzhiapi.pxyb.cn/notify';
const SECRET_MASK = '********';
const NOTIFY_SECRET_FIELDS = ['smtpPass', 'qywxApiKey'];

function isSecretMask(value) {
    return typeof value === 'string' && /^\*{4,}$/.test(value);
}

function transformNotifySecrets(data, transform) {
    const result = { ...(data || {}) };
    for (const field of NOTIFY_SECRET_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(result, field)
            && result[field] !== undefined
            && result[field] !== null) {
            result[field] = transform(String(result[field]));
        }
    }
    return result;
}

function decryptNotifySecrets(data) {
    return transformNotifySecrets(data, decrypt);
}

function encryptNotifySecrets(data) {
    return transformNotifySecrets(data, encrypt);
}

async function hydrateNotifySecrets(data) {
    const result = { ...(data || {}) };
    const needsExisting = NOTIFY_SECRET_FIELDS.some((field) => (
        !Object.prototype.hasOwnProperty.call(result, field) || isSecretMask(result[field])
    ));
    const stored = needsExisting ? await NotifyConfig.findById('default').lean() : null;
    const existing = decryptNotifySecrets(stored);

    for (const field of NOTIFY_SECRET_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(result, field) || isSecretMask(result[field])) {
            result[field] = existing && existing[field] || '';
        }
    }
    return result;
}

// Helpers
function buildTransport(cfg) {
    return nodemailer.createTransport({
        host: cfg.smtpHost || 'smtp.qq.com',
        port: Number(cfg.smtpPort || '465'),
        secure: true,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass }
    });
}

function buildWecomPayload(cfg, text) {
    const payload = { msg_type: 'text', data: { content: text } };
    const touser = (cfg.qywxToUser || '').trim();
    const toparty = (cfg.qywxToParty || '').trim();
    const totag = (cfg.qywxToTag || '').trim();
    if (touser) payload.touser = touser;
    if (toparty) payload.toparty = toparty;
    if (totag) payload.totag = totag;

    const agentId = Number(cfg.qywxAgentId);
    if (!Number.isNaN(agentId) && cfg.qywxAgentId) payload.agent_id = agentId;

    return payload;
}

exports.getNotifyConfig = async () => {
    const doc = await NotifyConfig.findById('default').lean();
    if (!doc) return {};
    const result = decryptNotifySecrets(doc);
    for (const field of NOTIFY_SECRET_FIELDS) {
        if (result[field]) result[field] = SECRET_MASK;
    }
    return result;
};

exports.saveNotifyConfig = async (data, ownerId = '') => {
    const hydrated = await hydrateNotifySecrets(data);
    if (ownerId) hydrated.ownerId = String(ownerId);
    hydrated.updatedAt = Date.now();
    const protectedConfig = encryptNotifySecrets(hydrated);
    const saved = await NotifyConfig.findByIdAndUpdate('default', { $set: protectedConfig }, { upsert: true, new: true });
    const stored = typeof saved.toObject === 'function' ? saved.toObject() : { ...saved };
    const result = decryptNotifySecrets(stored);
    for (const field of NOTIFY_SECRET_FIELDS) {
        if (result[field]) result[field] = SECRET_MASK;
    }
    return result;
};

exports.testNotify = async (config, testChannel) => {
    if (!config) throw new AppError('Missing config', 400);
    config = await hydrateNotifySecrets(config);

    if (testChannel === 'wecom') {
        if (!config.qywxEnabled) throw new AppError('WeCom disabled', 400);
        if (!config.qywxApiKey) throw new AppError('Missing API Key', 400);
        if (![config.qywxToUser, config.qywxToParty, config.qywxToTag].some((value) => String(value || '').trim())) {
            throw new AppError('Missing WeCom recipient', 400);
        }

        const nowTime = new Date().toLocaleString('zh-CN', { hour12: false });
        const text = `✨ 星轨轻具坊 · 系统通知
【配置联通测试报告】

恭喜！企业微信通知通道已成功打通。
各项连通性指标均显示正常。

▶ 发送时间：${nowTime}
▶ 接收网关：WeCom 通道
▶ 状态评级：🟢 正常 (Healthy)

💡 星轨提醒：此通道将为您实时推送关键
业务的动态监控信息，期待为您提供优质服务！`;
        const payload = buildWecomPayload(config, text);

        const response = await axios.post(WECOM_NOTIFY_URL, payload, {
            headers: { 'X-API-KEY': config.qywxApiKey },
            timeout: 8000
        });

        if (response.data && response.data.errcode === 0) return { success: true };
        throw new AppError(response.data.errmsg || 'WeCom API Error', 500);
    }

    if (!config.emailEnabled) throw new AppError('Email disabled', 400);
    if (!config.smtpUser || !config.smtpPass || !config.toList) throw new AppError('Incomplete email config', 400);

    const transporter = buildTransport(config);
    const to = (config.toList || '').split(',').map(x => x.trim()).filter(Boolean);

    await transporter.sendMail({
        from: config.smtpUser,
        to: to.join(','),
        subject: 'Test Email',
        text: 'This is a test email.'
    });

    return { success: true };
};

exports.migrateNotifySecrets = async () => {
    const stored = await NotifyConfig.findById('default').lean();
    if (!stored) return { migrated: false };

    const updates = {};
    for (const field of NOTIFY_SECRET_FIELDS) {
        const value = stored[field];
        if (value && !isEncrypted(String(value))) updates[field] = encrypt(String(value));
    }
    if (Object.keys(updates).length === 0) return { migrated: false };

    await NotifyConfig.updateOne({ _id: 'default' }, { $set: updates });
    return { migrated: true, fields: Object.keys(updates) };
};

exports.getAdminInfo = async (userId) => {
    const user = await User.findById(userId).lean();
    if (!user) throw new AppError('User not found', 404);
    return { userId: user.userId, nickName: user.nickName, role: user.role };
};

exports.updateAdminInfo = async (id, data) => {
    const { newUsername, currentPassword, newPassword } = data;
    const user = await User.findById(id).select('+password');
    if (!user) throw new AppError('User not found', 404);

    if (newPassword) {
        // 如果数据库中已经存在密码哈希，则必须验证当前密码
        if (user.password) {
            if (!currentPassword) throw new AppError('请输入当前密码', 400);
            const valid = await bcrypt.compare(currentPassword, user.password);
            if (!valid) throw new AppError('密码错误', 400);
        }
        // 如果没有设置过密码，直接哈希保存新密码，无需对比当前密码
        user.password = await bcrypt.hash(newPassword, 12);
        user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
    }

    if (newUsername && newUsername !== user.userId) {
        const exist = await User.findOne({ userId: newUsername });
        if (exist && exist._id.toString() !== user._id.toString()) throw new AppError('用户名已存在', 400);
        user.userId = newUsername;
    }

    user.updatedAt = Date.now();
    await user.save();
    if (newPassword) {
        await RefreshToken.deleteMany({ userId: String(id) });
    }
    return { userId: user.userId };
};

exports.getCronConfig = async (type) => {
    if (!TASKS[type]) throw new AppError('Invalid task type', 400);
    const config = await CronConfig.findById(type).lean();
    const cronSchedule = config?.schedule || TASKS[type].defaultSchedule;
    const isEnabled = config?.enabled !== false;

    if (isEnabled) {
        const status = require('./cronScheduler').getStatus(type);
        if (!status.running || status.schedule !== cronSchedule) {
            const res = startTask(type, cronSchedule);
            if (!res.success) throw new AppError(res.error, 400);
        }
    } else {
        stopTask(type);
    }

    const status = require('./cronScheduler').getStatus(type); // Circular dep fix if needed but pure function ok

    return {
        type,
        schedule: cronSchedule,
        enabled: isEnabled,
        running: status.running,
        currentSchedule: status.schedule
    };
};

exports.updateCronConfig = async (type, schedule, enabled) => {
    if (!TASKS[type]) throw new AppError('Invalid task type', 400);
    if (schedule && !cron.validate(schedule)) throw new AppError('Invalid cron', 400);

    const cronSchedule = schedule || TASKS[type].defaultSchedule;
    const isEnabled = enabled !== false;

    await CronConfig.findByIdAndUpdate(type, {
        $set: {
            schedule: cronSchedule,
            enabled: isEnabled,
            updatedAt: Date.now()
        }
    }, { upsert: true, new: true });

    if (isEnabled) {
        const res = startTask(type, cronSchedule);
        if (!res.success) throw new AppError(res.error, 400);
    } else {
        stopTask(type);
    }

    const status = require('./cronScheduler').getStatus(type);
    const savedConfig = await CronConfig.findById(type).lean();
    console.log(`定时任务配置已保存: ${type}, enabled=${isEnabled}, schedule=${cronSchedule}, running=${status.running}`);

    return {
        type,
        schedule: savedConfig?.schedule || cronSchedule,
        enabled: savedConfig?.enabled !== false,
        running: status.running,
        currentSchedule: status.schedule
    };
};
