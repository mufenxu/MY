const { z } = require('zod');

const httpsUrl = z.string().trim().url().refine((value) => value.startsWith('https://'), 'URL must use HTTPS');

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(12000) }),
  z.object({ type: z.literal('markdown'), markdown: z.string().trim().min(1).max(20000) }),
  z.object({
    type: z.literal('keyValue'),
    items: z.array(z.object({ key: z.string().trim().min(1).max(80), value: z.string().trim().max(500) })).min(1).max(30),
  }),
  z.object({
    type: z.literal('list'),
    items: z.array(z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().max(500).default('') })).min(1).max(30),
  }),
  z.object({ type: z.literal('image'), url: httpsUrl, alt: z.string().trim().max(160).default('通知图片') }),
  z.object({ type: z.literal('progress'), value: z.number().min(0).max(100), label: z.string().trim().max(160).default('') }),
  z.object({ type: z.literal('attachment'), url: httpsUrl, fileName: z.string().trim().min(1).max(180), mediaType: z.string().trim().max(120).default('application/octet-stream') }),
]);

const actionSchema = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9._:-]{1,80}$/),
  label: z.string().trim().min(1).max(40),
  deepLink: z.string().trim().max(500).refine((value) => value.startsWith('mycontrol://') || value.startsWith('https://'), 'Action links must use an approved scheme'),
});

const appContentSchema = z.object({
  kind: z.enum(['text', 'markdown', 'card', 'list']),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).default(''),
  blocks: z.array(blockSchema).max(30).default([]),
});

const appNotificationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  audience: z.object({
    users: z.array(z.string().trim().min(1).max(128)).min(1).max(500),
  }),
  channels: z.array(z.enum(['app', 'wecom'])).min(1).max(2).default(['app']),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  category: z.string().trim().regex(/^[a-z][a-z0-9._-]{1,63}$/),
  content: appContentSchema,
  source: z.object({
    service: z.string().trim().min(1).max(80),
    entityType: z.string().trim().min(1).max(80),
    entityId: z.string().trim().max(160).default(''),
  }),
  actions: z.array(actionSchema).max(5).default([]),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  dedupeKey: z.string().trim().max(200).optional(),
  wecom: z.object({
    touser: z.string().trim().min(1).max(512).optional(),
    toparty: z.string().trim().min(1).max(512).optional(),
    totag: z.string().trim().min(1).max(512).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.channels.includes('app')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['channels'], message: 'Canonical notifications must include the app channel' });
  }
  if (value.channels.includes('wecom') && !value.wecom?.touser && !value.wecom?.toparty && !value.wecom?.totag) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wecom'], message: 'WeCom channel requires an explicit target' });
  }
}).transform((value) => ({
  ...value,
  audience: { users: [...new Set(value.audience.users)] },
  expiresAt: value.expiresAt ? new Date(value.expiresAt) : null,
  dedupeKey: value.dedupeKey || value.idempotencyKey,
}));

const appDeviceSchema = z.object({
  installationId: z.string().trim().regex(/^[A-Za-z0-9._:-]{8,128}$/),
  provider: z.enum(['poll', 'fcm', 'hms', 'vendor']),
  token: z.string().trim().max(4096).default(''),
  appVersion: z.string().trim().max(40).default(''),
  deviceModel: z.string().trim().max(120).default(''),
});

const appPreferenceSchema = z.object({
  enabled: z.boolean().default(true),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    startHour: z.number().int().min(0).max(23).default(22),
    endHour: z.number().int().min(0).max(23).default(7),
  }).default({ enabled: false, startHour: 22, endHour: 7 }),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(480),
});

function contentToText(content, maxLength = 4096) {
  const parts = [content.title, content.summary];
  for (const block of content.blocks || []) {
    if (block.type === 'text') parts.push(block.text);
    if (block.type === 'markdown') parts.push(block.markdown);
    if (block.type === 'keyValue') parts.push(...block.items.map((item) => `${item.key}: ${item.value}`));
    if (block.type === 'list') parts.push(...block.items.map((item) => `${item.title} ${item.description}`.trim()));
    if (block.type === 'progress') parts.push(`${block.label} ${block.value}%`.trim());
  }
  return parts.filter(Boolean).join('\n').slice(0, maxLength);
}

function toWeComMessage(input) {
  const isMarkdown = input.content.kind === 'markdown';
  return {
    msg_type: isMarkdown ? 'markdown' : 'text',
    data: { content: contentToText(input.content, isMarkdown ? 4096 : 2048) },
    ...(input.wecom || {}),
  };
}

module.exports = {
  appContentSchema,
  appDeviceSchema,
  appNotificationSchema,
  appPreferenceSchema,
  contentToText,
  toWeComMessage,
};
