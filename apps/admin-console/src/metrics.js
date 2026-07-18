import client from 'prom-client';

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'my_platform_' });
  const requests = new client.Counter({
    name: 'my_platform_http_requests_total',
    help: 'HTTP requests handled by the platform portal.',
    labelNames: ['method', 'status'],
    registers: [registry],
  });
  const duration = new client.Histogram({
    name: 'my_platform_http_request_duration_seconds',
    help: 'HTTP request duration for the platform portal.',
    labelNames: ['method', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });
  const proxyRequests = new client.Counter({
    name: 'my_platform_proxy_requests_total',
    help: 'Requests proxied by the platform gateway.',
    labelNames: ['service', 'outcome', 'status_class', 'error_kind'],
    registers: [registry],
  });
  const proxyDuration = new client.Histogram({
    name: 'my_platform_proxy_request_duration_seconds',
    help: 'Duration of requests proxied by the platform gateway.',
    labelNames: ['service', 'outcome'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
    registers: [registry],
  });

  return {
    middleware(req, res, next) {
      const startedAt = process.hrtime.bigint();
      res.once('finish', () => {
        const labels = { method: req.method, status: String(res.statusCode) };
        requests.inc(labels);
        duration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
      });
      next();
    },
    recordProxy({ service, outcome, statusClass, errorKind, durationMs }) {
      const labels = {
        service: ['core', 'exam', 'notify', 'campus', 'iot'].includes(service) ? service : 'other',
        outcome: outcome === 'error' ? 'error' : 'success',
        status_class: /^[1-5]xx$/.test(statusClass) ? statusClass : 'unknown',
        error_kind: ['none', 'timeout', 'connect', 'aborted', 'upstream', 'other'].includes(errorKind)
          ? errorKind
          : 'other',
      };
      proxyRequests.inc(labels);
      proxyDuration.observe(
        { service: labels.service, outcome: labels.outcome },
        Math.max(Number(durationMs) || 0, 0) / 1_000,
      );
    },
    contentType: registry.contentType,
    render: () => registry.metrics(),
  };
}
