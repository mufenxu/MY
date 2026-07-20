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
  if (external) {
    const missing = ['core', 'exam', 'campus', 'iot', 'notify'].filter((service) => !targets[service]);
    if (missing.length > 0) {
      throw new Error(`External platform services missing target URLs: ${missing.join(', ')}`);
    }
  }
  return { external, targets };
}

export async function checkServiceTarget(
  target,
  pathname,
  { fetchImpl = globalThis.fetch, timeoutMs = 2_000 } = {},
) {
  if (!target || typeof fetchImpl !== 'function') return false;
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
    return healthy;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkExternalServices(targets, options = {}) {
  const {
    requiredServices = ['core', 'exam'],
    ...checkOptions
  } = options;
  const healthPaths = {
    core: '/health',
    exam: '/ready',
    campus: '/api/ready',
    iot: '/api/ready',
    notify: '/healthz',
  };
  const checks = await Promise.all(requiredServices.map((service) => (
    checkServiceTarget(targets[service], healthPaths[service], checkOptions)
  )));
  return checks.every(Boolean);
}
