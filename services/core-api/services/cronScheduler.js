/*
  定时任务调度器
  使用 node-cron 来调度多个任务
*/

const cron = require('node-cron');
const CronConfig = require('../models/CronConfig');
const { checkAndNotify } = require('./dueReminder');
const { checkAndNotifyTodos } = require('./todoReminder');

// 存储活跃的任务实例
// { [taskId]: { task: CronJob, schedule: string } }
const activeTasks = {};

const TASKS = {
    'due_reminder': {
        handler: checkAndNotify,
        defaultSchedule: '0 9 * * *', // 每天上午 9:00
        name: '资源到期提醒'
    },
    'todo_reminder': {
        handler: checkAndNotifyTodos,
        defaultSchedule: '0 9 * * *', // 每天上午 9:00
        name: '待办事项提醒'
    },
    'ct8_task': {
        handler: async (isManual) => {
            const githubService = require('./githubService');
            // CT8 触发不需要特定 IP，只要不为空或者 mock 一个。
            // 移除 trigger_type，因为 GitHub 工作流未定义该 input 会导致 422 错误
            return await githubService.triggerAction('127.0.0.1', {});
        },
        defaultSchedule: '0 8 * * *', // 每天上午 8:00
        name: 'CT8节点签到'
    }
};

/**
 * 获取任务状态
 */
function getStatus(taskId) {
    if (taskId) {
        const task = activeTasks[taskId];
        return {
            running: !!task,
            schedule: task ? task.schedule : null
        };
    }

    const status = {};
    for (const id in TASKS) {
        const task = activeTasks[id];
        status[id] = {
            running: !!task,
            schedule: task ? task.schedule : null
        };
    }
    return status;
}

/**
 * 启动指定任务
 */
function startTask(taskId, schedule) {
    const taskDef = TASKS[taskId];
    if (!taskDef) {
        return { success: false, error: `未知任务: ${taskId}` };
    }

    // 停止旧任务
    stopTask(taskId);

    // 验证 cron 表达式
    if (!cron.validate(schedule)) {
        return { success: false, error: `无效的 cron 表达式: ${schedule}` };
    }

    console.log(`启动定时任务 [${taskDef.name}] (${taskId})，执行时间: ${schedule}`);

    const job = cron.schedule(schedule, async () => {
        console.log(`[${new Date().toISOString()}] 任务触发: ${taskDef.name}`);
        try {
            await taskDef.handler();
        } catch (err) {
            console.error(`任务执行失败 [${taskId}]:`, err);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Shanghai"
    });

    activeTasks[taskId] = {
        task: job,
        schedule: schedule
    };

    return { success: true, schedule };
}

/**
 * 停止指定任务
 */
function stopTask(taskId) {
    const active = activeTasks[taskId];
    if (active && active.task) {
        active.task.stop();
        delete activeTasks[taskId];
        console.log(`任务已停止: ${taskId}`);
        return true;
    }
    return false;
}

/**
 * 立即执行任务
 */
async function runTaskNow(taskId) {
    const taskDef = TASKS[taskId];
    if (!taskDef) {
        throw new Error(`未知任务: ${taskId}`);
    }
    console.log(`手动触发任务: ${taskDef.name}`);
    return await taskDef.handler(true);
}

/**
 * 初始化所有任务
 */
async function initCron() {
    console.log('正在初始化定时任务...');

    for (const taskId in TASKS) {
        try {
            const taskDef = TASKS[taskId];
            // 从数据库读取配置，ID 使用 taskId (如 'due_reminder', 'todo_reminder')
            // 为了兼容旧数据，'due_reminder' 可能需要检查 'default' ID，或者我们迁移数据
            // 这里我们假设新配置使用 taskId 作为 _id

            let config = await CronConfig.findById(taskId);

            // 兼容旧的 default 配置给 due_reminder
            if (!config && taskId === 'due_reminder') {
                const oldConfig = await CronConfig.findById('default');
                if (oldConfig) {
                    console.log('迁移旧的 default 配置到 due_reminder');
                    config = await CronConfig.create({
                        _id: 'due_reminder',
                        schedule: oldConfig.schedule,
                        enabled: oldConfig.enabled,
                        updatedAt: Date.now()
                    });
                }
            }

            // 清理旧的 default 记录，避免界面混淆
            if (taskId === 'due_reminder') {
                const legacyDefault = await CronConfig.findById('default');
                if (legacyDefault) {
                    console.log('清理旧的 default 定时任务配置');
                    await CronConfig.findByIdAndDelete('default');
                }
            }

            const schedule = config?.schedule || taskDef.defaultSchedule;
            const enabled = config?.enabled !== false; // 默认启用

            if (enabled) {
                startTask(taskId, schedule);
            } else {
                console.log(`任务已禁用: ${taskDef.name} (${taskId})`);
            }
        } catch (err) {
            console.error(`初始化任务失败 [${taskId}]:`, err);
        }
    }
}

module.exports = {
    startTask,
    stopTask,
    runTaskNow,
    getStatus,
    initCron,
    TASKS,
    checkAndNotify,
    checkAndNotifyTodos
};
