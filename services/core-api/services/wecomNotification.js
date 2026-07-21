const { getNotificationApiKey, sendNotification } = require('./notificationClient');

function normalizeRequestTimeout(value, fallback = 8000) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, 1000), 30000);
}

function getRecipients(config = {}) {
    return {
        touser: String(config.qywxToUser || '').trim(),
        toparty: String(config.qywxToParty || '').trim(),
        totag: String(config.qywxToTag || '').trim(),
    };
}

function isWecomEnabled(config) {
    const recipients = getRecipients(config);
    return Boolean(
        config?.qywxEnabled
        && getNotificationApiKey(config.qywxApiKey)
        && Object.values(recipients).some(Boolean)
    );
}

function buildWecomPayload(config = {}, text, extra = {}) {
    const payload = {
        msg_type: 'text',
        data: { content: text },
        ...extra,
    };
    const recipients = getRecipients(config);

    for (const [field, value] of Object.entries(recipients)) {
        if (value) payload[field] = value;
    }

    const agentId = Number(config.qywxAgentId);
    if (config.qywxAgentId !== undefined && config.qywxAgentId !== '' && Number.isFinite(agentId)) {
        payload.agent_id = agentId;
    }
    if (config.qywxSafe !== undefined && config.qywxSafe !== '') {
        payload.safe = Number(config.qywxSafe) ? 1 : 0;
    }

    return payload;
}

function isWecomResponseOk(response) {
    if (!response || typeof response !== 'object' || response.errcode !== 0) return false;
    return !response.detail
        || typeof response.detail !== 'object'
        || response.detail.errcode === undefined
        || response.detail.errcode === 0;
}

async function sendWecomText(config, text, extra = {}, timeoutOverride) {
    const response = await sendNotification(buildWecomPayload(config, text, extra), {
        apiKey: config.qywxApiKey,
        timeoutMs: normalizeRequestTimeout(timeoutOverride ?? config.qywxTimeout),
    });
    return response.data;
}

module.exports = {
    buildWecomPayload,
    getRecipients,
    isWecomEnabled,
    isWecomResponseOk,
    normalizeRequestTimeout,
    sendWecomText,
};
