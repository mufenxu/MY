/*
  dueReminder - 后端定时任务服务
  作用：每天固定时间检查资源到期信息（servers/domains），
       根据通知配置的提前天数与收件人配置，发送提醒邮件/企业微信通知。

  运行环境：Node.js 16+
  依赖：nodemailer, dayjs, axios (已在 package.json 中)
*/

const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const axios = require('axios');

const ResourceConfig = require('../models/ResourceConfig');
const NotifyConfig = require('../models/NotifyConfig');

const WECOM_NOTIFY_URL = 'https://tongzhiapi.pxyb.cn/notify';

function buildTransport(cfg) {
    return nodemailer.createTransport({
        host: cfg.smtpHost || 'smtp.qq.com',
        port: Number(cfg.smtpPort || '465'),
        secure: true,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
}

function isWecomEnabled(cfg) {
    const hasRecipient = [cfg?.qywxToUser, cfg?.qywxToParty, cfg?.qywxToTag]
        .some((value) => String(value || '').trim());
    return Boolean(cfg && cfg.qywxEnabled && cfg.qywxApiKey && hasRecipient);
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

function buildWecomPayload(cfg, text, extra = {}) {
    const payload = {
        msg_type: 'text',
        data: { content: text },
        ...extra,
    };

    const touser = (cfg.qywxToUser || '').trim();
    const toparty = (cfg.qywxToParty || '').trim();
    const totag = (cfg.qywxToTag || '').trim();

    if (touser) payload.touser = touser;
    if (toparty) payload.toparty = toparty;
    if (totag) payload.totag = totag;

    const agentId = Number(cfg.qywxAgentId);
    if (!Number.isNaN(agentId) && cfg.qywxAgentId !== undefined && cfg.qywxAgentId !== '') {
        payload.agent_id = agentId;
    }

    return payload;
}

async function dispatchWecom(cfg, text, extra = {}) {
    const payload = buildWecomPayload(cfg, text, extra);
    const timeout = Number(cfg.qywxTimeout || 8000);
    const response = await axios.post(WECOM_NOTIFY_URL, payload, {
        headers: { 'X-API-KEY': cfg.qywxApiKey },
        timeout,
    });
    return response.data;
}

function isWecomResponseOk(resp) {
    if (!resp || typeof resp !== 'object') return false;
    if (resp.errcode !== 0) return false;
    if (resp.detail && typeof resp.detail === 'object' && resp.detail.errcode !== undefined) {
        return resp.detail.errcode === 0;
    }
    return true;
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

        // 读取通知配置
        const notifyConfig = await NotifyConfig.findById('default');
        if (!notifyConfig) {
            console.log('未找到通知配置，跳过检查');
            return { skipped: true, reason: 'no_config' };
        }

        // [修改] 移除“今天已发送”的检查逻辑
        // 只要资源满足到期条件，每次检查都会发送通知

        const cfg = {
            smtpHost: 'smtp.qq.com',
            smtpPort: '465',
            ...notifyConfig.toObject(),
            emailEnabled: notifyConfig.emailEnabled !== false,
        };

        const ownerId = String(cfg.ownerId || '').trim();
        if (!ownerId) {
            console.log('通知配置未绑定所有者，跳过检查');
            return { skipped: true, reason: 'owner_not_configured' };
        }

        const emailEnabled = Boolean(cfg.emailEnabled && cfg.smtpUser && cfg.smtpPass && cfg.toList);
        const wecomEnabled = isWecomEnabled(cfg);

        if (!emailEnabled && !wecomEnabled) {
            console.log('通知渠道未配置，跳过检查');
            return { skipped: true, reason: 'no_channel' };
        }

        // Fetch only fields that are safe to include in a reminder. Credentials,
        // contact details and arbitrary config never enter the notification path.
        const allResources = await ResourceConfig.find({ ownerId })
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
        let allServers = [];
        let allDomains = [];

        allResources.forEach(resource => {
            if (resource.servers && Array.isArray(resource.servers)) {
                allServers = allServers.concat(resource.servers.map(safeReminderItem));
            }
            if (resource.domains && Array.isArray(resource.domains)) {
                allDomains = allDomains.concat(resource.domains.map(safeReminderItem));
            }
        });

        const defaultAdvanceDays = parseAdvanceDays(cfg.advanceDays, 7);

        // 检查到期的服务器
        const dueServers = [];
        for (const s of allServers) {
            const adv = parseAdvanceDays(s.advanceNoticeDays, defaultAdvanceDays);
            if (isDue(s.expiresAt, adv)) {
                dueServers.push(s);
            }
        }

        // 检查到期的域名
        const dueDomains = [];
        for (const d of allDomains) {
            const adv = parseAdvanceDays(d.advanceNoticeDays, defaultAdvanceDays);
            if (isDue(d.expiresAt, adv)) {
                dueDomains.push(d);
            }
        }

        if (dueServers.length === 0 && dueDomains.length === 0) {
            console.log('无需要提醒的资源');
            return { sent: false, servers: 0, domains: 0 };
        }

        const totalCount = dueServers.length + dueDomains.length;
        const expiredCount = [...dueServers, ...dueDomains].filter((item) => {
            if (!item.expiresAt) return false;
            const today = dayjs().startOf('day');
            const expireDate = dayjs(item.expiresAt);
            return expireDate.diff(today, 'day') < 0;
        }).length;

        let subject = '🔔 资源到期提醒';
        if (expiredCount > 0) {
            subject = `⚠️ 紧急：${expiredCount}个资源已过期，${totalCount - expiredCount}个即将到期`;
        } else if (totalCount > 0) {
            const urgentCount = [...dueServers, ...dueDomains].filter((item) => {
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
            servers: dueServers.length,
            domains: dueDomains.length,
            channels: {},
        };

        // 发送邮件通知
        if (emailEnabled) {
            try {
                const transporter = buildTransport(cfg);
                const to = (cfg.toList || '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                const html = htmlEmail(dueServers, dueDomains);

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

        // 发送企业微信通知
        if (wecomEnabled) {
            try {
                const resp = await dispatchWecom(cfg, buildWecomText(dueServers, dueDomains));
                const ok = isWecomResponseOk(resp);
                result.channels.wecom = {
                    success: ok,
                    response: resp,
                };
                if (ok) {
                    result.sent = true;
                    console.log('企业微信通知已发送');
                } else {
                    result.channels.wecom.error =
                        (resp && (resp.errmsg || resp.detail?.errmsg)) || '发送失败';
                    console.error('企业微信通知发送失败:', result.channels.wecom.error);
                }
            } catch (error) {
                console.error('发送企业微信通知失败:', error);
                result.channels.wecom = { success: false, error: error.message || '发送失败' };
            }
        }

        // [修改] 不再更新 lastSentAt，因为我们希望每次检查都发送
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
    isWecomEnabled
};

