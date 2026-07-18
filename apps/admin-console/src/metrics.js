import client from 'prom-client';

export function createMetrics({ serviceIds = [] } = {}) {
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
  const serviceHealth = new client.Gauge({
    name: 'my_platform_service_health',
    help: 'Current service health where 1 is healthy, 0.5 is degraded, and 0 is offline.',
    labelNames: ['service'],
    registers: [registry],
  });
  const serviceLatency = new client.Gauge({
    name: 'my_platform_service_healthcheck_latency_milliseconds',
    help: 'Latest service healthcheck latency in milliseconds.',
    labelNames: ['service'],
    registers: [registry],
  });
  const backupAge = new client.Gauge({
    name: 'my_platform_backup_age_hours',
    help: 'Age of the newest restorable backup in hours.',
    registers: [registry],
  });
  const openIncidents = new client.Gauge({
    name: 'my_platform_open_incidents',
    help: 'Number of open or acknowledged operations incidents.',
    registers: [registry],
  });
  const diskUsage = new client.Gauge({
    name: 'my_platform_disk_usage_percent',
    help: 'Platform filesystem usage percentage.',
    registers: [registry],
  });
  const allowedServiceIds = new Set(serviceIds);

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
    recordServiceStatuses(services) {
      for (const service of services) {
        const id = allowedServiceIds.has(service.id) ? service.id : 'other';
        serviceHealth.set({ service: id }, { healthy: 1, degraded: 0.5, offline: 0, unmonitored: -1 }[service.state] ?? -1);
        if (Number.isFinite(service.latencyMs)) serviceLatency.set({ service: id }, service.latencyMs);
      }
    },
    recordBackupQuality(quality) {
      if (Number.isFinite(quality?.ageHours)) backupAge.set(quality.ageHours);
    },
    recordIncidentCount(value) {
      openIncidents.set(Math.max(Number(value) || 0, 0));
    },
    recordCapacity(capacity) {
      if (Number.isFinite(capacity?.usedPercent)) diskUsage.set(capacity.usedPercent);
    },
    contentType: registry.contentType,
    render: () => registry.metrics(),
  };
}
