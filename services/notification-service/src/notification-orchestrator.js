const { z } = require('zod');

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

function nextAllowedTime(now, preference) {
  const quiet = preference?.quietHours;
  if (!quiet) return now;
  const offset = Number(preference.timezoneOffsetMinutes || 0);
  const localMinute = ((now.getUTCHours() * 60 + now.getUTCMinutes() + offset) % 1440 + 1440) % 1440;
  const start = minuteOfDay(quiet.start);
  const end = minuteOfDay(quiet.end);
  const within = start < end ? localMinute >= start && localMinute < end : localMinute >= start || localMinute < end;
  if (!within) return now;
  const deltaMinutes = (end - localMinute + 1440) % 1440 || 1440;
  return new Date(now.getTime() + deltaMinutes * 60000);
}

function createNotificationOrchestrator({ store, deliver, now = () => new Date() }) {
  async function enqueue(rawInput, { caller, actor = '', requestId = '' } = {}) {
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

  async function runDue(limit = 20) {
    const jobs = await store.claimDueNotificationJobs(Math.min(Math.max(Number(limit) || 20, 1), 100));
    const results = [];
    for (const job of jobs) {
      try {
        const outcome = await deliver(job.payload, {
          caller: job.caller || 'notification-orchestrator',
          actor: job.actor,
          requestId: job.requestId || `notification-job-${job.id}`,
        });
        const updated = await store.updateNotificationJob(job.id, {
          status: 'sent',
          sentAt: now(),
          deliveryId: outcome.delivery?.id || null,
          lastError: '',
        });
        results.push(updated);
      } catch (error) {
        const exhausted = Number(job.attempts) >= Number(job.maxAttempts || 4);
        const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(job.attempts) - 1)));
        const updated = await store.updateNotificationJob(job.id, {
          status: exhausted ? 'failed' : 'retrying',
          scheduledAt: exhausted ? job.scheduledAt : new Date(now().getTime() + delaySeconds * 1000),
          failedAt: exhausted ? now() : null,
          lastError: String(error.message || error).slice(0, 300),
        });
        results.push(updated);
      }
    }
    return results;
  }

  return {
    enqueue,
    runDue,
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
};
