const crypto = require('crypto');
const { z } = require('zod');
const { appNotificationSchema } = require('./app-notification-schema');

const templateKey = z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
const messageType = z.enum(['text', 'markdown']);
const targetSchema = z.object({
  touser: z.string().trim().min(1).max(256).optional(),
  toparty: z.string().trim().min(1).max(256).optional(),
  totag: z.string().trim().min(1).max(256).optional(),
}).refine((value) => [value.touser, value.toparty, value.totag].filter(Boolean).length === 1, '必须指定且只能指定一种发送目标');

const notificationTemplateSchema = z.object({
  key: templateKey,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).default(''),
  msgType: messageType,
  content: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
});

const enqueueNotificationSchema = z.object({
  templateKey: templateKey.optional(),
  msgType: messageType.optional(),
  content: z.string().trim().min(1).max(4096).optional(),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  target: targetSchema,
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  dedupeKey: z.string().trim().min(1).max(160).optional(),
  dedupeWindowSeconds: z.number().int().min(1).max(86400).default(300),
  maxAttempts: z.number().int().min(1).max(8).default(4),
}).superRefine((value, ctx) => {
  if (!value.templateKey && (!value.msgType || !value.content)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '必须指定模板，或同时指定消息类型与内容。' });
  }
});

const recipientPreferenceSchema = z.object({
  enabled: z.boolean().default(true),
  quietHours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).nullable().default(null),
  timezoneOffsetMinutes: z.number().int().min(-720).max(840).default(480),
});

function renderTemplate(content, variables = {}) {
  const missing = new Set();
  const rendered = String(content).replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    if (!Object.hasOwn(variables, key)) {
      missing.add(key);
      return '';
    }
    return String(variables[key]);
  });
  if (missing.size) throw Object.assign(new Error(`模板变量缺失：${[...missing].join('、')}`), { status: 400, code: 'TEMPLATE_VARIABLE_MISSING' });
  return rendered;
}

function minuteOfDay(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

const QUIET_HOUR_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 安静时段存在两种已落库的写法：
 * - 企微通道：`{ start: '22:00', end: '07:00' }`；
 * - App 通道（Android 提醒设置）：`{ enabled, startHour, endHour }`。
 * 统一解析为分钟后，两个通道才能共用同一套顺延逻辑。
 */
function resolveQuietWindow(preference) {
  const quiet = preference?.quietHours;
  if (!quiet) return null;
  if (typeof quiet.start === 'string' && typeof quiet.end === 'string'
    && QUIET_HOUR_TEXT.test(quiet.start) && QUIET_HOUR_TEXT.test(quiet.end)) {
    return { start: minuteOfDay(quiet.start), end: minuteOfDay(quiet.end) };
  }
  if (quiet.enabled !== true) return null;
  const startHour = Number(quiet.startHour);
  const endHour = Number(quiet.endHour);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) return null;
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) return null;
  return { start: startHour * 60, end: endHour * 60 };
}

function nextAllowedTime(now, preference) {
  const quiet = resolveQuietWindow(preference);
  if (!quiet) return now;
  const offset = Number(preference.timezoneOffsetMinutes || 0);
  const localMinute = ((now.getUTCHours() * 60 + now.getUTCMinutes() + offset) % 1440 + 1440) % 1440;
  const { start, end } = quiet;
  const within = start < end ? localMinute >= start && localMinute < end : localMinute >= start || localMinute < end;
  if (!within) return now;
  const deltaMinutes = (end - localMinute + 1440) % 1440 || 1440;
  return new Date(now.getTime() + deltaMinutes * 60000);
}

