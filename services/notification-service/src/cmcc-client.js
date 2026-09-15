const DEFAULT_WS_URL = 'wss://5gvas01.cmicmaap.com/gtw-ai/openclaw/ws/msg';
const PROTOCOL_VERSION = '2.0';
const AUTH_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;
const OPEN_STATE = 1;

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
  constructor({ apiKey, wsUrl = DEFAULT_WS_URL, logger = console, webSocketImpl = globalThis.WebSocket } = {}) {
    this.apiKey = String(apiKey || '').trim();
    this.wsUrl = String(wsUrl || DEFAULT_WS_URL).trim();
    this.logger = logger;
    this.webSocketImpl = webSocketImpl;
    this.socket = null;
    this.connected = false;
    this.closed = false;
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
    if (this.closed) throw createCmccError('中国移动新消息通道已关闭。', 'CMCC_CLIENT_CLOSED');
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN_STATE) {
      throw createCmccError('中国移动新消息网关未连接。', 'CMCC_NOT_CONNECTED');
    }
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    socket.send(JSON.stringify({ type: 'send', apiKey: this.apiKey, to, content, messageId }));
    return messageId;
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
      this.settleAuth(createCmccError('中国移动新消息网关认证超时。', 'CMCC_AUTH_TIMEOUT'));
      this.destroySocket();
    }, AUTH_TIMEOUT_MS);
    this.authTimer.unref?.();

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', apiKey: this.apiKey, version: PROTOCOL_VERSION }));
    });
    socket.addEventListener('message', (event) => this.handleFrame(event?.data));
    socket.addEventListener('error', () => {
      this.settleAuth(createCmccError('中国移动新消息网关连接异常。', 'CMCC_CONNECT_FAILED'));
    });
    socket.addEventListener('close', () => {
      this.connected = false;
      this.stopHeartbeat();
      this.settleAuth(createCmccError('中国移动新消息网关连接已关闭。', 'CMCC_CONNECT_CLOSED'));
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
        clearTimeout(this.authTimer);
        this.authTimer = null;
        this.startHeartbeat();
        this.settleAuth(null);
        return;
      case 'auth_failed':
        clearTimeout(this.authTimer);
        this.authTimer = null;
        this.settleAuth(createCmccError(`中国移动新消息网关认证失败：${message.message || '未知原因'}`, 'CMCC_AUTH_FAILED'));
        this.destroySocket();
        return;
      case 'pong':
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case 'error':
        this.logger.error(`[cmcc] 网关返回错误：${message.message || '未知错误'}`);
        return;
      default:
        return;
    }
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
