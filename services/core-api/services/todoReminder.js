/* Send only task-level reminders that have become due and were not acknowledged. */

const crypto = require('node:crypto');
const TodoList = require('../models/TodoList');
const NotifyConfig = require('../models/NotifyConfig');
const User = require('../models/User');
const {
    getRecipients,
    isWecomEnabled,
    isWecomResponseOk,
    sendWecomText,
} = require('./wecomNotification');
const { getNotificationApiKey, sendAppNotification } = require('./notificationClient');

function formatDueTime(timestamp) {
    if (!Number.isFinite(timestamp)) return '';
    return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function selectReminderTasks(tasks, now = Date.now()) {
    return (Array.isArray(tasks) ? tasks : []).filter((task) => {
        if (!task || task.completed || task.reminderStatus === 'dismissed') return false;
        const reminderAt = Number(task.reminderAt);
        const dueAt = Number(task.dueAt);
        const triggerAt = Number.isFinite(reminderAt) && reminderAt > 0
            ? reminderAt
            : (Number.isFinite(dueAt) && dueAt > 0 ? dueAt : null);
        if (!triggerAt || triggerAt > now) return false;
        const remindedAt = Number(task.remindedAt);
        return task.reminderStatus !== 'sent'
            || !Number.isFinite(remindedAt)
            || remindedAt < triggerAt;
    });
}

function buildSummaryMessage(groups, now = Date.now()) {
    const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
    const lines = [
        '待办提醒',
        `提醒时间：${formatDueTime(now)}`,
        `共 ${total} 项任务需要处理`
    ];

    groups.forEach((group, index) => {
        const name = group.ownerName || group.userId || `用户${index + 1}`;
        lines.push('', `${name} (${group.tasks.length})`);
        group.tasks.forEach((task) => {
            const details = [];
            if (task.courseRef?.name) details.push(task.courseRef.name);
            if (Number.isFinite(task.dueAt)) details.push(`截止 ${formatDueTime(task.dueAt)}`);
            if (task.priority === 'high') details.push('高优先级');
            lines.push(`- ${task.title}${details.length ? ` (${details.join(' / ')})` : ''}`);
        });
    });
    return lines.join('\n');
}

function buildTodoAppNotificationPayload({
    recipientId,
    ownerId,
    groups,
    now = Date.now(),
    includeWecom = false,
    recipients = {},
}) {
    const tasks = groups.flatMap((group) => group.tasks.map((task) => ({ group, task })));
    const signature = tasks
        .map(({ group, task }) => [
            group.userId || ownerId,
            task.id,
            Number.isFinite(task.reminderAt) ? task.reminderAt : '',
            Number.isFinite(task.dueAt) ? task.dueAt : '',
        ].join(':'))
        .sort()
        .join('|');
    const digest = crypto.createHash('sha256')
        .update(`${ownerId}|${signature}`)
        .digest('hex')
        .slice(0, 24);
    const highPriority = tasks.some(({ task }) => task.priority === 'high');
    const key = `todo-reminder:${ownerId}:${digest}`;
    const payload = {
        idempotencyKey: key,
        dedupeKey: key,
        audience: { users: [recipientId] },
        channels: includeWecom ? ['app', 'wecom'] : ['app'],
        priority: highPriority ? 'high' : 'normal',
        category: 'todo.reminder',
        content: {
            kind: 'text',
            title: highPriority ? '有高优先级待办需要处理' : '待办事项提醒',
            summary: `${tasks.length} 项待办需要处理，请及时查看。`,
            blocks: [{ type: 'text', text: buildSummaryMessage(groups, now).slice(0, 12000) }],
        },
        source: {
            service: 'core-api',
            entityType: 'todo-reminder',
            entityId: digest,
        },
        actions: [{
            id: 'open-todos',
            label: '查看待办',
            deepLink: 'mycontrol://open?destination=today',
        }],
    };
    if (includeWecom) {
        payload.wecom = Object.fromEntries(
            Object.entries(recipients).filter(([, value]) => String(value || '').trim()),
        );
    }
    return payload;
}

function normalizeTodoDeliveryResponse(responseData = {}) {
    const push = {
        attempted: Number(responseData.push?.attempted) || 0,
        sent: Number(responseData.push?.sent) || 0,
        deferred: Number(responseData.push?.deferred) || 0,
        failed: Number(responseData.push?.failed) || 0,
        suppressed: Number(responseData.push?.suppressed) || 0,
    };
    const deduplicated = Boolean(responseData.deduplicated);
    const inboxAccepted = deduplicated || responseData.channels?.app === 'accepted';
    const status = push.sent > 0
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
        notificationId: responseData.notificationId || '',
        inboxAccepted,
        status,
        wecomStatus: responseData.channels?.wecom || 'not-requested',
        push,
    };
}

