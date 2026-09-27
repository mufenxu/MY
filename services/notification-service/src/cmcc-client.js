const DEFAULT_WS_URL = 'wss://5gvas01.cmicmaap.com/gtw-ai/openclaw/ws/msg';
const PROTOCOL_VERSION = '2.0';
const AUTH_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;
const OPEN_STATE = 1;
const DEFAULT_UPLOAD_URL = 'https://5gvas01.cmicmaap.com/gtw-ai/openclaw/api';
const MEDIA_TYPES = ['IMAGE', 'TEXT', 'AUDIO', 'VIDEO', 'FILE'];
const UPLOAD_TIMEOUT_MS = 60000;

function normalizeText(value, maxLength = 2048) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeMediaType(value) {
  const type = String(value || '').toUpperCase();
  return MEDIA_TYPES.includes(type) ? type : '';
}

// 网关的 timestamp 可能是毫秒或秒级 Unix 时间，统一转换为 ISO 字符串。
function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  const date = new Date(numeric > 1e11 ? numeric : numeric * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function createCmccError(message, code) {
  const error = new Error(message);
  error.status = 502;
  error.code = code;
  return error;
}

/**
 * 中国移动新消息（5G 消息）网关客户端。
 *
 * 该网关只有 WebSocket 长连接，没有 HTTP 发送接口，也不回投递回执：
 * 帧写出成功只代表「已提交到网关」，不能视为「已送达手机」。
 */
class CmccClient {
  constructor({
    apiKey,
    wsUrl = DEFAULT_WS_URL,
    uploadUrl = DEFAULT_UPLOAD_URL,
    defaultTo = '',
    logger = console,
    webSocketImpl = globalThis.WebSocket,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = String(apiKey || '').trim();
    this.wsUrl = String(wsUrl || DEFAULT_WS_URL).trim();
    this.uploadUrl = String(uploadUrl || DEFAULT_UPLOAD_URL).trim().replace(/\/+$/, '');
    this.defaultTo = String(defaultTo || '').trim();
    this.logger = logger;
    this.webSocketImpl = webSocketImpl;
    this.fetchImpl = fetchImpl;
    this.socket = null;
    this.connected = false;
    this.closed = false;
    this.lastError = null;
    this.lastConnectedAt = null;
    this.lastInboundAt = null;
    // 网关的富媒体帧没有 to 字段，只能回复最近一次上行会话，因此记录会话发送方。
    this.sessionSender = '';
    this.inboundHandlers = new Set();
    this.stats = { sent: 0, failed: 0, reconnects: 0, mediaSent: 0, received: 0 };
    this.connectPromise = null;
    this.authWaiter = null;
    this.authTimer = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  isReady() {
    return this.connected && this.socket?.readyState === OPEN_STATE;
  }

  getStatus() {
    return {
      configured: Boolean(this.apiKey),
      wsUrl: this.wsUrl,
      uploadUrl: this.uploadUrl,
      connected: this.connected,
      ready: this.isReady(),
      sessionSender: this.sessionSender,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt,
      lastInboundAt: this.lastInboundAt,
      lastError: this.lastError ? { ...this.lastError } : null,
      stats: { ...this.stats },
    };
  }

  /** 注册上行消息监听，返回取消注册函数。 */
  onInbound(handler) {
    if (typeof handler !== 'function') return () => {};
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  getSessionSender() {
    return this.sessionSender;
  }

  /** 文本帧支持显示 to；未指定时优先回复最近一次上行会话，再回退到固定接收号码。 */
  resolveTarget(to) {
    return String(to || this.sessionSender || this.defaultTo || '').trim();
  }

  recordError(error) {
    if (!error) return;
    this.lastError = {
      code: error.code || 'CMCC_UNKNOWN_ERROR',
      message: String(error.message || ''),
      at: new Date().toISOString(),
    };
  }

  async connect() {
    if (this.isReady()) return undefined;
    if (this.connectPromise) return this.connectPromise;
    this.closed = false;
    const promise = new Promise((resolve, reject) => {
      this.authWaiter = { resolve, reject };
      this.openSocket();
    });
    promise.catch(() => {});
    this.connectPromise = promise.finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async send({ to, content }) {
    try {
      if (this.closed) throw createCmccError('中国移动新消息通道已关闭。', 'CMCC_CLIENT_CLOSED');
      const target = this.resolveTarget(to);
      if (!target) throw createCmccError('缺少新消息接收号码，且当前没有可回复的上行会话。', 'CMCC_TARGET_REQUIRED');
      await this.connect();
      const socket = this.socket;
      if (!socket || socket.readyState !== OPEN_STATE) {
        throw createCmccError('中国移动新消息网关未连接。', 'CMCC_NOT_CONNECTED');
      }
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      socket.send(JSON.stringify({ type: 'send', apiKey: this.apiKey, to: target, content, messageId }));
      this.stats.sent += 1;
      return messageId;
    } catch (error) {
      this.stats.failed += 1;
      this.recordError(error);
      throw error;
    }
  }

  /**
   * 发送富媒体消息。网关的富媒体帧没有 to 字段，只会投递给最近一次上行会话，
   * 这里保持与官方插件一致的帧结构，不做额外改写。
   */
  async sendRichMedia({
    mediaType,
    content = '',
    mediaUrl,
    thumbnailUrl = '',
    mediaFileName = '',
    mediaSize = 0,
    mediaMimeType = '',
  } = {}) {
    try {
      if (this.closed) throw createCmccError('中国移动新消息通道已关闭。', 'CMCC_CLIENT_CLOSED');
      const type = normalizeMediaType(mediaType);
      if (!type) throw createCmccError('富媒体类型无效，仅支持 IMAGE、TEXT、AUDIO、VIDEO、FILE。', 'CMCC_MEDIA_TYPE_INVALID');
      if (!String(mediaUrl || '').trim()) throw createCmccError('富媒体消息缺少可访问的 mediaUrl。', 'CMCC_MEDIA_URL_REQUIRED');
      await this.connect();
      const socket = this.socket;
      if (!socket || socket.readyState !== OPEN_STATE) {
        throw createCmccError('中国移动新消息网关未连接。', 'CMCC_NOT_CONNECTED');
      }
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const payload = { type: 'send', apiKey: this.apiKey, mediaType: type, content, mediaUrl, messageId };
      if (thumbnailUrl) payload.thumbnailUrl = thumbnailUrl;
      if (mediaFileName) payload.mediaFileName = mediaFileName;
      if (Number(mediaSize) > 0) payload.mediaSize = Number(mediaSize);
      if (mediaMimeType) payload.mediaMimeType = mediaMimeType;
      socket.send(JSON.stringify(payload));
      this.stats.sent += 1;
      this.stats.mediaSent += 1;
      return messageId;
    } catch (error) {
      this.stats.failed += 1;
      this.recordError(error);
      throw error;
    }
  }

  /** 上传富媒体文件到网关，返回可用于发送的 mediaUrl。 */
  async uploadMedia({ data, fileName = `cmcc_${Date.now()}`, mimeType = 'application/octet-stream' } = {}) {
    if (!this.apiKey) throw createCmccError('未配置 CMCC_API_KEY，无法上传富媒体文件。', 'CMCC_UPLOAD_UNAVAILABLE');
    if (typeof this.fetchImpl !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
      throw createCmccError('当前 Node 运行时不支持上传富媒体文件。', 'CMCC_UPLOAD_UNAVAILABLE');
    }
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    if (!bytes.length) throw createCmccError('待上传的富媒体文件为空。', 'CMCC_UPLOAD_EMPTY');
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mimeType }), fileName);
    form.append('apiKey', this.apiKey);
    let response;
    try {
      response = await this.fetchImpl(`${this.uploadUrl}/upload`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      const failure = createCmccError(`上传富媒体文件失败：${error.message}`, 'CMCC_UPLOAD_FAILED');
      this.recordError(failure);
      throw failure;
    }
    const payload = await response.json().catch(() => null);
    const mediaUrl = typeof payload?.data === 'string' ? payload.data.trim() : '';
    if (!response.ok || Number(payload?.code) !== 10200 || !mediaUrl) {
      const failure = createCmccError(`上传富媒体文件失败：${payload?.message || `HTTP ${response.status}`}`, 'CMCC_UPLOAD_FAILED');
      this.recordError(failure);
      throw failure;
    }
    return mediaUrl;
  }

  close() {
    this.closed = true;
    this.connected = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.settleAuth(createCmccError('中国移动新消息通道已关闭。', 'CMCC_CLIENT_CLOSED'));
    this.destroySocket();
  }

  openSocket() {
    if (typeof this.webSocketImpl !== 'function') {
      this.failAndRetry(createCmccError('当前 Node 运行时不支持 WebSocket，无法使用中国移动新消息通道。', 'CMCC_WEBSOCKET_UNAVAILABLE'));
      return;
    }
    let socket;
    try {
      socket = new this.webSocketImpl(this.wsUrl, { headers: { 'X-API-Key': this.apiKey } });
    } catch (error) {
      this.failAndRetry(createCmccError(`连接中国移动新消息网关失败：${error.message}`, 'CMCC_CONNECT_FAILED'));
      return;
    }
    this.socket = socket;
    this.authTimer = setTimeout(() => {
      const timeoutError = createCmccError('中国移动新消息网关认证超时。', 'CMCC_AUTH_TIMEOUT');
      this.recordError(timeoutError);
      this.settleAuth(timeoutError);
      this.destroySocket();
    }, AUTH_TIMEOUT_MS);
    this.authTimer.unref?.();

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', apiKey: this.apiKey, version: PROTOCOL_VERSION }));
    });
    socket.addEventListener('message', (event) => this.handleFrame(event?.data));
    socket.addEventListener('error', () => {
      const failure = createCmccError('中国移动新消息网关连接异常。', 'CMCC_CONNECT_FAILED');
      this.recordError(failure);
      this.settleAuth(failure);
    });
    socket.addEventListener('close', () => {
      this.connected = false;
      this.stopHeartbeat();
      const closed = createCmccError('中国移动新消息网关连接已关闭。', 'CMCC_CONNECT_CLOSED');
      this.recordError(closed);
      this.settleAuth(closed);
      if (!this.closed) this.scheduleReconnect();
    });
  }

  handleFrame(raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    switch (message.type) {
      case 'auth_ok':
        this.connected = true;
        this.reconnectAttempts = 0;
        this.lastConnectedAt = new Date().toISOString();
        this.lastError = null;
        clearTimeout(this.authTimer);
        this.authTimer = null;
        this.startHeartbeat();
        this.settleAuth(null);
        return;
      case 'auth_failed':
        clearTimeout(this.authTimer);
        this.authTimer = null;
        {
          const failure = createCmccError(`中国移动新消息网关认证失败：${message.message || '未知原因'}`, 'CMCC_AUTH_FAILED');
          this.recordError(failure);
          this.settleAuth(failure);
        }
        this.destroySocket();
        return;
      case 'pong':
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case 'connected':
        this.logger.info?.('[cmcc] 网关已确认连接。');
        return;
      case 'message':
      case 'text_message':
      case 'media_message':
        this.handleInbound(message);
        return;
      case 'error':
        this.recordError(createCmccError(`网关返回错误：${message.message || '未知错误'}`, 'CMCC_GATEWAY_ERROR'));
        this.logger.error(`[cmcc] 网关返回错误：${message.message || '未知错误'}`);
        return;
      default:
        return;
    }
  }

  handleInbound(frame) {
    const inbound = {
      id: normalizeText(frame.messageId || frame.id, 128) || `in_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      from: normalizeText(frame.from || frame.phone, 32),
      content: normalizeText(frame.content, 4096),
      mediaType: normalizeMediaType(frame.mediaType),
      mediaUrl: normalizeText(frame.mediaUrl, 2048),
      thumbnailUrl: normalizeText(frame.thumbnailUrl, 2048),
      mediaFileName: normalizeText(frame.mediaFileName, 256),
      mediaMimeType: normalizeText(frame.mediaMimeType, 128),
      mediaSize: Number.isFinite(Number(frame.mediaSize)) ? Number(frame.mediaSize) : null,
      receivedAt: normalizeTimestamp(frame.timestamp),
    };
    if (inbound.from) this.sessionSender = inbound.from;
    this.lastInboundAt = inbound.receivedAt;
    this.stats.received += 1;
    for (const handler of this.inboundHandlers) {
      try {
        const result = handler(inbound);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => this.logger.error(`[cmcc] 上行消息处理失败：${error.message}`));
        }
      } catch (error) {
        this.logger.error(`[cmcc] 上行消息处理失败：${error.message}`);
      }
    }
    return inbound;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isReady()) return;
      this.socket.send(JSON.stringify({ type: 'ping' }));
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.logger.error('[cmcc] 心跳超时，重新连接中国移动新消息网关。');
        this.destroySocket();
      }, HEARTBEAT_TIMEOUT_MS);
      this.pongTimer.unref?.();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  destroySocket() {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.stopHeartbeat();
    try {
      socket?.close();
    } catch {
      // 关闭阶段的异常不影响通道状态。
    }
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.stats.reconnects += 1;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** (this.reconnectAttempts - 1)), RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.logger.error(`[cmcc] 重连中国移动新消息网关失败：${error.message}`);
      });
    }, delay + Math.floor(Math.random() * 1000));
    this.reconnectTimer.unref?.();
  }

  failAndRetry(error) {
    this.recordError(error);
    this.settleAuth(error);
    if (!this.closed) this.scheduleReconnect();
  }

  settleAuth(error) {
    const waiter = this.authWaiter;
    if (!waiter) return;
    this.authWaiter = null;
    if (error) waiter.reject(error);
    else waiter.resolve();
  }
}

module.exports = { CmccClient, DEFAULT_WS_URL, createCmccError };
