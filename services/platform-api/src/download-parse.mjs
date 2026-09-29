import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DOUYIN_REFERER = 'https://www.douyin.com/';
const TTWID_REGISTER_URL = 'https://ttwid.bytedance.com/ttwid/union/register/';
const DOUYIN_DETAIL_URL = 'https://www.douyin.com/aweme/v1/web/aweme/detail/';
const TTWID_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_URL_CHARS = 2_048;
const MAX_QUALITIES = 8;
const MAX_YTDLP_OUTPUT_BYTES = 8 * 1024 * 1024;
const AWEME_ID_PATTERN = /(?:video|note)\/(\d{6,})/;
const SHARE_URL_PATTERN = /https?:\/\/[^\s"'<>【】（）()]+/i;
const DOUYIN_HOST_PATTERN = /(^|\.)(?:douyin|iesdouyin)\.com$/i;
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 只转发播放直链必需的头：Accept-Encoding 会把响应变成 gzip 流，交给下载器会损坏文件。
const FORWARDED_HEADER_NAMES = new Set(['referer', 'user-agent', 'origin']);

const ttwidCache = { value: '', expiresAt: 0 };

export function readDownloadConfig(env = process.env) {
  const timeout = Number.parseInt(String(env.PLATFORM_DOWNLOAD_TIMEOUT_MS ?? ''), 10);
  return {
    ytdlpPath: String(env.PLATFORM_YTDLP_PATH || 'yt-dlp').trim() || 'yt-dlp',
    timeoutMs: Number.isFinite(timeout) ? Math.min(Math.max(timeout, 5_000), 120_000) : DEFAULT_TIMEOUT_MS,
  };
}

function resolveError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function randomToken(length) {
  let token = '';
  for (let index = 0; index < length; index += 1) {
    token += TOKEN_CHARS[crypto.randomInt(TOKEN_CHARS.length)];
  }
  return token;
}

function pickDirectHeaders(source) {
  const headers = {};
  if (!source || typeof source !== 'object') return headers;
  for (const [name, value] of Object.entries(source)) {
    if (!value || !FORWARDED_HEADER_NAMES.has(name.toLowerCase())) continue;
    headers[name] = String(value);
  }
  return headers;
}

function formatSize(size) {
  const bytes = Number(size) || 0;
  if (bytes <= 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// 竖版视频的 height 是长边，用短边才符合用户对 720P/1080P 的习惯。
function resolutionLabel(width, height) {
  const shortSide = Math.min(Number(width) || 0, Number(height) || 0);
  return shortSide > 0 ? `${shortSide}P` : '原始画质';
}

export function extractShareUrl(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  const matched = text.match(SHARE_URL_PATTERN);
  const candidate = matched ? matched[0] : text;
  const cleaned = candidate.replace(/[,，。；;、]+$/, '');
  if (cleaned.length > MAX_URL_CHARS) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isDouyinUrl(value) {
  try {
    return DOUYIN_HOST_PATTERN.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

async function readTtwid(fetchImpl, signal) {
  if (ttwidCache.value && ttwidCache.expiresAt > Date.now()) return ttwidCache.value;
  const response = await fetchImpl(TTWID_REGISTER_URL, {
    method: 'POST',
    signal,
    headers: {
      'User-Agent': BROWSER_UA,
      'Content-Type': 'application/json',
      Referer: DOUYIN_REFERER,
    },
    body: JSON.stringify({
      region: 'cn',
      aid: 6383,
      needFid: false,
      service: 'www.ixigua.com',
      migrate_info: { ticket: '', source: 'node' },
      cbUrlProtocol: 'https',
      union: true,
    }),
  });
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  try {
    await response.body?.cancel?.();
  } catch {
    // 只需要 Set-Cookie，响应体可以直接丢弃。
  }
  let ttwid = '';
  for (const cookie of cookies) {
    const matched = String(cookie || '').match(/(?:^|;\s*)ttwid=([^;]+)/);
    if (matched) ttwid = matched[1];
  }
  if (!ttwid) {
    throw resolveError(502, '抖音访问凭证获取失败，请稍后再试。', 'DOUYIN_CREDENTIAL_FAILED');
  }
  ttwidCache.value = ttwid;
  ttwidCache.expiresAt = Date.now() + TTWID_TTL_MS;
  return ttwid;
}

async function resolveAwemeId(url, fetchImpl, signal) {
  const direct = new URL(url).pathname.match(AWEME_ID_PATTERN);
  if (direct) return direct[1];
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal,
    headers: { 'User-Agent': BROWSER_UA, Referer: DOUYIN_REFERER },
  });
  const finalUrl = String(response.url || '');
  try {
    await response.body?.cancel?.();
  } catch {
    // 只需要重定向后的地址。
  }
  const redirected = finalUrl.match(AWEME_ID_PATTERN);
  if (redirected) return redirected[1];
  throw resolveError(422, '没有从这个链接里识别到抖音作品，请确认是分享链接。', 'DOUYIN_ID_MISSING');
}

async function fetchAwemeDetail(awemeId, fetchImpl, signal) {
  const ttwid = await readTtwid(fetchImpl, signal);
  const query = new URLSearchParams({
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    pc_client_type: '1',
    version_code: '190500',
    version_name: '19.5.0',
    cookie_enabled: 'true',
    platform: 'PC',
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '131.0.0.0',
    aweme_id: awemeId,
  });
  const response = await fetchImpl(`${DOUYIN_DETAIL_URL}?${query.toString()}`, {
    signal,
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: DOUYIN_REFERER,
      Cookie: `ttwid=${ttwid}; msToken=${randomToken(107)}`,
    },
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const detail = payload?.aweme_detail;
  if (!detail) {
    throw resolveError(502, '抖音没有返回作品信息，可能是私密作品或需要登录。', 'DOUYIN_DETAIL_EMPTY');
  }
  return detail;
}

function buildDouyinQualities(video) {
  const qualities = [];
  const seen = new Set();
  const headers = { 'User-Agent': BROWSER_UA, Referer: DOUYIN_REFERER };
  const push = (address, bitrate) => {
    const url = (address?.url_list || [])[0];
    if (!url || seen.has(url)) return;
    seen.add(url);
    const height = Number(address?.height) || 0;
    const rate = Number(bitrate) || 0;
    const size = Number(address?.data_size) || 0;
    qualities.push({
      label: `${resolutionLabel(address?.width, height)} · ${(rate / 1000).toFixed(0)} kbps`,
      width: Number(address?.width) || 0,
      height,
      size,
      sizeLabel: formatSize(size),
      bitrate: rate,
      url,
      headers,
    });
  };
  const entries = Array.isArray(video?.bit_rate) ? [...video.bit_rate] : [];
  entries.sort((left, right) => (Number(right?.bit_rate) || 0) - (Number(left?.bit_rate) || 0));
  for (const entry of entries) push(entry?.play_addr, entry?.bit_rate);
  if (qualities.length === 0) push(video?.play_addr, 0);
  return qualities.slice(0, MAX_QUALITIES);
}

function buildDouyinResult(detail) {
  const video = detail?.video || {};
  const title = String(detail?.desc || '').trim() || '抖音作品';
  const author = String(detail?.author?.nickname || '').trim();
  const cover = (video?.cover?.url_list || [])[0] || '';
  const headers = { 'User-Agent': BROWSER_UA, Referer: DOUYIN_REFERER };
  const images = Array.isArray(detail?.images) ? detail.images : [];
  if (images.length > 0) {
    return {
      platform: 'douyin',
      kind: 'images',
      title,
      author,
      cover: cover || (images[0]?.url_list || [])[0] || '',
      durationMs: 0,
      expireAt: 0,
      images: images
        .map((item) => ({ url: (item?.url_list || [])[0] || '', headers }))
        .filter((item) => item.url),
      qualities: [],
    };
  }
  const qualities = buildDouyinQualities(video);
  if (qualities.length === 0) {
    throw resolveError(422, '没有解析到可下载的视频地址。', 'DOUYIN_NO_STREAM');
  }
  return {
    platform: 'douyin',
    kind: 'video',
    title,
    author,
    cover,
    durationMs: Number(video?.duration) || 0,
    expireAt: Number(video?.cdn_url_expired) || 0,
    images: [],
    qualities,
  };
}

function runYtDlp(url, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.ytdlpPath,
      ['-J', '--no-warnings', '--no-playlist', '--no-progress', '--ignore-config', url],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler();
    };
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(resolveError(504, '解析超时，请稍后再试。', 'PARSE_TIMEOUT')));
    }, config.timeoutMs);
    timer.unref?.();
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_YTDLP_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(() => reject(resolveError(502, '解析结果过大，已中止。', 'PARSE_OUTPUT_TOO_LARGE')));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });
    child.on('error', (error) => {
      finish(() => {
        if (error?.code === 'ENOENT') {
          reject(resolveError(503, '当前服务器还没有安装 yt-dlp，除抖音外的平台暂不可用。', 'YTDLP_NOT_AVAILABLE'));
          return;
        }
        reject(resolveError(502, '解析服务启动失败，请稍后再试。', 'PARSE_SPAWN_FAILED'));
      });
    });
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(resolveError(422, '这个链接暂时解析不了，请确认视频可以公开访问。', 'PARSE_UPSTREAM_FAILED'));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(resolveError(502, '解析结果无法识别。', 'PARSE_INVALID_OUTPUT'));
        }
      });
    });
  });
}