async function checkAndNotifyTodos(options = {}) {
    const {
        TodoListModel = TodoList,
        NotifyConfigModel = NotifyConfig,
        UserModel = User,
        sendApp = sendAppNotification,
        sendWecom = sendWecomText,
        now = Date.now,
    } = options;
    try {
        console.log(`[${new Date().toISOString()}] 开始执行待办事项检查任务...`);

        const notifyConfig = await NotifyConfigModel.findById('default');
        const cfg = (notifyConfig && notifyConfig.toObject()) || {};

        const appEnabled = Boolean(getNotificationApiKey(cfg.qywxApiKey));
        const wecomEnabled = isWecomEnabled(cfg);
        if (!appEnabled) {
            console.log('通知服务未配置，跳过 todoReminder');
            return { skipped: true, reason: 'notification_not_configured' };
        }

        const ownerId = String(cfg.ownerId || '').trim();
        if (!ownerId) {
            console.log('通知配置未绑定所有者，跳过 todoReminder');
            return { skipped: true, reason: 'owner_not_configured' };
        }

        const docs = await TodoListModel.find({ _id: ownerId });
        if (!docs || docs.length === 0) {
            console.log('待办集合为空，无需发送提醒');
            return { sent: false, pendingUsers: 0, pendingCount: 0 };
        }

        const groups = [];
        let totalPending = 0;
        const nowTs = now();

        for (const doc of docs) {
            const tasksRaw = Array.isArray(doc.tasks) ? doc.tasks : [];
            const pendingTasks = selectReminderTasks(tasksRaw, nowTs)
                .filter((item) => typeof item.title === 'string' && item.title.trim())
                .map((item) => ({
                    id: String(item.id),
                    title: item.title.trim(),
                    priority: item.priority || 'normal',
                    reminderAt: Number.isFinite(item.reminderAt) ? item.reminderAt : null,
                    dueAt: Number.isFinite(item.dueAt) ? item.dueAt : null,
                    courseRef: item.courseRef || null,
                }));
            if (pendingTasks.length === 0) continue;
            totalPending += pendingTasks.length;
            groups.push({
                userId: doc._id || '',
                ownerName: doc.ownerName || '',
                tasks: pendingTasks,
            });
        }

        if (groups.length === 0) {
            console.log('没有未完成的待办，跳过提醒');
            return { sent: false, pendingUsers: 0, pendingCount: 0 };
        }

        const text = buildSummaryMessage(groups, nowTs);
        const user = await UserModel.findById(ownerId).select('_id userId').lean();
        const recipientId = String(user?.userId || user?._id || ownerId).trim();
        const channels = {};
        let data;
        let ok = false;
        try {
            const response = await sendApp(buildTodoAppNotificationPayload({
                recipientId,
                ownerId,
                groups,
                now: nowTs,
                includeWecom: wecomEnabled,
                recipients: getRecipients(cfg),
            }), { apiKey: cfg.qywxApiKey });
            data = response.data;
            const delivery = normalizeTodoDeliveryResponse(data);
            channels.app = {
                success: delivery.inboxAccepted,
                status: delivery.status,
                notificationId: delivery.notificationId,
                push: delivery.push,
            };
            channels.wecom = {
                enabled: wecomEnabled,
                status: delivery.wecomStatus,
                success: !wecomEnabled || ['sent', 'deduplicated'].includes(delivery.wecomStatus),
            };
            ok = delivery.inboxAccepted;
        } catch (error) {
            channels.app = { success: false, status: 'failed', error: error.message || '发送失败' };
            if (!wecomEnabled) throw error;
            data = await sendWecom(cfg, text);
            ok = isWecomResponseOk(data);
            channels.wecom = { success: ok, status: ok ? 'sent' : 'failed' };
        }

        if (ok) {
            console.log('待办事项提醒投递成功');
            for (const group of groups) {
                if (!group.userId) continue;
                try {
                    const reminderIds = new Set(group.tasks.map((task) => task.id));
                    const doc = docs.find((item) => String(item._id) === String(group.userId));
                    const tasks = (Array.isArray(doc?.tasks) ? doc.tasks : []).map((task) => {
                        const plain = typeof task.toObject === 'function' ? task.toObject() : { ...task };
                        if (!reminderIds.has(String(plain.id))) return plain;
                        return { ...plain, reminderStatus: 'sent', remindedAt: nowTs };
                    });
                    await TodoListModel.updateOne(
                        { _id: group.userId },
                        { $set: { tasks, lastNotifiedAt: nowTs } }
                    );
                } catch (err) {
                    console.warn('更新 lastNotifiedAt 失败:', group.userId, err.message);
                }
            }
        } else {
            console.error('待办事项提醒发送失败:', data);
        }

        return {
            sent: ok,
            pendingUsers: groups.length,
            pendingCount: totalPending,
            channels,
            response: data,
        };

    } catch (err) {
        console.error('执行待办事项检查任务失败:', err);
        return { error: err.message };
    }
}

module.exports = {
    buildSummaryMessage,
    buildTodoAppNotificationPayload,
    checkAndNotifyTodos,
    normalizeTodoDeliveryResponse,
    selectReminderTasks,
};
