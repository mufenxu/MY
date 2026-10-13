const { contentToText } = require('./app-notification-schema');

const DEFAULT_API_BASE = 'https://wxpusher.zjiecode.com';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 2000;
const MAX_SUMMARY_LENGTH = 100;
const MAX_URL_LENGTH = 1000;

function createWxPusherError(message, code, status = 502) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

// 只有自家 App 的深链才能拉起客户端；http(s) 链接会被 WxPusher 自己的浏览器打开。
function pickAppDeepLink(actions) {
  const links = (Array.isArray(actions) ? actions : [])
    .map((action) => String(action?.deepLink || '').trim())
    .filter((link) => link.startsWith('mycontrol://'));
  return (links[0] || '').slice(0, MAX_URL_LENGTH);
}

/**
 * WxPusher 推送客户端（自用：只投递给配置里写死的 UID 列表）。
 *
 * 接口返回 code 1000 只代表「已受理发送任务」，没有可靠的送达回执，
 * 不能当成消息已经到手机的证据。
 */
function createWxPusherClient({
  appToken = '',
  uids = [],
  apiBase = DEFAULT_API_BASE,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
  logger = console,
} = {}) {
  const token = String(appToken || '').trim();
  const targets = [...new Set((Array.isArray(uids) ? uids : []).map((uid) => String(uid || '').trim()).filter(Boolean))];
  const base = String(apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  const enabled = Boolean(token) && targets.length > 0;

  async function send({ title = '', summary = '', content = null, actions = [] } = {}) {
    if (!enabled) throw createWxPusherError('WxPusher 通道未配置', 'WXPUSHER_NOT_CONFIGURED', 503);
    if (typeof fetchImpl !== 'function') throw createWxPusherError('当前运行环境没有可用的 fetch', 'WXPUSHER_FETCH_UNAVAILABLE', 500);

    const text = (content ? contentToText(content, MAX_CONTENT_LENGTH) : String(title || '')).trim();
    if (!text) throw createWxPusherError('WxPusher 消息内容为空', 'WXPUSHER_EMPTY_CONTENT', 500);

    const payload = {
      appToken: token,
      content: text,
      contentType: 1,
      uids: targets,
    };
    const summaryText = String(summary || '').trim().slice(0, MAX_SUMMARY_LENGTH);
    if (summaryText) payload.summary = summaryText;
    const url = pickAppDeepLink(actions);
    if (url) payload.url = url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${base}/api/send/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      throw createWxPusherError(`WxPusher 请求失败：${error?.message || error}`, 'WXPUSHER_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!response.ok || parsed?.success !== true || Number(parsed?.code) !== 1000) {
      const detail = String(parsed?.msg || raw || `HTTP ${response.status}`).slice(0, 160);
      throw createWxPusherError(`WxPusher 发送失败：${detail}`, 'WXPUSHER_SEND_FAILED');
    }

    const records = Array.isArray(parsed?.data) ? parsed.data : [];
    const accepted = records.filter((item) => Number(item?.code) === 1000);
    if (accepted.length === 0) throw createWxPusherError('WxPusher 未受理任何目标', 'WXPUSHER_TARGET_REJECTED');

    logger?.info?.(`[wxpusher] 已受理 ${accepted.length}/${records.length} 个目标`);
    return {
      accepted: accepted.length,
      rejected: records.length - accepted.length,
      sendRecordIds: accepted.map((item) => item.sendRecordId).filter(Boolean),
      messageContentId: records[0]?.messageContentId ?? null,
    };
  }

  return { enabled, targets, send };
}

module.exports = { createWxPusherClient };
