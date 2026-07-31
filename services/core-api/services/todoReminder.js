/* Send only task-level reminders that have become due and were not acknowledged. */

const TodoList = require('../models/TodoList');
const NotifyConfig = require('../models/NotifyConfig');
const {
    isWecomEnabled,
    isWecomResponseOk,
    sendWecomText,
} = require('./wecomNotification');

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

async function checkAndNotifyTodos() {
    try {
        console.log(`[${new Date().toISOString()}] 开始执行待办事项检查任务...`);

        const notifyConfig = await NotifyConfig.findById('default');
        const cfg = (notifyConfig && notifyConfig.toObject()) || {};

        if (!isWecomEnabled(cfg)) {
            console.log('企业微信通知未启用，跳过 todoReminder');
            return { skipped: true, reason: 'wecom_disabled' };
        }

        const ownerId = String(cfg.ownerId || '').trim();
        if (!ownerId) {
            console.log('通知配置未绑定所有者，跳过 todoReminder');
            return { skipped: true, reason: 'owner_not_configured' };
        }

        const docs = await TodoList.find({ _id: ownerId });
        if (!docs || docs.length === 0) {
            console.log('待办集合为空，无需发送提醒');
            return { sent: false, pendingUsers: 0, pendingCount: 0 };
        }

        const groups = [];
        let totalPending = 0;
        const nowTs = Date.now();

        for (const doc of docs) {
            const tasksRaw = Array.isArray(doc.tasks) ? doc.tasks : [];
            const pendingTasks = selectReminderTasks(tasksRaw, nowTs)
                .filter((item) => typeof item.title === 'string' && item.title.trim())
                .map((item) => ({
                    id: String(item.id),
                    title: item.title.trim(),
                    priority: item.priority || 'normal',
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
        const data = await sendWecomText(cfg, text);
        const ok = isWecomResponseOk(data);

        if (ok) {
            console.log('待办事项提醒发送成功');
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
                    await TodoList.updateOne(
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
            response: data,
        };

    } catch (err) {
        console.error('执行待办事项检查任务失败:', err);
        return { error: err.message };
    }
}

module.exports = {
    buildSummaryMessage,
    checkAndNotifyTodos,
    selectReminderTasks,
};
