import { OperationalIntelligenceError } from './operational-query.js';

const WINDOWS = Object.freeze({ '1d': 1, '7d': 7, '30d': 30 });

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function calculateBudget(summary, targetPercent) {
  const samples = Math.max(0, Number(summary?.samples) || 0);
  const healthy = Math.min(samples, Math.max(0, Number(summary?.healthy) || 0));
  const failed = Math.max(0, samples - healthy);
  if (!samples) {
    return {
      samples: 0,
      healthy: 0,
      failed: 0,
      availabilityPercent: null,
      targetPercent,
      errorBudget: {
        allowedFailures: 0,
        remainingFailures: 0,
        remainingPercent: null,
        consumedPercent: null,
        burnRate: null,
      },
      status: 'no_data',
    };
  }
  const allowedFailureRate = 1 - targetPercent / 100;
  const observedFailureRate = failed / samples;
  const allowedFailures = samples * allowedFailureRate;
  const burnRate = allowedFailureRate > 0 ? observedFailureRate / allowedFailureRate : Number.POSITIVE_INFINITY;
  const consumedPercent = burnRate * 100;
  return {
    samples,
    healthy,
    failed,
    availabilityPercent: round((healthy / samples) * 100, 5),
    targetPercent,
    errorBudget: {
      allowedFailures: round(allowedFailures, 3),
      remainingFailures: round(Math.max(0, allowedFailures - failed), 3),
      remainingPercent: round(Math.max(0, 100 - consumedPercent), 3),
      consumedPercent: round(consumedPercent, 3),
      burnRate: round(burnRate, 4),
    },
    status: burnRate >= 1 ? 'exhausted' : burnRate >= 0.5 ? 'at_risk' : 'healthy',
  };
}

function emptySummary(serviceId) {
  return {
    serviceId,
    samples: 0,
    healthy: 0,
    degraded: 0,
    offline: 0,
    failed: 0,
    excluded: { maintenance: 0, unmonitored: 0 },
    firstRecordedAt: null,
    lastRecordedAt: null,
    latency: { count: 0, averageMs: null, p50Ms: null, p95Ms: null, p99Ms: null },
  };
}

function combineSummaries(summaries) {
  return summaries.reduce((combined, item) => ({
    ...combined,
    samples: combined.samples + item.samples,
    healthy: combined.healthy + item.healthy,
    degraded: combined.degraded + item.degraded,
    offline: combined.offline + item.offline,
    failed: combined.failed + item.failed,
    excluded: {
      maintenance: combined.excluded.maintenance + item.excluded.maintenance,
      unmonitored: combined.excluded.unmonitored + item.excluded.unmonitored,
    },
  }), emptySummary('all'));
}

export function createSloService({ services = [], operationsStore, targetPercent = 99.9, now = () => new Date() } = {}) {
  if (!Number.isFinite(targetPercent) || targetPercent < 90 || targetPercent >= 100) {
    throw new TypeError('SLO target must be between 90 and 100 percent.');
  }
  const serviceById = new Map(services.map((service) => [service.id, service]));

  async function getReport({ window = '7d', serviceId } = {}) {
    if (Array.isArray(window) || !WINDOWS[String(window || '')]) {
      throw new OperationalIntelligenceError(400, 'INVALID_SLO_WINDOW', 'SLO window must be one of 1d, 7d, or 30d.');
    }
    const normalizedServiceId = String(serviceId || '').trim();
    if (normalizedServiceId && !serviceById.has(normalizedServiceId)) {
      throw new OperationalIntelligenceError(400, 'INVALID_SERVICE_ID', 'Service identifier is invalid.');
    }
    if (typeof operationsStore?.getAvailabilitySummary !== 'function') {
      throw new OperationalIntelligenceError(503, 'SLO_DATA_UNAVAILABLE', 'SLO history aggregation is unavailable.');
    }
    const until = now();
    const days = WINDOWS[String(window)];
    const since = new Date(until.getTime() - days * 86400000);
    let summaries;
    try {
      summaries = await operationsStore.getAvailabilitySummary({
        serviceId: normalizedServiceId || undefined,
        since: since.toISOString(),
        until: until.toISOString(),
      });
    } catch {
      throw new OperationalIntelligenceError(503, 'SLO_DATA_UNAVAILABLE', 'SLO history aggregation is temporarily unavailable.');
    }
    if (!Array.isArray(summaries)) {
      throw new OperationalIntelligenceError(503, 'SLO_DATA_UNAVAILABLE', 'SLO history aggregation is temporarily unavailable.');
    }
    const summariesById = new Map(summaries.map((summary) => [summary.serviceId, summary]));
    const selectedServices = normalizedServiceId
      ? [serviceById.get(normalizedServiceId)]
      : services.filter((service) => service.healthPath);
    const serviceReports = selectedServices.map((service) => {
      const summary = summariesById.get(service.id) || emptySummary(service.id);
      return {
        serviceId: service.id,
        name: String(service.shortName || service.name || service.id),
        ...calculateBudget(summary, targetPercent),
        states: {
          degraded: summary.degraded,
          offline: summary.offline,
        },
        excluded: summary.excluded,
        coverage: {
          firstRecordedAt: summary.firstRecordedAt,
          lastRecordedAt: summary.lastRecordedAt,
        },
        latency: summary.latency,
      };
    });
    const aggregate = combineSummaries(serviceReports.map((report) => ({
      ...emptySummary(report.serviceId),
      samples: report.samples,
      healthy: report.healthy,
      failed: report.failed,
      degraded: report.states.degraded,
      offline: report.states.offline,
      excluded: report.excluded,
    })));
    return {
      window: String(window),
      since: since.toISOString(),
      until: until.toISOString(),
      targetPercent,
      overall: {
        ...calculateBudget(aggregate, targetPercent),
        excluded: aggregate.excluded,
      },
      services: serviceReports,
    };
  }

  return { getReport };
}

export { WINDOWS, calculateBudget };