function createNotificationOrchestrator({
  store,
  deliver,
  deliverApp,
  now = () => new Date(),
  concurrency = 4,
  leaseMs = 120000,
  workerId = `notification-${process.pid}-${crypto.randomUUID().slice(0, 8)}`,
} = {}) {
  const workerConcurrency = Math.min(Math.max(Number(concurrency) || 4, 1), 10);
  const normalizedLeaseMs = Math.min(Math.max(Number(leaseMs) || 120000, 1000), 900000);
  let activeRun = null;

  async function enqueue(rawInput, { caller, actor = '', requestId = '', apiClient = null } = {}) {
    const input = enqueueNotificationSchema.parse(rawInput);
    const template = input.templateKey ? await store.getTemplate(input.templateKey) : null;
    if (input.templateKey && (!template || template.enabled === false)) {
      throw Object.assign(new Error('通知模板不存在或已停用。'), { status: 404, code: 'TEMPLATE_UNAVAILABLE' });
    }
    const msgType = template?.msgType || input.msgType;
    const content = renderTemplate(template?.content || input.content, input.variables);
    const maximum = msgType === 'markdown' ? 4096 : 2048;
    if (content.length > maximum) {
      throw Object.assign(new Error(`渲染后的消息超过 ${maximum} 个字符。`), { status: 400, code: 'RENDERED_MESSAGE_TOO_LONG' });
    }

    const singleTarget = input.target.touser && input.target.touser !== '@all' && !input.target.touser.includes('|')
      ? input.target.touser
      : null;
    const preference = singleTarget ? await store.getRecipientPreference(singleTarget) : null;
    const requestedAt = input.scheduledAt ? new Date(input.scheduledAt) : now();
    const scheduledAt = nextAllowedTime(requestedAt > now() ? requestedAt : now(), preference);
    const payload = {
      msg_type: msgType,
      data: { content },
      ...input.target,
      enable_duplicate_check: 1,
      duplicate_check_interval: Math.min(600, input.dedupeWindowSeconds),
    };
    return store.createNotificationJob({
      caller,
      actor: String(actor || '').slice(0, 128),
      requestId,
      apiClientId: apiClient?.clientId || null,
      apiClientName: apiClient?.clientName || '',
      apiKeyId: apiClient?.keyId || null,
      templateKey: template?.key || '',
      msgType,
      targetType: input.target.touser ? 'user' : input.target.toparty ? 'party' : 'tag',
      targetValue: input.target.touser || input.target.toparty || input.target.totag,
      status: preference?.enabled === false ? 'suppressed' : 'scheduled',
      scheduledAt,
      maxAttempts: input.maxAttempts,
      dedupeKey: input.dedupeKey || '',
      dedupeWindowMs: input.dedupeWindowSeconds * 1000,
      payload,
    });
  }

  async function enqueueApp(rawInput, { caller, actor = '', requestId = '', apiClient = null } = {}) {
    const input = appNotificationSchema.parse(rawInput);
    const requestedAt = input.scheduledAt || now();
    const recipients = [...input.audience.users].sort();
    // 单收件人时与企微通道保持一致：落在安静时段内的通知顺延到时段结束，而不是丢掉；
    // 多人广播保持立即入箱，由 App 推送分发器按收件人各自静音。
    const preference = recipients.length === 1 ? await store.getRecipientPreference(recipients[0]) : null;
    const scheduledAt = nextAllowedTime(requestedAt > now() ? requestedAt : now(), preference);
    return store.createNotificationJob({
      caller,
      actor: String(actor || '').slice(0, 128),
      requestId,
      apiClientId: apiClient?.clientId || null,
      apiClientName: apiClient?.clientName || '',
      apiKeyId: apiClient?.keyId || null,
      templateKey: '',
      msgType: 'app',
      deliveryKind: 'app',
      targetType: 'app-user',
      targetValue: recipients.join('|'),
      status: 'scheduled',
      scheduledAt,
      maxAttempts: input.maxAttempts,
      dedupeKey: input.dedupeKey,
      dedupeWindowMs: input.dedupeWindowSeconds * 1000,
      payload: input,
    });
  }

  async function processJob(job) {
    let heartbeatStopped = false;
    let heartbeatPromise = Promise.resolve();
    const heartbeatIntervalMs = Math.max(1000, Math.floor(normalizedLeaseMs / 3));
    const heartbeatTimer = setInterval(() => {
      if (heartbeatStopped) return;
      heartbeatPromise = heartbeatPromise.then(() => store.renewNotificationJobLease(job.id, {
        leaseId: job.leaseId,
        workerId,
        leaseMs: normalizedLeaseMs,
      })).catch((error) => {
        console.error(`notification job ${job.id} lease renewal failed`, error);
      });
    }, heartbeatIntervalMs);
    heartbeatTimer.unref?.();

    try {
      try {
        const delivery = job.deliveryKind === 'app' ? deliverApp : deliver;
        if (typeof delivery !== 'function') throw new Error(`Notification delivery handler is unavailable for ${job.deliveryKind || 'wecom'} jobs.`);
        const outcome = await delivery(job.payload, {
          caller: job.caller || 'notification-orchestrator',
          actor: job.actor,
          requestId: job.requestId || `notification-job-${job.id}`,
          apiClient: job.apiClientId ? {
            clientId: job.apiClientId,
            clientName: job.apiClientName,
            keyId: job.apiKeyId,
          } : null,
        });
        return await store.updateNotificationJob(job.id, {
          status: 'sent',
          sentAt: now(),
          deliveryId: outcome.delivery?.id || outcome.wecomDeliveryId || outcome.notificationId || null,
          lastError: '',
        }, { leaseId: job.leaseId });
      } catch (error) {
        const exhausted = Number(job.attempts) >= Number(job.maxAttempts || 4);
        const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(job.attempts) - 1)));
        return await store.updateNotificationJob(job.id, {
          status: exhausted ? 'failed' : 'retrying',
          scheduledAt: exhausted ? job.scheduledAt : new Date(now().getTime() + delaySeconds * 1000),
          failedAt: exhausted ? now() : null,
          lastError: String(error.message || error).slice(0, 300),
        }, { leaseId: job.leaseId });
      }
    } finally {
      heartbeatStopped = true;
      clearInterval(heartbeatTimer);
      await heartbeatPromise;
    }
  }

  async function executeDue(limit) {
    const maximum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const results = [];
    let reserved = 0;
    const workers = await Promise.allSettled(Array.from({ length: Math.min(workerConcurrency, maximum) }, async () => {
      while (reserved < maximum) {
        reserved += 1;
        const [job] = await store.claimDueNotificationJobs(1, { workerId, leaseMs: normalizedLeaseMs });
        if (!job) break;
        results.push(await processJob(job));
      }
    }));
    const failedWorker = workers.find((result) => result.status === 'rejected');
    if (failedWorker) throw failedWorker.reason;
    return results;
  }

  function runDue(limit = 20) {
    if (activeRun) return activeRun;
    activeRun = (async () => {
      try {
        return await executeDue(limit);
      } finally {
        activeRun = null;
      }
    })();
    return activeRun;
  }

  return {
    enqueue,
    enqueueApp,
    runDue,
    whenIdle: () => activeRun || Promise.resolve(),
    getQueueOverview: () => store.getNotificationQueueOverview(),
    listJobs: (filters) => store.listNotificationJobs(filters),
    cancelJob: (id) => store.cancelNotificationJob(id),
    listTemplates: () => store.listTemplates(),
    saveTemplate: (input) => store.saveTemplate(notificationTemplateSchema.parse(input)),
    deleteTemplate: (key) => store.deleteTemplate(templateKey.parse(key)),
    getPreference: (targetId) => store.getRecipientPreference(String(targetId || '').trim()),
    savePreference: (targetId, input) => store.saveRecipientPreference(String(targetId || '').trim(), recipientPreferenceSchema.parse(input)),
  };
}

module.exports = {
  createNotificationOrchestrator,
  enqueueNotificationSchema,
  nextAllowedTime,
  notificationTemplateSchema,
  recipientPreferenceSchema,
  renderTemplate,
  resolveQuietWindow,
};
