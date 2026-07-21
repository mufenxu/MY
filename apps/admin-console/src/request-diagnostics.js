import crypto from 'node:crypto';

const PUBLIC_HEALTH_PATHS = Object.freeze({
  core: '/api/core/health',
  exam: '/api/exam/version',
  campus: '/api/campus/api/ready',
  mqtt: '/api/iot/api/ready',
  notify: '/api/notify/readyz',
});

function safeHeader(response, name) {
  return typeof response?.headers?.get === 'function' ? response.headers.get(name) : null;
}

async function probe(url, { fetchImpl, timeoutMs, requestId, now }) {
  const startedAt = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain;q=0.8',
        'User-Agent': 'MY-Platform-Diagnostics/1.0',
        'X-Request-Id': requestId,
        'X-Diagnostic-Probe': '1',
      },
    });
    return {
      state: response.ok ? 'passed' : 'failed',
      httpStatus: response.status,
      latencyMs: Math.max(0, now() - startedAt),
      requestId: safeHeader(response, 'x-request-id'),
      location: safeHeader(response, 'location'),
      error: response.ok ? null : 'http_error',
    };
  } catch (error) {
    return {
      state: 'failed',
      httpStatus: null,
      latencyMs: Math.max(0, now() - startedAt),
      requestId: null,
      location: null,
      error: error?.name === 'AbortError' ? 'timeout' : 'unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

function diagnosisFor(publicProbe, directProbe) {
  if (!publicProbe) return directProbe.state === 'passed' ? 'service_reachable' : 'service_unavailable';
  if (publicProbe.state === 'passed' && directProbe.state === 'passed') return 'end_to_end_healthy';
  if (publicProbe.state === 'failed' && directProbe.state === 'passed') return 'gateway_or_public_route_failure';
  if (publicProbe.state === 'passed' && directProbe.state === 'failed') return 'monitor_route_mismatch';
  return 'service_or_dependency_failure';
}

export function createRequestDiagnostics({
  services,
  publicOrigin = '',
  fetchImpl = fetch,
  timeoutMs = 8000,
  now = () => Date.now(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const monitored = services.filter((service) => service.baseUrl && service.healthPath);

  async function run({ serviceId, parentRequestId = '' } = {}) {
    const selected = serviceId
      ? monitored.filter((service) => service.id === serviceId)
      : monitored;
    if (serviceId && selected.length === 0) {
      const error = new Error('Unknown or unmonitored service.');
      error.status = 400;
      error.code = 'INVALID_DIAGNOSTIC_SERVICE';
      throw error;
    }
    const startedAt = new Date(now()).toISOString();
    const traces = await Promise.all(selected.map(async (service) => {
      const requestId = `diag-${idFactory()}`;
      const directUrl = `${service.baseUrl}${service.healthPath}`;
      const publicPath = PUBLIC_HEALTH_PATHS[service.id];
      const publicUrl = publicOrigin && publicPath ? new URL(publicPath, publicOrigin).toString() : null;
      const [publicResult, directResult] = await Promise.all([
        publicUrl ? probe(publicUrl, { fetchImpl, timeoutMs, requestId, now }) : null,
        probe(directUrl, { fetchImpl, timeoutMs, requestId, now }),
      ]);
      return {
        serviceId: service.id,
        serviceName: service.shortName || service.name,
        requestId,
        diagnosis: diagnosisFor(publicResult, directResult),
        stages: [
          {
            id: 'console',
            label: 'Management console',
            state: 'passed',
            requestId: parentRequestId || null,
            httpStatus: null,
            latencyMs: 0,
            error: null,
          },
          ...(publicResult ? [{ id: 'public_gateway', label: 'Public gateway route', ...publicResult }] : []),
          { id: 'service_direct', label: 'Internal service readiness', ...directResult },
        ],
      };
    }));
    return {
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      traces,
      summary: {
        total: traces.length,
        healthy: traces.filter((trace) => trace.diagnosis === 'end_to_end_healthy' || trace.diagnosis === 'service_reachable').length,
        attention: traces.filter((trace) => !['end_to_end_healthy', 'service_reachable'].includes(trace.diagnosis)).length,
      },
    };
  }

  return { run };
}

export { PUBLIC_HEALTH_PATHS, diagnosisFor };
