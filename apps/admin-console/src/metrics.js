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
    contentType: registry.contentType,
    render: () => registry.metrics(),
  };
}
