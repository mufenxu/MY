import { issueServiceRequest } from '@my-platform/platform-auth';

export class NotificationManagementError extends Error {
  constructor(message, { status = 502, code = 'NOTIFICATION_MANAGEMENT_FAILED', details = null } = {}) {
    super(message);
    this.name = 'NotificationManagementError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, minimum), maximum);
}

function validateTestInput(input = {}) {
  const msgType = String(input.msgType || 'text');
  const touser = String(input.touser || '').trim();
  const content = String(input.content || '').trim();
  const maximum = msgType === 'markdown' ? 4096 : 2048;
  if (!['text', 'markdown'].includes(msgType)) {
    throw new NotificationManagementError('测试消息类型无效。', { status: 400, code: 'INVALID_MESSAGE_TYPE' });
  }
  if (!touser || touser === '@all' || touser.includes('|') || touser.length > 64) {
    throw new NotificationManagementError('测试通知必须指定一个明确的企业微信用户。', { status: 400, code: 'INVALID_TEST_RECIPIENT' });
  }
  if (!content || content.length > maximum) {
    throw new NotificationManagementError(`消息内容必须为 1 至 ${maximum} 个字符。`, { status: 400, code: 'INVALID_TEST_CONTENT' });
  }
  return { msgType, touser, content };
}

export function createNotificationManagementClient({
  serviceUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 10_000,
} = {}) {
  const configured = Boolean(serviceUrl && apiKey);

  async function request(pathname, { method = 'GET', body = null } = {}) {
    if (!configured) {
      throw new NotificationManagementError('通知服务管理连接尚未配置。', { status: 503, code: 'NOTIFICATION_NOT_CONFIGURED' });
    }
    const url = new URL(pathname, serviceUrl);
    const signedPath = `${url.pathname}${url.search}`;
    const serialized = body === null ? '' : JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(serialized ? { 'Content-Type': 'application/json' } : {}),
          ...issueServiceRequest({
            caller: 'admin-console',
            secret: apiKey,
            method,
            pathname: signedPath,
            body: serialized,
          }),
        },
        ...(serialized ? { body: serialized } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new NotificationManagementError(data.error || data.errmsg || `通知服务返回 HTTP ${response.status}`, {
          status: response.status,
          code: data.code || 'NOTIFICATION_UPSTREAM_ERROR',
          details: data.details || null,
        });
      }
      return data;
    } catch (error) {
      if (error instanceof NotificationManagementError) throw error;
      throw new NotificationManagementError(error?.name === 'AbortError' ? '通知服务请求超时。' : '无法连接通知服务。', {
        status: 502,
        code: error?.name === 'AbortError' ? 'NOTIFICATION_TIMEOUT' : 'NOTIFICATION_UNREACHABLE',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured,
    async getOverview() {
      if (!configured) return { configured: false, storageHealthy: null, retentionDays: null, wecom: {}, history: null };
      return request('/management/overview');
    },
    async listDeliveries(filters = {}) {
      if (!configured) return { items: [], page: 1, pageSize: 20, total: 0 };
      const query = new URLSearchParams();
      for (const key of ['status', 'caller', 'msgType']) {
        if (filters[key]) query.set(key, String(filters[key]));
      }
      query.set('page', String(boundedInteger(filters.page, 1, 1, 100000)));
      query.set('pageSize', String(boundedInteger(filters.pageSize, 20, 1, 100)));
      return request(`/management/deliveries?${query}`);
    },
    async sendTest(input, actor) {
      return request('/management/test', { method: 'POST', body: { ...validateTestInput(input), actor: String(actor || '').slice(0, 128) } });
    },
    async retryDelivery(id, actor) {
      const deliveryId = String(id || '').trim();
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(deliveryId)) {
        throw new NotificationManagementError('发送记录标识无效。', { status: 400, code: 'INVALID_DELIVERY_ID' });
      }
      return request(`/management/deliveries/${encodeURIComponent(deliveryId)}/retry`, {
        method: 'POST',
        body: { actor: String(actor || '').slice(0, 128) },
      });
    },
  };
}

export { validateTestInput };
