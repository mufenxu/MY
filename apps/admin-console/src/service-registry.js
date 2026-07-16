import fs from 'node:fs';

const ALLOWED_CATEGORIES = new Set(['miniapp', 'service', 'automation']);

function validateHttpUrl(value, field, serviceId) {
  if (value === null) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${serviceId}.${field} 必须使用 HTTP 或 HTTPS。`);
  }
  return url.toString().replace(/\/$/, '');
}

function validateAdminUrl(value, serviceId) {
  if (value === null) return null;
  const normalized = String(value || '').trim();
  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }
  return validateHttpUrl(normalized, 'adminUrl', serviceId);
}

function normalizeService(input) {
  if (!input || typeof input !== 'object' || !input.id || !input.name) {
    throw new Error('服务清单中存在缺少 id 或 name 的项目。');
  }
  if (!ALLOWED_CATEGORIES.has(input.category)) {
    throw new Error(`${input.id}.category 无效。`);
  }

  const baseUrl = validateHttpUrl(input.baseUrl, 'baseUrl', input.id);
  const adminUrl = validateAdminUrl(input.adminUrl, input.id);
  const healthPath = input.healthPath ? String(input.healthPath) : null;
  if (healthPath && (!healthPath.startsWith('/') || !baseUrl)) {
    throw new Error(`${input.id}.healthPath 必须以 / 开头且需要 baseUrl。`);
  }

  return Object.freeze({
    id: String(input.id),
    name: String(input.name),
    shortName: String(input.shortName || input.name),
    category: input.category,
    description: String(input.description || ''),
    baseUrl,
    healthPath,
    adminUrl,
    repositoryPath: String(input.repositoryPath || ''),
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String) : [],
  });
}

export function loadServiceRegistry(registryPath) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(raw);
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.services)) {
    throw new Error('platform.config.json 格式不受支持。');
  }

  const services = registry.services.map(normalizeService);
  const ids = new Set();
  for (const service of services) {
    if (ids.has(service.id)) throw new Error(`服务 id 重复：${service.id}`);
    ids.add(service.id);
  }

  return Object.freeze({
    schemaVersion: registry.schemaVersion,
    platformName: String(registry.platformName || 'MY 管理中心'),
    services,
  });
}

export async function checkService(service, { timeoutMs = 8000, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const startedAt = now();
  const checkedAt = new Date(startedAt).toISOString();
  if (!service.baseUrl || !service.healthPath) {
    return { id: service.id, state: 'unmonitored', httpStatus: null, latencyMs: null, checkedAt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${service.baseUrl}${service.healthPath}`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain;q=0.8, text/html;q=0.5',
        'User-Agent': 'MY-Platform-Monitor/0.1',
      },
    });
    return {
      id: service.id,
      state: response.ok ? 'healthy' : 'degraded',
      httpStatus: response.status,
      latencyMs: Math.max(0, now() - startedAt),
      checkedAt,
    };
  } catch (error) {
    return {
      id: service.id,
      state: 'offline',
      httpStatus: null,
      latencyMs: Math.max(0, now() - startedAt),
      checkedAt,
      reason: error?.name === 'AbortError' ? 'timeout' : 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createStatusMonitor(services, options = {}) {
  let cached = null;
  let cacheTime = 0;
  let pending = null;
  const cacheTtlMs = options.cacheTtlMs ?? 15000;

  async function refresh(force = false) {
    if (!force && cached && Date.now() - cacheTime < cacheTtlMs) return cached;
    if (pending) return pending;

    pending = Promise.all(services.map((service) => checkService(service, options)))
      .then((statuses) => {
        const byId = new Map(statuses.map((status) => [status.id, status]));
        cached = services.map((service) => ({ ...service, ...byId.get(service.id) }));
        cacheTime = Date.now();
        return cached;
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  }

  return { refresh };
}
