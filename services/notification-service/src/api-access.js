const crypto = require('crypto');
const { z } = require('zod');

const API_CLIENT_SCOPES = Object.freeze([
  'notifications:send',
  'notifications:enqueue',
  'notifications:status:read',
  'notifications:broadcast',
]);

const DEFAULT_API_CLIENT_SCOPES = Object.freeze(['notifications:send']);
const apiClientIdSchema = z.string().uuid();

function normalizeScopes(input) {
  const requested = Array.isArray(input) ? input : [];
  const scopes = requested
    .map((scope) => String(scope || '').trim())
    .filter((scope) => API_CLIENT_SCOPES.includes(scope));
  return scopes.length ? [...new Set(scopes)] : [...DEFAULT_API_CLIENT_SCOPES];
}

function nullableDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const apiClientCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(''),
  scopes: z.array(z.enum(API_CLIENT_SCOPES)).min(1).default([...DEFAULT_API_CLIENT_SCOPES]),
  rateLimitPerMinute: z.number().int().min(1).max(120).default(60),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  actor: z.string().trim().min(1).max(128),
}).transform((input) => ({ ...input, scopes: normalizeScopes(input.scopes), expiresAt: nullableDate(input.expiresAt) }));

const apiClientUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(''),
  scopes: z.array(z.enum(API_CLIENT_SCOPES)).min(1),
  rateLimitPerMinute: z.number().int().min(1).max(120),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  actor: z.string().trim().min(1).max(128),
}).transform((input) => ({ ...input, scopes: normalizeScopes(input.scopes), expiresAt: nullableDate(input.expiresAt) }));

const apiClientRotateSchema = z.object({
  overlapMinutes: z.number().int().min(0).max(10080).default(1440),
  actor: z.string().trim().min(1).max(128),
});

const apiClientRevokeSchema = z.object({
  actor: z.string().trim().min(1).max(128),
});

function hashApiToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createApiCredential() {
  const keyId = crypto.randomUUID();
  const publicId = crypto.randomBytes(6).toString('hex');
  const token = `ntf_live_${publicId}.${crypto.randomBytes(32).toString('base64url')}`;
  return {
    keyId,
    token,
    tokenHash: hashApiToken(token),
    tokenPrefix: `ntf_live_${publicId}`,
  };
}

function hasScope(identity, scope) {
  return !identity?.managed || identity.scopes?.includes(scope);
}

function requiresBroadcastScope(target = {}) {
  const touser = String(target.touser || '');
  return touser === '@all' || touser.includes('|') || Boolean(target.toparty) || Boolean(target.totag);
}

function buildOpenApiDocument({ serverUrl = 'https://pxyb.cn/api/notify' } = {}) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MY Notification API',
      version: '1.0.0',
      description: '企业微信通知发送与任务编排 API。需要兼容个人微信时，请使用 text 消息。',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
      },
      schemas: {
        TextMessage: {
          type: 'object',
          required: ['msg_type', 'touser', 'data'],
          properties: {
            msg_type: { type: 'string', const: 'text' },
            touser: { type: 'string', example: 'zhangsan' },
            data: {
              type: 'object',
              required: ['content'],
              properties: { content: { type: 'string', maxLength: 2048 } },
            },
          },
        },
      },
    },
    paths: {
      '/': {
        post: {
          summary: '立即发送通知',
          operationId: 'sendNotification',
          security: [{ ApiKey: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TextMessage' } } },
          },
          responses: {
            200: { description: '企业微信已接受消息' },
            400: { description: '请求参数或接收目标无效' },
            401: { description: 'API Key 无效' },
            403: { description: 'API Key 权限不足' },
            429: { description: '超过客户端频率限制' },
          },
        },
      },
      '/enqueue': {
        post: {
          summary: '创建即时或定时通知任务',
          operationId: 'enqueueNotification',
          security: [{ ApiKey: [] }],
          responses: {
            202: { description: '任务已创建' },
            400: { description: '任务参数无效' },
            401: { description: 'API Key 无效' },
            403: { description: 'API Key 权限不足' },
          },
        },
      },
      '/deliveries/{deliveryId}': {
        get: {
          summary: '查询当前 API 应用的一条发送结果',
          operationId: 'getDelivery',
          security: [{ ApiKey: [] }],
          parameters: [{ name: 'deliveryId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: '发送结果元数据' },
            404: { description: '记录不存在或不属于当前应用' },
          },
        },
      },
    },
  };
}

module.exports = {
  API_CLIENT_SCOPES,
  DEFAULT_API_CLIENT_SCOPES,
  apiClientCreateSchema,
  apiClientIdSchema,
  apiClientRevokeSchema,
  apiClientRotateSchema,
  apiClientUpdateSchema,
  buildOpenApiDocument,
  createApiCredential,
  hashApiToken,
  hasScope,
  normalizeScopes,
  requiresBroadcastScope,
};
