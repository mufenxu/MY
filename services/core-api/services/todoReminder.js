/*
  todoReminder - 待办事项提醒服务
  作用：检查 todo_lists 集合中所有用户的未完成待办事项，
       统计每个用户的未完成任务数量，并生成汇总报告，通过企业微信发送提醒。
*/

const TodoList = require('../models/TodoList');
const NotifyConfig = require('../models/NotifyConfig');
const {
    isWecomEnabled,
    isWecomResponseOk,
    sendWecomText,
} = require('./wecomNotification');

function buildSummaryMessage(groups) {
    const nowTime = new Date().toLocaleString('zh-CN', { hour12: false });
    let total = 0;

    groups.forEach(g => { total += g.tasks.length; });

    let statusLevel = '🟢 正常 (Healthy)';
    if (total > 20) statusLevel = '🔴 紧急 (Urgent)';
    else if (total > 5) statusLevel = '🟡 需关注 (Attention)';

    const lines = [
        '✨ 星轨轻具坊 · 每日播报',
        '【团队待办事项追踪】',
        '',
        '新的一天开始啦！这里是您的未决待办跟进，',
        '请合理安排今日工作计划。',
        '',
        `▶ 播报时间：${nowTime}`,
        `▶ 待办积压：总计 ${total} 项任务待处理`,
        `▶ 进度评级：${statusLevel}`
    ];

    groups.forEach((group, index) => {
        const name = group.ownerName || group.userId || `用户${index + 1}`;
        lines.push('', `--- 👤 ${name} 的待办 (${group.tasks.length}) ---`);
        group.tasks.forEach((task) => {
            const title = task && task.title ? task.title : '未命名任务';
            lines.push(` ◻️ ${title}`);
        });
    });

    lines.push(
        '',
        '💡 星轨提醒：积跬步至千里。',
        '请及时登录系统面板进行任务流转与核销。'
    );
    
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

        for (const doc of docs) {
            const tasksRaw = Array.isArray(doc.tasks) ? doc.tasks : [];
            const pendingTasks = [];
            for (const item of tasksRaw) {
                if (item.completed) continue;
                const title = typeof item.title === 'string' ? item.title : '';
                if (!title) continue;
                pendingTasks.push({
                    title: title.trim(),
                    createdAt: typeof item.createdAt === 'number' ? item.createdAt : null,
                });
            }
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

        const text = buildSummaryMessage(groups);
        const data = await sendWecomText(cfg, text);
        const ok = isWecomResponseOk(data);

        if (ok) {
            console.log('待办事项提醒发送成功');
            const nowTs = Date.now();
            for (const group of groups) {
                if (!group.userId) continue;
                try {
                    await TodoList.updateOne(
                        { _id: group.userId },
                        { $set: { lastNotifiedAt: nowTs } }
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
    checkAndNotifyTodos
};
