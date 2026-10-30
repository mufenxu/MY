function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function resolveServiceMode(env = process.env) {
  const external = enabled(env.PLATFORM_EXTERNAL_SERVICES);
  const targets = {
    core: String(env.CORE_SERVICE_URL || '').trim(),
    exam: String(env.EXAM_SERVICE_URL || '').trim(),
    campus: String(env.CAMPUS_SERVICE_URL || '').trim(),
    iot: String(env.MQTT_SERVICE_URL || '').trim(),
    notify: String(env.NOTIFICATION_SERVICE_URL || '').trim(),
  };
  if (!external) {
    targets.core = `http://127.0.0.1:${Number.parseInt(env.CORE_PORT || '3045', 10)}`;
    targets.exam = `http://127.0.0.1:${Number.parseInt(env.EXAM_PORT || env.PORT || '3110', 10)}`;
    targets.campus ||= 'http://campus-service:22101';
    targets.iot ||= 'http://iot-service:22102';
    targets.notify ||= 'http://notification-service:3000';
  }
  if (external) {
    const missing = ['core', 'exam', 'campus', 'iot', 'notify'].filter((service) => !targets[service]);
    if (missing.length > 0) {
      throw new Error(`External platform services missing target URLs: ${missing.join(', ')}`);
    }
  }
  return { external, targets };
}

/**
 * 每个单元的探针路径：**优先新路径，路径不存在时回落旧路径**。
 *
 * 只在 404 时回落（旧服务没有 /readyz），503 必须如实判定为"不就绪"，
 * 否则滚动发布期间会拿旧路径的 200 掩盖新路径的 503。
 */
export const HEALTH_PATHS = {
  core: ['/readyz', '/health'],
  exam: ['/readyz', '/ready'],
  campus: ['/readyz', '/api/ready'],
  iot: ['/readyz', '/api/ready'],
  notify: ['/readyz', '/healthz'],
};

async function probe(target, pathname, { fetchImpl = globalThis.fetch, timeoutMs = 2_000 } = {}) {
  if (!target || typeof fetchImpl !== 'function') return { ok: false, status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(new URL(pathname, `${target.replace(/\/$/, '')}/`), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const healthy = response.ok;
    if (response.body && typeof response.body.cancel === 'function') {
      await response.body.cancel().catch(() => {});
    }
    return { ok: healthy, status: Number(response.status) || 0 };
  } catch (error) {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServiceTarget(target, pathnameOrPaths, options = {}) {
  const paths = Array.isArray(pathnameOrPaths) ? pathnameOrPaths : [pathnameOrPaths];
  for (const pathname of paths) {
    const result = await probe(target, pathname, options);
    if (result.ok) return true;
    // 只有"该路径不存在"才值得继续回落；连接失败 / 503 都直接判定为不可用。
    if (result.status !== 404) return false;
  }
  return false;
}

export async function checkExternalServices(targets, options = {}) {
  const {
    requiredServices = ['core', 'exam'],
    ...checkOptions
  } = options;
  const checks = await Promise.all(requiredServices.map((service) => (
    checkServiceTarget(targets[service], HEALTH_PATHS[service] || '/readyz', checkOptions)
  )));
  return checks.every(Boolean);
}