function buildGenericResult(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const progressive = formats.filter((format) => {
    const protocol = String(format?.protocol || '');
    return /^https?$/i.test(protocol)
      && String(format?.vcodec || 'none') !== 'none'
      && String(format?.acodec || 'none') !== 'none'
      && Boolean(format?.url);
  });
  progressive.sort((left, right) => (Number(right?.height) || 0) - (Number(left?.height) || 0)
    || (Number(right?.tbr) || 0) - (Number(left?.tbr) || 0));
  const seen = new Set();
  const qualities = [];
  const fallbackHeaders = pickDirectHeaders(info?.http_headers);
  for (const format of progressive) {
    const url = String(format.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const height = Number(format?.height) || 0;
    const size = Number(format?.filesize || format?.filesize_approx) || 0;
    const formatHeaders = pickDirectHeaders(format.http_headers);
    qualities.push({
      label: resolutionLabel(format?.width, height),
      width: Number(format?.width) || 0,
      height,
      size,
      sizeLabel: formatSize(size),
      bitrate: Math.round((Number(format?.tbr) || 0) * 1000),
      url,
      headers: Object.keys(formatHeaders).length > 0 ? formatHeaders : fallbackHeaders,
    });
    if (qualities.length >= MAX_QUALITIES) break;
  }
  if (qualities.length === 0) {
    throw resolveError(422, '这个平台的视频是分片流（DASH/HLS），当前只支持有直链的平台。', 'NO_DIRECT_STREAM');
  }
  return {
    platform: String(info?.extractor_key || info?.extractor || '').toLowerCase(),
    kind: 'video',
    title: String(info?.title || '').trim() || '视频',
    author: String(info?.uploader || info?.channel || '').trim(),
    cover: String(info?.thumbnail || ''),
    durationMs: Math.round((Number(info?.duration) || 0) * 1000),
    expireAt: 0,
    images: [],
    qualities,
  };
}

export async function resolveDownloadTarget({ url, config = readDownloadConfig(), fetchImpl = globalThis.fetch } = {}) {
  const shareUrl = extractShareUrl(url);
  if (!shareUrl) {
    throw resolveError(400, '没有识别到有效的视频链接。', 'INVALID_URL');
  }
  if (!isDouyinUrl(shareUrl)) {
    return buildGenericResult(await runYtDlp(shareUrl, config));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  timer.unref?.();
  try {
    const awemeId = await resolveAwemeId(shareUrl, fetchImpl, controller.signal);
    const detail = await fetchAwemeDetail(awemeId, fetchImpl, controller.signal);
    return buildDouyinResult(detail);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw resolveError(504, '解析超时，请稍后再试。', 'PARSE_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
