/*
  dueReminder - 后端定时任务服务
  作用：每天固定时间检查资源到期信息（servers/domains），
       根据通知配置的提前天数与收件人配置，发送提醒邮件/企业微信通知。

  运行环境：Node.js 16+
  依赖：nodemailer, dayjs (已在 package.json 中)
*/

const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const {
    buildWecomPayload,
    getRecipients,
    isWecomEnabled,
    isWecomResponseOk,
    sendWecomText,
} = require('./wecomNotification');

const ResourceConfig = require('../models/ResourceConfig');
const NotifyConfig = require('../models/NotifyConfig');
const User = require('../models/User');
const { getNotificationApiKey, sendAppNotification } = require('./notificationClient');

function buildTransport(cfg) {
    return nodemailer.createTransport({
        host: cfg.smtpHost || 'smtp.qq.com',
        port: Number(cfg.smtpPort || '465'),
        secure: true,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
}

function isDue(dateStr, advanceDays) {
    if (!dateStr) return false;
    const today = dayjs().startOf('day');
    const due = dayjs(dateStr);
    const diff = due.diff(today, 'day');
    return diff <= advanceDays;
}

function parseAdvanceDays(input, fallback = 7) {
    if (typeof input === 'number') {
        if (Number.isFinite(input)) return Math.round(input);
        return fallback;
    }
    if (input === undefined || input === null) return fallback;
    const text = String(input).trim();
    if (!text) return fallback;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return fallback;
    const num = Number(match[0]);
    if (Number.isNaN(num)) return fallback;
    return Math.round(num);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function plainText(value, fallback = '') {
    const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    return text || fallback;
}

function safeHttpUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(String(value));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch (_) {
        return '';
    }
}

// Reminder rendering accepts only non-sensitive fields. This remains a second
// line of defense even when a database projection is changed later.
function safeReminderItem(item = {}) {
    return {
        name: plainText(item.name),
        host: plainText(item.host),
        expiresAt: plainText(item.expiresAt),
        advanceNoticeDays: item.advanceNoticeDays,
        registrar: plainText(item.registrar),
        siteUrl: safeHttpUrl(item.siteUrl),
        type: plainText(item.type),
        renewPeriod: plainText(item.renewPeriod)
    };
}

function formatWecomItem(item, typeLabel) {
    const name = plainText(item.name || item.host, '未命名');
    const expiresAt = plainText(item.expiresAt, '未填写');
    let icon = '🟢'; 
    let statusText = '正常';
    let overdueText = '';

    if (item.expiresAt) {
        const today = dayjs().startOf('day');
        const diff = dayjs(item.expiresAt).diff(today, 'day');
        
        if (diff < 0) {
            icon = '🔴';
            statusText = '已过期';
            overdueText = `(超时 ${Math.abs(diff)} 天)`;
        } else if (diff <= 7) {
            icon = '🟠';
            statusText = '即将到期';
            overdueText = `(剩余 ${diff} 天)`;
        } else if (diff <= 30) {
            icon = '🟡';
            statusText = '预警中';
            overdueText = `(剩余 ${diff} 天)`;
        }
    }

    const lines = [
        `${icon} [${typeLabel}] ${name}`,
        `  · 状态：${statusText} ${overdueText}`,
        `  · 到期：${expiresAt}`,
    ];

    if (item.siteUrl) lines.push(`  · 链接：${plainText(item.siteUrl)}`);
    if (item.registrar) lines.push(`  · 平台：${plainText(item.registrar)}`);

    return lines.join('\n');
}

function buildWecomText(servers, domains) {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const total = servers.length + domains.length;
    let expired = 0;
    let urgent = 0;
    
    [...servers, ...domains].forEach((item) => {
        if (!item.expiresAt) return;
        const diff = dayjs(item.expiresAt).diff(dayjs().startOf('day'), 'day');
        if (diff < 0) expired++;
        else if (diff <= 7) urgent++;
    });

    let riskLevel = '🟢 正常 (Healthy)';
    if (expired > 0) riskLevel = '🔴 紧急 (Urgent)';
    else if (urgent > 0) riskLevel = '🟠 警告 (Warning)';

    const lines = [
        '✨ 星轨轻具坊 · 系统预警',
        '【资源到期监控报告】',
        '',
        '系统监控到您的部分核心资源状态告急，',
        '为保障业务连续性，请尽快查阅处理。',
        '',
        `▶ 报告生成：${now}`,
        `▶ 风险等级：${riskLevel}`,
        `▶ 总体概况：共发现 ${total} 项临期资源，其中 ${expired} 项已过期。`
    ];

    if (servers.length) {
        lines.push('', `--- 🖥️ 云服务器 (${servers.length}) ---`);
        servers.forEach((item) => {
            lines.push(formatWecomItem(item, item.type || '服务器'), '');
        });
    }

    if (domains.length) {
        lines.push('', `--- 🌐 域名资产 (${domains.length}) ---`);
        domains.forEach((item) => {
            lines.push(formatWecomItem(item, item.type || '域名'), '');
        });
    }

    // 移除最后一个空行，替换为底部提示
    if (lines[lines.length - 1] === '') lines.pop();

    lines.push(
        '',
        '💡 星轨提醒：为避免服务中断和数据丢失，',
        '请务必尽快登录相关服务商后台完成续费操作。'
    );

    return lines.join('\n');
}

async function dispatchWecom(cfg, text, extra = {}) {
    return sendWecomText(cfg, text, extra);
}

function createReminderDeliveryKey(force = false, now = new Date(), idFactory = crypto.randomUUID) {
    return force ? `manual-${idFactory()}` : dayjs(now).format('YYYY-MM-DD');
}

function normalizeAppDeliveryResponse(recipientId, responseData = {}) {
    const push = {
        attempted: Number(responseData.push?.attempted) || 0,
        sent: Number(responseData.push?.sent) || 0,
        deferred: Number(responseData.push?.deferred) || 0,
        failed: Number(responseData.push?.failed) || 0,
        suppressed: Number(responseData.push?.suppressed) || 0,
    };
    const deduplicated = Boolean(responseData.deduplicated);
    const inboxAccepted = deduplicated || responseData.channels?.app === 'accepted';
    const systemDelivered = push.sent > 0;
    const status = systemDelivered
        ? 'pushed'
        : deduplicated
            ? 'deduplicated'
            : push.failed > 0
                ? 'push_failed'
                : push.deferred > 0
                    ? 'polling'
                    : push.suppressed > 0
                        ? 'suppressed'
                        : inboxAccepted
                            ? 'inbox_only'
                            : 'failed';
    return {
        recipientId,
        notificationId: responseData.notificationId || '',
        inboxAccepted,
        deduplicated,
        systemDelivered,
        status,
        wecomStatus: responseData.channels?.wecom || 'not-requested',
        push,
    };
}

function resolveReminderOwner(configuredOwnerId, dueOwnerIds = []) {
    const configured = String(configuredOwnerId || '').trim();
    const owners = [...new Set(dueOwnerIds.map((value) => String(value || '').trim()).filter(Boolean))];
    if (configured && owners.includes(configured)) return configured;
    return owners.length === 1 ? owners[0] : '';
}

function shouldScanAllResourceOwners(appEnabled, wecomEnabled) {
    return Boolean(appEnabled || wecomEnabled);
}

function buildAppNotificationPayload({ recipientId, ownerId, servers, domains, includeWecom, cfg, deliveryKey }) {
    const resources = [...servers, ...domains];
    const today = dayjs().format('YYYY-MM-DD');
    const reminderKey = String(deliveryKey || today).trim() || today;
    const expiredCount = resources.filter((item) => dayjs(item.expiresAt).diff(dayjs().startOf('day'), 'day') < 0).length;
    const urgentCount = resources.filter((item) => {
        const days = dayjs(item.expiresAt).diff(dayjs().startOf('day'), 'day');
        return days >= 0 && days <= 7;
    }).length;
    const title = expiredCount > 0
        ? `${expiredCount} 项资源已过期`
        : urgentCount > 0
            ? `${urgentCount} 项资源即将到期`
            : `${resources.length} 项资源进入提醒期`;
    const summary = `服务器 ${servers.length} 项，域名 ${domains.length} 项，请及时检查续期状态。`;
    const signature = resources
        .map((item) => `${item.name || item.host || ''}:${item.expiresAt || ''}`)
        .sort()
        .join('|');
    const digest = crypto.createHash('sha256').update(`${ownerId}|${reminderKey}|${signature}`).digest('hex').slice(0, 24);
    const payload = {
        idempotencyKey: `resource-expiry:${reminderKey}:${digest}`,
        dedupeKey: `resource-expiry:${reminderKey}:${digest}`,
        audience: { users: [recipientId] },
        channels: includeWecom ? ['app', 'wecom'] : ['app'],
        priority: expiredCount > 0 || urgentCount > 0 ? 'high' : 'normal',
        category: 'resource.expiry',
        content: {
            kind: 'text',
            title,
            summary,
            blocks: [{ type: 'text', text: buildWecomText(servers, domains).slice(0, 12000) }],
        },
        source: {
            service: 'core-api',
            entityType: 'resource-expiry',
            entityId: `${today}:${reminderKey}`,
        },
        actions: [{ id: 'open-resources', label: '查看资源', deepLink: 'mycontrol://open?destination=today' }],
    };
    if (includeWecom) {
        payload.wecom = {
            ...(cfg.qywxToUser ? { touser: String(cfg.qywxToUser).trim() } : {}),
            ...(cfg.qywxToParty ? { toparty: String(cfg.qywxToParty).trim() } : {}),
            ...(cfg.qywxToTag ? { totag: String(cfg.qywxToTag).trim() } : {}),
        };
    }
    return payload;
}

function buildItemsHtml(items, title) {
    if (!items.length) return '';

    const itemsHtml = items.map(item => {
        const name = escapeHtml(item.name || item.host || '未命名');
        const expiresAt = escapeHtml(item.expiresAt || '-');
        const registrar = escapeHtml(item.registrar || '-');
        const siteUrl = safeHttpUrl(item.siteUrl);
        const escapedSiteUrl = escapeHtml(siteUrl);

        let daysLeft = '-';
        let statusColor = '#6b7280';
        if (item.expiresAt) {
            const today = dayjs().startOf('day');
            const expireDate = dayjs(item.expiresAt);
            const diff = expireDate.diff(today, 'day');
            daysLeft = diff >= 0 ? `${diff}天` : `已过期${Math.abs(diff)}天`;

            if (diff < 0) statusColor = '#dc2626';
            else if (diff <= 7) statusColor = '#ea580c';
            else if (diff <= 30) statusColor = '#d97706';
            else statusColor = '#059669';
        }

        return `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;margin:12px 0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb">
          <h4 style="margin:0;color:#111827;font-size:16px;font-weight:600">${name}</h4>
          <div style="margin-top:4px;color:${statusColor};font-weight:600;font-size:14px">
            到期时间：${expiresAt} ${daysLeft !== '-' ? `(剩余${daysLeft})` : ''}
          </div>
        </div>
        <div style="padding:16px">
          <table style="width:100%;border-collapse:collapse">
            ${registrar !== '-' ? `
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-weight:500;width:80px">注册商：</td>
              <td style="padding:6px 0;color:#111827">${registrar}</td>
            </tr>` : ''}
            ${siteUrl ? `
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-weight:500">管理网址：</td>
              <td style="padding:6px 0">
                <a href="${escapedSiteUrl}" style="color:#2563eb;text-decoration:none" target="_blank" rel="noopener noreferrer">${escapedSiteUrl}</a>
              </td>
            </tr>` : ''}
          </table>
        </div>
      </div>`
    }).join('')

    return `
    <div style="margin:24px 0">
      <h3 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:600;border-bottom:2px solid #3b82f6;padding-bottom:8px">
        📋 ${escapeHtml(title)}到期提醒
      </h3>
      ${itemsHtml}
    </div>`
}

function htmlEmail(servers, domains) {
    const currentTime = dayjs().format('YYYY年MM月DD日 HH:mm');

    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>资源到期提醒</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);color:#ffffff;padding:24px;text-align:center">
        <h1 style="margin:0;font-size:24px;font-weight:700">🔔 资源到期提醒</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.9">Resource Expiration Notification</p>
      </div>
      <div style="padding:24px">
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="margin:0;color:#92400e;font-weight:600">⚠️ 重要提醒</p>
          <p style="margin:8px 0 0;color:#92400e">以下资源即将到期或已过期，请及时处理续费事宜，避免服务中断。</p>
        </div>
        ${buildItemsHtml(servers, '服务器')}
        ${buildItemsHtml(domains, '域名')}
        <div style="background:#f0f9ff;border:1px solid #0ea5e9;border-radius:8px;padding:16px;margin-top:24px">
          <h4 style="margin:0 0 12px;color:#0c4a6e;font-size:16px">💡 处理建议</h4>
          <ul style="margin:0;padding-left:20px;color:#0c4a6e">
            <li style="margin:4px 0">请使用上述登录信息访问注册商管理后台</li>
            <li style="margin:4px 0">及时为即将到期的资源进行续费</li>
            <li style="margin:4px 0">建议开启自动续费功能，避免遗忘</li>
            <li style="margin:4px 0">如有疑问，请联系相应注册商客服</li>
          </ul>
        </div>
      </div>
      <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px;text-align:center">
        <p style="margin:0;color:#6b7280;font-size:12px">
          📧 此邮件由资源管理系统自动发送 | 发送时间：${currentTime}
        </p>
        <p style="margin:8px 0 0;color:#6b7280;font-size:12px">
          请勿直接回复此邮件 | 如需帮助请联系系统管理员
        </p>
      </div>
    </div>
  </body>
  </html>`
}

/**
 * 执行到期检查任务
 */
async function checkAndNotify(force = false) {
    try {
        console.log('=================================================');
        console.log(`[${new Date().toISOString()}] 资源到期检查任务被触发 (来源: ${force ? '手动' : '定时'})`);
        console.log('=================================================');

        // App 通知不依赖旧版邮件/企微配置；旧配置仅作为附加投递渠道。
        const notifyConfig = await NotifyConfig.findById('default');
        const cfg = {
            smtpHost: 'smtp.qq.com',
            smtpPort: '465',
            ...(notifyConfig ? notifyConfig.toObject() : {}),
            emailEnabled: notifyConfig ? notifyConfig.emailEnabled !== false : false,
        };
        const ownerId = String(cfg.ownerId || '').trim();
        const emailEnabled = Boolean(cfg.emailEnabled && cfg.smtpUser && cfg.smtpPass && cfg.toList);
        const wecomEnabled = isWecomEnabled(cfg);
        const wecomRecipients = getRecipients(cfg);
        const wecomConfigReason = !cfg.qywxEnabled
            ? 'disabled'
            : !getNotificationApiKey(cfg.qywxApiKey)
                ? 'api_key_missing'
                : !Object.values(wecomRecipients).some(Boolean)
                    ? 'recipient_missing'
                    : '';
        const appEnabled = Boolean(getNotificationApiKey(cfg.qywxApiKey));
        if (!appEnabled && !emailEnabled && !wecomEnabled) {
            console.log('通知渠道未配置，跳过检查');
            return { skipped: true, reason: 'no_channel' };
        }

        // Fetch only fields that are safe to include in a reminder. Credentials,
        // contact details and arbitrary config never enter the notification path.
        // App 通知按资源所有者分别发送；邮件和企微仍只使用旧配置绑定的所有者。
        const resourceFilter = shouldScanAllResourceOwners(appEnabled, wecomEnabled) ? {} : { ownerId };
        const allResources = await ResourceConfig.find(resourceFilter)
            .select({
                ownerId: 1,
                'servers.name': 1,
                'servers.host': 1,
                'servers.expiresAt': 1,
                'servers.advanceNoticeDays': 1,
                'servers.registrar': 1,
                'servers.siteUrl': 1,
                'servers.type': 1,
                'servers.renewPeriod': 1,
                'domains.name': 1,
                'domains.host': 1,
                'domains.expiresAt': 1,
                'domains.advanceNoticeDays': 1,
                'domains.registrar': 1,
                'domains.siteUrl': 1,
                'domains.type': 1,
                'domains.renewPeriod': 1
            })
            .lean();
        const defaultAdvanceDays = parseAdvanceDays(cfg.advanceDays, 7);
        const dueByOwner = new Map();
        allResources.forEach((resource) => {
            const resourceOwnerId = String(resource.ownerId || '').trim();
            if (!resourceOwnerId) return;
            const dueServers = (Array.isArray(resource.servers) ? resource.servers : [])
                .map(safeReminderItem)
                .filter((item) => isDue(item.expiresAt, parseAdvanceDays(item.advanceNoticeDays, defaultAdvanceDays)));
            const dueDomains = (Array.isArray(resource.domains) ? resource.domains : [])
                .map(safeReminderItem)
                .filter((item) => isDue(item.expiresAt, parseAdvanceDays(item.advanceNoticeDays, defaultAdvanceDays)));
            if (dueServers.length || dueDomains.length) {
                dueByOwner.set(resourceOwnerId, { servers: dueServers, domains: dueDomains });
            }
        });

        if (dueByOwner.size === 0) {
            console.log('无需要提醒的资源');
            return { sent: false, servers: 0, domains: 0 };
        }

        const deliveryOwnerId = resolveReminderOwner(ownerId, [...dueByOwner.keys()]);
        const deliveryKey = createReminderDeliveryKey(force);

        const allDueServers = [...dueByOwner.values()].flatMap((group) => group.servers);
        const allDueDomains = [...dueByOwner.values()].flatMap((group) => group.domains);
        const totalCount = allDueServers.length + allDueDomains.length;
        const expiredCount = [...allDueServers, ...allDueDomains].filter((item) => {
            if (!item.expiresAt) return false;
            const today = dayjs().startOf('day');
            const expireDate = dayjs(item.expiresAt);
            return expireDate.diff(today, 'day') < 0;
        }).length;

        let subject = '🔔 资源到期提醒';
        if (expiredCount > 0) {
            subject = `⚠️ 紧急：${expiredCount}个资源已过期，${totalCount - expiredCount}个即将到期`;
        } else if (totalCount > 0) {
            const urgentCount = [...allDueServers, ...allDueDomains].filter((item) => {
                if (!item.expiresAt) return false;
                const today = dayjs().startOf('day');
                const expireDate = dayjs(item.expiresAt);
                return expireDate.diff(today, 'day') <= 7;
            }).length;

            if (urgentCount > 0) {
                subject = `🔔 重要：${urgentCount}个资源7天内到期，${totalCount - urgentCount}个30天内到期`;
            } else {
                subject = `📋 提醒：${totalCount}个资源即将到期`;
            }
        }

        const result = {
            sent: false,
            servers: allDueServers.length,
            domains: allDueDomains.length,
            owners: dueByOwner.size,
            channels: {},
            ownerBinding: {
                configuredOwnerId: ownerId,
                deliveryOwnerId,
                autoMatched: Boolean(deliveryOwnerId && deliveryOwnerId !== ownerId),
            },
        };

        result.channels.wecom = {
            enabled: wecomEnabled && Boolean(deliveryOwnerId),
            status: wecomEnabled && deliveryOwnerId ? 'pending' : 'skipped',
            ...(wecomConfigReason ? { reason: wecomConfigReason } : {}),
            ...(!deliveryOwnerId && wecomEnabled ? { reason: 'owner_not_matched' } : {}),
        };

        if (appEnabled) {
            const ownerIds = [...dueByOwner.keys()];
            const users = await User.find({ _id: { $in: ownerIds } }).select('_id userId').lean();
            const appRecipients = new Map(users.map((user) => [String(user._id), String(user.userId || user._id)]));
            let sent = 0;
            let failed = 0;
            const deliveries = [];
            const push = { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0 };

            for (const [resourceOwnerId, group] of dueByOwner.entries()) {
                const recipientId = appRecipients.get(resourceOwnerId) || resourceOwnerId;
                const includeWecom = wecomEnabled && resourceOwnerId === deliveryOwnerId;
                try {
                    const response = await sendAppNotification(
                        buildAppNotificationPayload({
                            recipientId,
                            ownerId: resourceOwnerId,
                            servers: group.servers,
                            domains: group.domains,
                            includeWecom,
                            cfg,
                            deliveryKey,
                        }),
                        { apiKey: cfg.qywxApiKey },
                    );
                    const delivery = normalizeAppDeliveryResponse(recipientId, response.data);
                    deliveries.push(delivery);
                    sent += delivery.inboxAccepted ? 1 : 0;
                    result.sent = result.sent || delivery.inboxAccepted;
                    Object.keys(push).forEach((key) => { push[key] += delivery.push[key]; });
                    if (includeWecom) {
                        const wecomStatus = delivery.wecomStatus;
                        result.channels.wecom = {
                            success: wecomStatus === 'sent' || wecomStatus === 'deduplicated',
                            status: wecomStatus,
                        };
                    }
                } catch (error) {
                    failed += 1;
                    console.error(`发送资源 App 通知失败 (owner=${resourceOwnerId}):`, error.message || error);
                    if (includeWecom) {
                        try {
                            const resp = await dispatchWecom(cfg, buildWecomText(group.servers, group.domains));
                            const ok = isWecomResponseOk(resp);
                            result.channels.wecom = { success: ok, error: ok ? undefined : (resp?.errmsg || '发送失败') };
                            if (ok) result.sent = true;
                        } catch (wecomError) {
                            result.channels.wecom = { success: false, error: wecomError.message || '发送失败' };
                        }
                    }
                }
            }
            result.channels.app = {
                success: sent > 0 && failed === 0,
                sent,
                failed,
                deliveries,
                notificationIds: deliveries.map((item) => item.notificationId).filter(Boolean),
                inboxAccepted: deliveries.filter((item) => item.inboxAccepted).length,
                systemDelivered: deliveries.some((item) => item.systemDelivered),
                push,
            };
        }

        const configuredOwnerDue = dueByOwner.get(deliveryOwnerId) || { servers: [], domains: [] };

        // 发送邮件通知
        if (emailEnabled && configuredOwnerDue.servers.length + configuredOwnerDue.domains.length > 0) {
            try {
                const transporter = buildTransport(cfg);
                const to = (cfg.toList || '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                const html = htmlEmail(configuredOwnerDue.servers, configuredOwnerDue.domains);

                await transporter.sendMail({
                    from: cfg.smtpUser,
                    to: to.join(','),
                    subject,
                    html,
                });

                result.channels.email = { success: true };
                result.sent = true;
                console.log(`邮件通知已发送，收件人: ${to.join(', ')}`);
            } catch (error) {
                console.error('发送提醒邮件失败:', error);
                result.channels.email = { success: false, error: error.message || '发送失败' };
            }
        }

        console.log(`[${new Date().toISOString()}] 到期检查任务完成:`, result);
        return result;

    } catch (error) {
        console.error('执行到期检查任务失败:', error);
        return { error: error.message };
    }
}

module.exports = {
    checkAndNotify,
    // Export pure render helpers for regression tests.
    escapeHtml,
    safeReminderItem,
    buildItemsHtml,
    buildWecomText,
    buildWecomPayload,
    isWecomEnabled,
    buildAppNotificationPayload,
    createReminderDeliveryKey,
    normalizeAppDeliveryResponse,
    resolveReminderOwner,
    shouldScanAllResourceOwners
};

