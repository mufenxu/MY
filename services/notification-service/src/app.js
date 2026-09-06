const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const { verifyPlatformSsoRequest, verifyServiceRequest } = require('@my-platform/platform-auth');
const { z } = require('zod');

const WeComClient = require('./wecom-client');
const { notificationSchema, buildWeComPayload } = require('./notification-schema');
const { createNotificationOrchestrator } = require('./notification-orchestrator');
const { createMemoryNotificationStore } = require('./notification-store');
const { createAppPushDispatcher } = require('./app-push');
const {
  appDeviceSchema,
  appNotificationSchema,
  appPreferenceSchema,
  toWeComMessage,
} = require('./app-notification-schema');
const {
  API_CLIENT_SCOPES,
  apiClientCreateSchema,
  apiClientIdSchema,
  apiClientRevokeSchema,
  apiClientRotateSchema,
  apiClientUpdateSchema,
  buildOpenApiDocument,
  hasScope,
  requiresBroadcastScope,
} = require('./api-access');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createReplayGuard({ ttlMs = 60_000, maxEntries = 4_096 } = {}) {
  const seen = new Map();
  return ({ caller, nonce, timestamp }) => {
    const now = Date.now();
    for (const [key, expiresAt] of seen) {
      if (expiresAt <= now) seen.delete(key);
    }
    const key = `${caller}:${nonce}`;
    if (seen.has(key)) return false;
    seen.set(key, Math.max(now, timestamp) + ttlMs);
    while (seen.size > maxEntries) seen.delete(seen.keys().next().value);
    return true;
  };
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function targetMetadata(body) {
  if (body.touser) {
    return {
      targetType: body.touser === '@all' ? 'all' : 'user',
      targetValue: String(body.touser).slice(0, 256),
      retryable: body.touser !== '@all' && !body.touser.includes('|'),
    };
  }
  if (body.toparty) return { targetType: 'party', targetValue: String(body.toparty).slice(0, 256), retryable: false };
  if (body.totag) return { targetType: 'tag', targetValue: String(body.totag).slice(0, 256), retryable: false };
  return { targetType: 'all', targetValue: '@all', retryable: false };
}

function deliveryFailure(error) {
  return {
    status: 'failed',
    errorCode: String(error.code || error.name || 'DELIVERY_FAILED').slice(0, 80),
    errorMessage: String(error.message || error).slice(0, 300),
    wecomCode: Number.isFinite(Number(error.wecomCode)) ? Number(error.wecomCode) : null,
  };
}

const testNotificationSchema = z.object({
  actor: z.string().trim().min(1).max(128),
  msgType: z.enum(['text', 'markdown']),
  touser: z.string().trim().min(1).max(64).refine((value) => value !== '@all' && !value.includes('|'), '测试通知只能发送给一个明确用户'),
  content: z.string().trim().min(1).max(4096),
});

const appTestNotificationSchema = z.object({
  actor: z.string().trim().min(1).max(128),
  userId: z.string().trim().min(1).max(128)
    .refine((value) => value !== '@all' && !value.includes('|'), 'App 测试通知只能发送给一个明确平台用户'),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('high'),
});

function createApp({ config, wecomClient = null, notificationStore = null, appPushDispatcher = null } = {}) {
  if (!config) throw new Error('Notification service config is required.');
  const app = express();
  const client = wecomClient || new WeComClient({
    corpId: config.wecom.corpId,
    secret: config.wecom.secret,
    margin: config.tokenCacheMargin,
  });
  const store = notificationStore || createMemoryNotificationStore({
    encryptionKey: config.historyEncryptionKey,
    retentionDays: config.historyRetentionDays,
  });
  const pushDispatcher = appPushDispatcher || createAppPushDispatcher();
  const guardAgainstReplay = createReplayGuard();
  const apiRateWindows = new Map();

  function verifySignedRequest(req, allowedCallers) {
    return verifyServiceRequest({
      headers: req.headers,
      secret: config.apiKey,
      allowedCallers,
      method: req.method,
      pathname: req.originalUrl || req.url,
      body: req.rawBody || '',
      replayGuard: guardAgainstReplay,
    });
  }

  const checkNotifyAccess = async (req, res, next) => {
    try {
      const apiKey = req.get('X-API-KEY');
      if (apiKey && safeEqual(apiKey, config.apiKey)) {
        req.serviceCaller = 'external-api';
        req.apiClient = { managed: false, legacy: true };
        return next();
      }
      if (apiKey) {
        const managedClient = await store.verifyApiToken(apiKey);
        if (managedClient) {
          req.serviceCaller = 'external-api';
          req.apiClient = managedClient;
          req.apiRequestStartedAt = Date.now();
          return next();
        }
      }
      const identity = verifySignedRequest(req, config.internalCallers || []);
      if (!identity) return res.status(401).json({ errcode: 401, errmsg: '无效的通知服务凭据' });
      req.serviceCaller = identity.caller;
      req.apiClient = null;
      return next();
    } catch (error) {
      next(error);
      return undefined;
    }
  };

  const checkManagementAccess = (req, res, next) => {
    const identity = verifySignedRequest(req, config.managementCallers || ['admin-console']);
    if (!identity) return res.status(401).json({ error: '管理请求签名无效。', code: 'MANAGEMENT_UNAUTHORIZED' });
    req.serviceCaller = identity.caller;
    return next();
  };

  const checkAppAccess = (req, res, next) => {
    const identity = verifyPlatformSsoRequest(req, { audience: 'notify' });
    if (!identity) {
      return res.status(401).json({ error: '统一登录会话已失效，请重新登录。', code: 'PLATFORM_SESSION_REQUIRED' });
    }
    req.appIdentity = identity;
    req.appUserId = String(identity.sub);
    res.setHeader('Cache-Control', 'no-store');
    return next();
  };

  async function recordManagedApiRequest(req, {
    endpoint,
    httpStatus,
    errorCode = '',
    deliveryId = null,
    body = null,
  }) {
    if (!req.apiClient?.managed) return;
    const targetSource = body?.target || body;
    const target = targetSource && (targetSource.touser || targetSource.toparty || targetSource.totag)
      ? targetMetadata(targetSource)
      : { targetType: '', targetValue: '' };
    try {
      await store.recordApiRequest({
        clientId: req.apiClient.clientId,
        clientName: req.apiClient.clientName,
        keyId: req.apiClient.keyId,
        endpoint,
        method: req.method,
        httpStatus,
        outcome: httpStatus >= 200 && httpStatus < 400 ? 'success' : 'failure',
        durationMs: Math.max(0, Date.now() - Number(req.apiRequestStartedAt || Date.now())),
        requestId: req.id,
        deliveryId,
        targetType: target.targetType || '',
        targetValue: String(target.targetValue || '').slice(0, 256),
        msgType: String(body?.msg_type || body?.msgType || '').slice(0, 32),
        errorCode: String(errorCode || '').slice(0, 80),
      });
    } catch (error) {
      console.error(`[${req.id}] notification api request audit failed`, error);
    }
  }

  function requireApiScope(scope, endpoint) {
    return async (req, res, next) => {
      if (hasScope(req.apiClient, scope)) return next();
      await recordManagedApiRequest(req, { endpoint, httpStatus: 403, errorCode: 'API_SCOPE_REQUIRED', body: req.body });
      return res.status(403).json({ errcode: 403, errmsg: '当前 API Key 权限不足', code: 'API_SCOPE_REQUIRED', requestId: req.id });
    };
  }

  function enforceManagedTarget(endpoint, targetSelector) {
    return async (req, res, next) => {
      if (!req.apiClient?.managed) return next();
      const target = targetSelector(req.body || {});
      if (!target.touser && !target.toparty && !target.totag) {
        await recordManagedApiRequest(req, { endpoint, httpStatus: 400, errorCode: 'EXPLICIT_TARGET_REQUIRED', body: req.body });
        return res.status(400).json({ errcode: 400, errmsg: '托管 API 客户端必须明确指定接收目标', code: 'EXPLICIT_TARGET_REQUIRED', requestId: req.id });
      }
      if (requiresBroadcastScope(target) && !hasScope(req.apiClient, 'notifications:broadcast')) {
        await recordManagedApiRequest(req, { endpoint, httpStatus: 403, errorCode: 'BROADCAST_SCOPE_REQUIRED', body: req.body });
        return res.status(403).json({ errcode: 403, errmsg: '部门、标签、多用户或全员发送需要广播权限', code: 'BROADCAST_SCOPE_REQUIRED', requestId: req.id });
      }
      return next();
    };
  }

  const enforceClientRateLimit = (endpoint) => async (req, res, next) => {
    if (!req.apiClient?.managed) return next();
    const timestamp = Date.now();
    const current = apiRateWindows.get(req.apiClient.clientId);
    const window = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + 60_000 }
      : current;
    const limit = Math.min(Math.max(Number(req.apiClient.rateLimitPerMinute) || 60, 1), 120);
    if (window.count >= limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - timestamp) / 1000))));
      await recordManagedApiRequest(req, { endpoint, httpStatus: 429, errorCode: 'API_CLIENT_RATE_LIMITED', body: req.body });
      return res.status(429).json({ errcode: 429, errmsg: '当前 API 客户端调用过于频繁', code: 'API_CLIENT_RATE_LIMITED', requestId: req.id });
    }
    window.count += 1;
    apiRateWindows.set(req.apiClient.clientId, window);
    while (apiRateWindows.size > 2048) apiRateWindows.delete(apiRateWindows.keys().next().value);
    return next();
  };

  async function safelyCreateDelivery(input) {
    try {
      return await store.createDelivery(input);
    } catch (error) {
      console.error(`[${input.requestId}] notification history create failed`, error);
      return null;
    }
  }

  async function safelyCompleteDelivery(id, update, requestId) {
    if (!id) return null;
    try {
      return await store.completeDelivery(id, update);
    } catch (error) {
      console.error(`[${requestId}] notification history completion failed`, error);
      return null;
    }
  }

  async function deliver(body, { caller, actor = '', requestId, parentDeliveryId = null, apiClient = null } = {}) {
    const parsed = notificationSchema.parse(body);
    const target = targetMetadata(parsed);
    const startedAt = Date.now();
    const delivery = await safelyCreateDelivery({
      caller,
      actor: String(actor || '').slice(0, 128),
      requestId,
      apiClientId: apiClient?.clientId || null,
      apiClientName: apiClient?.clientName || '',
      apiKeyId: apiClient?.keyId || null,
      msgType: parsed.msg_type,
      ...target,
      parentDeliveryId,
      payload: parsed,
    });
    try {
      const result = await client.sendMessage(buildWeComPayload(parsed, config.wecom.agentId));
      const completed = await safelyCompleteDelivery(delivery?.id, {
        status: 'success',
        durationMs: Date.now() - startedAt,
        wecomCode: Number.isFinite(Number(result?.errcode)) ? Number(result.errcode) : 0,
      }, requestId);
      return { result, delivery: completed || delivery };
    } catch (error) {
      await safelyCompleteDelivery(delivery?.id, {
        ...deliveryFailure(error),
        durationMs: Date.now() - startedAt,
      }, requestId);
      throw error;
    }
  }

  async function createLegacyAppNotification(req) {
    const appRecipients = String(req.body?.touser || '')
      .split('|')
      .map((value) => value.trim())
      .filter((value) => value !== '@all' && /^[A-Za-z0-9._:@-]{1,128}$/.test(value));
    if (appRecipients.length === 0) return null;
    try {
      const legacy = notificationSchema.parse(req.body);
      const contentText = [
        legacy.data?.content,
        legacy.data?.title,
        legacy.data?.description,
      ].filter((value) => typeof value === 'string' && value.trim()).join('\n').trim();
      const title = contentText.split(/\r?\n/, 1)[0].slice(0, 160) || '系统通知';
      const contentKind = legacy.msg_type === 'markdown' ? 'markdown' : 'text';
      const created = await store.createAppNotification({
        caller: req.serviceCaller || 'legacy-wecom',
        idempotencyKey: `legacy:${req.id}`,
        recipients: appRecipients,
        message: {
          category: 'system',
          priority: 'normal',
          title,
          summary: contentText.slice(0, 280),
          content: {
            kind: contentKind,
            title,
            summary: contentText.slice(0, 280),
            blocks: [{ type: contentKind, [contentKind]: contentText }],
          },
          source: { service: req.serviceCaller || 'legacy-wecom', entityType: 'notification', entityId: req.id },
          actions: [],
        },
      });
      if (!created.deduplicated) {
        await safelyDispatchAppPush(req.id, {
          store,
          notification: { id: created.notification.id, category: 'system', priority: 'normal' },
          recipients: appRecipients,
        });
      }
      return created.notification?.id || null;
    } catch (error) {
      console.error(`[${req.id}] app inbox compatibility write failed`, error);
      return null;
    }
  }

  async function safelyDispatchAppPush(requestId, input) {
    try {
      return await pushDispatcher.dispatch(input);
    } catch (error) {
      console.error(`[${requestId}] app push dispatch failed`, error);
      return { attempted: 0, sent: 0, deferred: 0, failed: 1, suppressed: 0, results: [] };
    }
  }

  async function deliverAppNotification(rawInput, { caller, requestId, apiClient = null } = {}) {
    const parsed = appNotificationSchema.parse(rawInput);
    const created = await store.createAppNotification({
      caller,
      idempotencyKey: parsed.dedupeKey,
      recipients: parsed.audience.users,
      message: {
        category: parsed.category,
        priority: parsed.priority,
        title: parsed.content.title,
        summary: parsed.content.summary,
        content: parsed.content,
        source: parsed.source,
        actions: parsed.actions,
        expiresAt: parsed.expiresAt,
      },
    });
    const push = created.deduplicated
      ? { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0, results: [] }
      : await safelyDispatchAppPush(requestId, {
        store,
        notification: { id: created.notification.id, category: parsed.category, priority: parsed.priority },
        recipients: parsed.audience.users,
      });
    let wecomDeliveryId = null;
    let wecomStatus = parsed.channels.includes('wecom') ? 'deduplicated' : 'not-requested';
    if (parsed.channels.includes('wecom') && !created.deduplicated) {
      const delivered = await deliver(toWeComMessage(parsed), { caller, requestId, apiClient });
      wecomDeliveryId = delivered.delivery?.id || null;
      wecomStatus = 'sent';
    }
    return {
      notificationId: created.notification.id,
      deduplicated: created.deduplicated,
      channels: { app: created.deduplicated ? 'deduplicated' : 'accepted', wecom: wecomStatus },
      push: {
        attempted: push.attempted,
        sent: push.sent,
        deferred: push.deferred,
        failed: push.failed,
        suppressed: push.suppressed,
      },
      wecomDeliveryId,
    };
  }

  const orchestrator = createNotificationOrchestrator({
    store,
    deliver,
    deliverApp: deliverAppNotification,
    concurrency: config.orchestrationConcurrency,
    leaseMs: config.orchestrationLeaseMs,
  });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.id = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet());
  morgan.token('request-id', (req) => req.id || '-');
  app.use(morgan(process.env.NODE_ENV === 'production'
    ? ':request-id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ':request-id :method :url :status :response-time ms - :res[content-length]'));
  app.use(express.json({
    limit: '64kb',
    verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); },
  }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try {
      const ready = await store.ping();
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
    } catch {
      res.status(503).json({ status: 'not-ready' });
    }
  });
  app.get('/openapi.json', (_req, res) => res.json(buildOpenApiDocument()));

  app.post('/notify', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), checkNotifyAccess,
  requireApiScope('notifications:send', '/notify'),
  enforceClientRateLimit('/notify'),
  enforceManagedTarget('/notify', (body) => body),
  async (req, res, next) => {
    try {
      const appNotificationId = await createLegacyAppNotification(req);
      const { result, delivery } = await deliver(req.body, {
        caller: req.serviceCaller,
        requestId: req.id,
        apiClient: req.apiClient,
      });
      await recordManagedApiRequest(req, { endpoint: '/notify', httpStatus: 200, deliveryId: delivery?.id || null, body: req.body });
      return res.json({ errcode: 0, errmsg: 'ok', detail: result, deliveryId: delivery?.id || null, appNotificationId });
    } catch (error) {
      await recordManagedApiRequest(req, {
        endpoint: '/notify',
        httpStatus: Number(error.status) || 500,
        errorCode: error.code || 'DELIVERY_FAILED',
        body: req.body,
      });
      next(error);
      return undefined;
    }
  });

  app.post('/v1/notifications', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), checkNotifyAccess,
  enforceClientRateLimit('/v1/notifications'),
  async (req, res, next) => {
    try {
      const parsed = appNotificationSchema.parse(req.body);
      if (req.apiClient?.managed && !hasScope(req.apiClient, 'notifications:app:send')) {
        await recordManagedApiRequest(req, { endpoint: '/v1/notifications', httpStatus: 403, errorCode: 'API_SCOPE_REQUIRED', body: req.body });
        return res.status(403).json({ errcode: 403, errmsg: '当前 API Key 缺少 App 通知发送权限', code: 'API_SCOPE_REQUIRED', requestId: req.id });
      }
      const isBroadcast = parsed.audience.users.length > 1 || requiresBroadcastScope(parsed.wecom || {});
      if (req.apiClient?.managed && isBroadcast && !hasScope(req.apiClient, 'notifications:broadcast')) {
        await recordManagedApiRequest(req, { endpoint: '/v1/notifications', httpStatus: 403, errorCode: 'BROADCAST_SCOPE_REQUIRED', body: req.body });
        return res.status(403).json({ errcode: 403, errmsg: '多用户通知需要广播权限', code: 'BROADCAST_SCOPE_REQUIRED', requestId: req.id });
      }
      if (req.apiClient?.managed && parsed.channels.includes('wecom') && !hasScope(req.apiClient, 'notifications:send')) {
        await recordManagedApiRequest(req, { endpoint: '/v1/notifications', httpStatus: 403, errorCode: 'API_SCOPE_REQUIRED', body: req.body });
        return res.status(403).json({ errcode: 403, errmsg: '当前 API Key 缺少企业微信发送权限', code: 'API_SCOPE_REQUIRED', requestId: req.id });
      }
      if (parsed.scheduledAt && parsed.scheduledAt > new Date()) {
        if (req.apiClient?.managed && !hasScope(req.apiClient, 'notifications:enqueue')) {
          await recordManagedApiRequest(req, { endpoint: '/v1/notifications', httpStatus: 403, errorCode: 'API_SCOPE_REQUIRED', body: req.body });
          return res.status(403).json({ errcode: 403, errmsg: '当前 API Key 缺少通知编排权限', code: 'API_SCOPE_REQUIRED', requestId: req.id });
        }
        const queued = await orchestrator.enqueueApp(req.body, {
          caller: req.serviceCaller,
          requestId: req.id,
          apiClient: req.apiClient,
        });
        await recordManagedApiRequest(req, { endpoint: '/v1/notifications', httpStatus: 202, body: req.body });
        return res.status(202).json({
          scheduled: true,
          jobId: queued.job.id,
          scheduledAt: queued.job.scheduledAt,
          deduplicated: queued.deduplicated,
          channels: {
            app: 'scheduled',
            wecom: parsed.channels.includes('wecom') ? 'scheduled' : 'not-requested',
          },
          push: { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0 },
          wecomDeliveryId: null,
          requestId: req.id,
        });
      }
      const outcome = await deliverAppNotification(req.body, {
        caller: req.serviceCaller,
        requestId: req.id,
        apiClient: req.apiClient,
      });
      await recordManagedApiRequest(req, {
        endpoint: '/v1/notifications',
        httpStatus: 202,
        deliveryId: outcome.wecomDeliveryId,
        body: req.body,
      });
      return res.status(202).json({
        ...outcome,
        requestId: req.id,
      });
    } catch (error) {
      await recordManagedApiRequest(req, {
        endpoint: '/v1/notifications',
        httpStatus: Number(error.status) || 500,
        errorCode: error.code || 'APP_NOTIFICATION_FAILED',
        body: req.body,
      });
      next(error);
      return undefined;
    }
  });

  app.get('/app/notifications', checkAppAccess, async (req, res, next) => {
    try {
      const result = await store.listAppNotifications(req.appUserId, {
        cursor: String(req.query.cursor || ''),
        limit: Number.parseInt(req.query.limit, 10) || 20,
        unreadOnly: ['true', '1'].includes(String(req.query.unreadOnly || '').toLowerCase()),
      });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/app/notifications/:id/read', checkAppAccess, async (req, res, next) => {
    try {
      const notification = await store.markAppNotificationRead(req.appUserId, String(req.params.id || ''));
      if (!notification) throw httpError(404, 'APP_NOTIFICATION_NOT_FOUND', '通知不存在。');
      return res.json({ notification });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/app/notifications/:id/snooze', checkAppAccess, async (req, res, next) => {
    try {
      const input = z.object({ snoozedUntil: z.string().datetime({ offset: true }) }).parse(req.body);
      const notification = await store.snoozeAppNotification(
        req.appUserId,
        String(req.params.id || ''),
        new Date(input.snoozedUntil),
      );
      if (!notification) throw httpError(404, 'APP_NOTIFICATION_NOT_FOUND', '通知不存在。');
      return res.json({ notification });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/app/notifications/:id', checkAppAccess, async (req, res, next) => {
    try {
      const result = await store.archiveAppNotification(req.appUserId, String(req.params.id || ''));
      if (!result) throw httpError(404, 'APP_NOTIFICATION_NOT_FOUND', '通知不存在。');
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/app/notifications/read-all', checkAppAccess, async (req, res, next) => {
    try {
      return res.json(await store.markAllAppNotificationsRead(req.appUserId));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/app/notifications/clear-read', checkAppAccess, async (req, res, next) => {
    try {
      return res.json(await store.archiveReadAppNotifications(req.appUserId));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/app/preferences', checkAppAccess, async (req, res, next) => {
    try {
      const preference = await store.getRecipientPreference(req.appUserId);
      return res.json({ preference: preference || appPreferenceSchema.parse({}) });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.put('/app/preferences', checkAppAccess, async (req, res, next) => {
    try {
      const preference = await store.saveRecipientPreference(req.appUserId, appPreferenceSchema.parse(req.body));
      return res.json({ preference });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/app/devices', checkAppAccess, async (req, res, next) => {
    try {
      const device = await store.upsertAppDevice(req.appUserId, appDeviceSchema.parse(req.body));
      return res.status(201).json({ device });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/app/devices/:installationId', checkAppAccess, async (req, res, next) => {
    try {
      const removed = await store.removeAppDevice(req.appUserId, String(req.params.installationId || ''));
      return res.status(removed ? 204 : 404).end();
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/enqueue', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), checkNotifyAccess,
  requireApiScope('notifications:enqueue', '/enqueue'),
  enforceClientRateLimit('/enqueue'),
  enforceManagedTarget('/enqueue', (body) => body.target || {}),
  async (req, res, next) => {
    try {
      const result = await orchestrator.enqueue(req.body, {
        caller: req.serviceCaller,
        requestId: req.id,
        apiClient: req.apiClient,
      });
      const status = result.deduplicated ? 200 : 202;
      await recordManagedApiRequest(req, { endpoint: '/enqueue', httpStatus: status, body: req.body });
      return res.status(status).json(result);
    } catch (error) {
      await recordManagedApiRequest(req, {
        endpoint: '/enqueue',
        httpStatus: Number(error.status) || 500,
        errorCode: error.code || 'ENQUEUE_FAILED',
        body: req.body,
      });
      next(error);
      return undefined;
    }
  });

  app.get('/deliveries/:id', checkNotifyAccess,
  requireApiScope('notifications:status:read', '/deliveries/:id'),
  enforceClientRateLimit('/deliveries/:id'),
  async (req, res, next) => {
    try {
      if (!req.apiClient?.managed) throw httpError(403, 'MANAGED_API_CLIENT_REQUIRED', '发送结果查询仅向托管 API 客户端开放。');
      const delivery = await store.getApiClientDelivery(String(req.params.id || ''), req.apiClient.clientId);
      if (!delivery) throw httpError(404, 'DELIVERY_NOT_FOUND', '发送记录不存在。');
      await recordManagedApiRequest(req, { endpoint: '/deliveries/:id', httpStatus: 200, deliveryId: delivery.id });
      return res.json({ delivery });
    } catch (error) {
      await recordManagedApiRequest(req, {
        endpoint: '/deliveries/:id',
        httpStatus: Number(error.status) || 500,
        errorCode: error.code || 'DELIVERY_LOOKUP_FAILED',
      });
      next(error);
      return undefined;
    }
  });

  app.get('/management/overview', checkManagementAccess, async (_req, res, _next) => {
    try {
      const [history, queue] = await Promise.all([
        store.getOverview(),
        orchestrator.getQueueOverview(),
      ]);
      return res.json({
        configured: true,
        storageHealthy: true,
        retentionDays: config.historyRetentionDays,
        wecom: {
          corpIdConfigured: Boolean(config.wecom.corpId),
          agentId: config.wecom.agentId,
          secretConfigured: Boolean(config.wecom.secret),
        },
        history,
        queue,
      });
    } catch (error) {
      console.error('notification history overview failed', error);
      return res.json({
        configured: true,
        storageHealthy: false,
        retentionDays: config.historyRetentionDays,
        wecom: {
          corpIdConfigured: Boolean(config.wecom.corpId),
          agentId: config.wecom.agentId,
          secretConfigured: Boolean(config.wecom.secret),
        },
        history: null,
      });
    }
  });

  app.get('/management/deliveries', checkManagementAccess, async (req, res, next) => {
    try {
      const status = String(req.query.status || '');
      const msgType = String(req.query.msgType || '');
      if (status && !['pending', 'success', 'failed'].includes(status)) throw httpError(400, 'INVALID_STATUS', '发送状态筛选值无效。');
      if (msgType && !['text', 'markdown', 'textcard', 'news'].includes(msgType)) throw httpError(400, 'INVALID_MESSAGE_TYPE', '消息类型筛选值无效。');
      return res.json(await store.listDeliveries({
        status,
        msgType,
        caller: String(req.query.caller || '').slice(0, 64),
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/api-access', checkManagementAccess, async (req, res, next) => {
    try {
      const [overview, clients, requests] = await Promise.all([
        store.getApiAccessOverview(),
        store.listApiClients(),
        store.listApiRequests({ page: req.query.page, pageSize: req.query.pageSize || 20 }),
      ]);
      return res.json({
        overview,
        clients,
        requests,
        supportedScopes: API_CLIENT_SCOPES,
        apiBasePath: '/api/notify',
        openApiPath: '/api/notify/openapi.json',
        legacyKeyConfigured: Boolean(config.apiKey),
      });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/api-requests', checkManagementAccess, async (req, res, next) => {
    try {
      const outcome = String(req.query.outcome || '');
      if (outcome && !['success', 'failure'].includes(outcome)) throw httpError(400, 'INVALID_API_OUTCOME', 'API 调用结果筛选值无效。');
      return res.json(await store.listApiRequests({
        clientId: String(req.query.clientId || '').slice(0, 64),
        outcome,
        endpoint: String(req.query.endpoint || '').slice(0, 80),
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/api-clients', checkManagementAccess, async (req, res, next) => {
    try {
      const input = apiClientCreateSchema.parse(req.body);
      return res.status(201).json(await store.createApiClient(input));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.put('/management/api-clients/:id', checkManagementAccess, async (req, res, next) => {
    try {
      const id = apiClientIdSchema.parse(req.params.id);
      const input = apiClientUpdateSchema.parse(req.body);
      const clientRow = await store.updateApiClient(id, input);
      if (!clientRow) throw httpError(404, 'API_CLIENT_NOT_FOUND', 'API 应用不存在或已吊销。');
      return res.json({ client: clientRow });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/api-clients/:id/rotate', checkManagementAccess, async (req, res, next) => {
    try {
      const id = apiClientIdSchema.parse(req.params.id);
      const input = apiClientRotateSchema.parse(req.body);
      const result = await store.rotateApiClientKey(id, input);
      if (!result) throw httpError(404, 'API_CLIENT_NOT_FOUND', 'API 应用不存在或已吊销。');
      return res.status(201).json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/api-clients/:id/revoke', checkManagementAccess, async (req, res, next) => {
    try {
      const id = apiClientIdSchema.parse(req.params.id);
      const input = apiClientRevokeSchema.parse(req.body);
      const clientRow = await store.revokeApiClient(id, input);
      if (!clientRow) throw httpError(404, 'API_CLIENT_NOT_FOUND', 'API 应用不存在或已吊销。');
      return res.json({ client: clientRow });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/templates', checkManagementAccess, async (_req, res, next) => {
    try {
      return res.json({ items: await orchestrator.listTemplates() });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.put('/management/templates/:key', checkManagementAccess, async (req, res, next) => {
    try {
      const actor = z.string().trim().min(1).max(128).parse(req.body?.actor);
      const template = await orchestrator.saveTemplate({ ...req.body, key: req.params.key });
      return res.json({ template, actor });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/management/templates/:key', checkManagementAccess, async (req, res, next) => {
    try {
      const deleted = await orchestrator.deleteTemplate(req.params.key);
      if (!deleted) throw httpError(404, 'TEMPLATE_NOT_FOUND', '通知模板不存在。');
      return res.status(204).end();
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/jobs', checkManagementAccess, async (req, res, next) => {
    try {
      const status = String(req.query.status || '');
      if (status && !['scheduled', 'retrying', 'processing', 'sent', 'failed', 'cancelled', 'suppressed'].includes(status)) {
        throw httpError(400, 'INVALID_JOB_STATUS', '通知任务状态筛选值无效。');
      }
      return res.json(await orchestrator.listJobs({
        status,
        caller: String(req.query.caller || '').slice(0, 64),
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/jobs', checkManagementAccess, async (req, res, next) => {
    try {
      const actor = z.string().trim().min(1).max(128).parse(req.body?.actor);
      const result = await orchestrator.enqueue(req.body, { caller: req.serviceCaller, actor, requestId: req.id });
      return res.status(result.deduplicated ? 200 : 202).json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/jobs/:id/cancel', checkManagementAccess, async (req, res, next) => {
    try {
      z.string().trim().min(1).max(128).parse(req.body?.actor);
      const job = await orchestrator.cancelJob(String(req.params.id || ''));
      if (!job) throw httpError(409, 'JOB_NOT_CANCELLABLE', '通知任务不存在或当前状态不可取消。');
      return res.json({ job });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/preferences/:targetId', checkManagementAccess, async (req, res, next) => {
    try {
      return res.json({ preference: await orchestrator.getPreference(req.params.targetId) });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.put('/management/preferences/:targetId', checkManagementAccess, async (req, res, next) => {
    try {
      const actor = z.string().trim().min(1).max(128).parse(req.body?.actor);
      const preference = await orchestrator.savePreference(req.params.targetId, req.body);
      return res.json({ preference, actor });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  const managementSendLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '测试或重试操作过于频繁，请稍后再试。', code: 'MANAGEMENT_SEND_RATE_LIMITED' },
  });

  app.post('/management/test', managementSendLimiter, checkManagementAccess, async (req, res, next) => {
    try {
      const input = testNotificationSchema.parse(req.body);
      const body = {
        msg_type: input.msgType,
        touser: input.touser,
        data: { content: input.content },
        enable_duplicate_check: 1,
        duplicate_check_interval: 60,
      };
      const { delivery } = await deliver(body, { caller: req.serviceCaller, actor: input.actor, requestId: req.id });
      return res.status(201).json({ delivered: true, delivery });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/management/app/overview', checkManagementAccess, async (req, res, next) => {
    try {
      const userId = String(req.query.userId || '').trim().slice(0, 128);
      const limit = Number.parseInt(req.query.limit, 10) || 10;
      return res.json(await store.getAppOverview({ userId, limit }));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/app/test', managementSendLimiter, checkManagementAccess, async (req, res, next) => {
    try {
      const input = appTestNotificationSchema.parse(req.body);
      const registration = await store.getAppOverview({ userId: input.userId, limit: 1 });
      if (registration.devices.total === 0) {
        throw httpError(409, 'APP_DEVICE_NOT_REGISTERED', '该用户尚未注册 Android App 设备，请先登录 App 完成同步。');
      }
      const created = await store.createAppNotification({
        caller: req.serviceCaller,
        idempotencyKey: `management-app-test:${req.id}`,
        recipients: [input.userId],
        message: {
          category: 'system.test',
          priority: input.priority,
          title: input.title,
          summary: input.summary,
          content: {
            kind: 'card',
            title: input.title,
            summary: input.summary,
            blocks: [{ type: 'text', text: input.summary }],
          },
          source: { service: req.serviceCaller, entityType: 'manual-test', entityId: req.id },
          actions: [{ id: 'open-notifications', label: '打开通知中心', deepLink: 'mycontrol://open?destination=notifications' }],
        },
      });
      const push = created.deduplicated
        ? { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0, results: [] }
        : await safelyDispatchAppPush(req.id, {
          store,
          notification: { id: created.notification.id, category: 'system.test', priority: input.priority },
          recipients: [input.userId],
        });
      const recipient = await store.getAppOverview({ userId: input.userId, limit: 5 });
      return res.status(201).json({
        created: !created.deduplicated,
        deduplicated: created.deduplicated,
        notification: {
          id: created.notification.id,
          title: input.title,
          priority: input.priority,
          category: 'system.test',
        },
        recipient: {
          userId: input.userId,
          total: recipient.total,
          unread: recipient.unread,
          devices: recipient.devices,
        },
        push: {
          attempted: push.attempted,
          sent: push.sent,
          deferred: push.deferred,
          failed: push.failed,
          suppressed: push.suppressed,
        },
      });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/management/deliveries/:id/retry', managementSendLimiter, checkManagementAccess, async (req, res, next) => {
    try {
      const actor = z.string().trim().min(1).max(128).parse(req.body?.actor);
      const previous = await store.getRetryDelivery(String(req.params.id || ''));
      if (!previous) throw httpError(404, 'DELIVERY_NOT_FOUND', '发送记录不存在。');
      if (previous.delivery.status !== 'failed' || previous.delivery.retryable !== true) {
        throw httpError(409, 'DELIVERY_NOT_RETRYABLE', '仅允许重试发送给单个用户的失败通知。');
      }
      const { delivery } = await deliver(previous.payload, {
        caller: req.serviceCaller,
        actor,
        requestId: req.id,
        parentDeliveryId: previous.delivery.id,
      });
      return res.status(201).json({ delivered: true, delivery });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.use((error, req, res, _next) => {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errcode: 400, errmsg: '请求参数错误', error: '请求参数错误。', code: 'VALIDATION_ERROR', details: error.issues });
    }
    const status = Number.isFinite(Number(error.status)) ? Number(error.status) : 500;
    if (status === 500) console.error(`[${req.id}]`, error);
    return res.status(status).json({
      errcode: status,
      errmsg: status === 500 ? '服务器内部错误' : error.message,
      error: status === 500 ? '通知服务内部错误。' : error.message,
      code: error.code || (status === 500 ? 'INTERNAL_ERROR' : 'DELIVERY_FAILED'),
      requestId: req.id,
    });
  });

  app.locals.notificationStore = store;
  app.locals.notificationOrchestrator = orchestrator;
  return app;
}

module.exports = { createApp, createReplayGuard, safeEqual, targetMetadata };
