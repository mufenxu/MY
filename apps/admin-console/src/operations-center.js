import crypto from 'node:crypto';
import { statfs } from 'node:fs/promises';

const UNHEALTHY_STATES = new Set(['degraded', 'offline']);
const ACTIVE_INCIDENT_STATES = new Set(['open', 'acknowledged']);
const BLACKBOX_STATES = new Set(['healthy', 'degraded', 'offline']);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)];
}

function downsample(samples, maximum = 72) {
  if (samples.length <= maximum) return samples;
  const bucketSize = samples.length / maximum;
  const result = [];
  for (let bucket = 0; bucket < maximum; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
    const group = samples.slice(start, end);
    const latencyValues = group.map((sample) => sample.latencyMs).filter(Number.isFinite);
    const last = group.at(-1);
    result.push({
      recordedAt: last.recordedAt,
      state: group.some((sample) => sample.state === 'offline')
        ? 'offline'
        : group.some((sample) => sample.state === 'degraded') ? 'degraded' : last.state,
      latencyMs: latencyValues.length
        ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
        : null,
      maintenance: group.some((sample) => sample.maintenance),
    });
  }
  return result;
}

function durationHours(value, now) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 3600000) : null;
}

function isMaintenanceActive(serviceId, settings, timestamp) {
  return (settings.maintenanceWindows || []).some((window) => (
    (!window.serviceId || window.serviceId === 'all' || window.serviceId === serviceId)
    && Date.parse(window.startsAt) <= timestamp
    && Date.parse(window.endsAt) > timestamp
  ));
}

function incidentSeverity(state) {
  return state === 'offline' ? 'critical' : 'warning';
}

function operationDefaults(config) {
  return {
    alertingEnabled: config.incidentNotificationsEnabled !== false,
    monitorIntervalMs: config.monitorIntervalMs || 30000,
    failureThreshold: config.incidentFailureThreshold || 2,
    recoveryThreshold: config.incidentRecoveryThreshold || 2,
    serviceLatencyThresholdMs: config.serviceLatencyThresholdMs || 2000,
    proxyP95ThresholdMs: config.proxyP95ThresholdMs || 2000,
    proxyErrorRatePercent: config.proxyErrorRatePercent || 1,
    diskUsageThresholdPercent: config.diskUsageThresholdPercent || 80,
    backupRpoHours: config.backupRpoHours || 26,
    backupSchedule: {
      enabled: Boolean(config.backupScheduleEnabled),
      time: config.backupScheduleTime || '02:30',
    },
    maintenanceWindows: [],
  };
}

export function normalizeOperationSettings(input, current, serviceIds) {
  const allowedIds = new Set(['all', ...serviceIds]);
  const next = { ...current };
  if (typeof input.alertingEnabled === 'boolean') next.alertingEnabled = input.alertingEnabled;
  if (input.monitorIntervalMs !== undefined) {
    next.monitorIntervalMs = clampInteger(input.monitorIntervalMs, current.monitorIntervalMs, 10000, 300000);
  }
  if (input.failureThreshold !== undefined) {
    next.failureThreshold = clampInteger(input.failureThreshold, current.failureThreshold, 1, 10);
  }
  if (input.recoveryThreshold !== undefined) {
    next.recoveryThreshold = clampInteger(input.recoveryThreshold, current.recoveryThreshold, 1, 10);
  }
  if (input.serviceLatencyThresholdMs !== undefined) {
    next.serviceLatencyThresholdMs = clampInteger(input.serviceLatencyThresholdMs, current.serviceLatencyThresholdMs, 100, 30000);
  }
  if (input.proxyP95ThresholdMs !== undefined) {
    next.proxyP95ThresholdMs = clampInteger(input.proxyP95ThresholdMs, current.proxyP95ThresholdMs, 100, 120000);
  }
  if (input.proxyErrorRatePercent !== undefined) {
    next.proxyErrorRatePercent = clampInteger(input.proxyErrorRatePercent, current.proxyErrorRatePercent, 1, 100);
  }
  if (input.diskUsageThresholdPercent !== undefined) {
    next.diskUsageThresholdPercent = clampInteger(input.diskUsageThresholdPercent, current.diskUsageThresholdPercent, 50, 99);
  }
  if (input.backupRpoHours !== undefined) {
    next.backupRpoHours = clampInteger(input.backupRpoHours, current.backupRpoHours, 1, 720);
  }
  if (input.backupSchedule && typeof input.backupSchedule === 'object') {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.backupSchedule.time || ''))
      ? String(input.backupSchedule.time)
      : current.backupSchedule.time;
    next.backupSchedule = {
      enabled: typeof input.backupSchedule.enabled === 'boolean'
        ? input.backupSchedule.enabled
        : current.backupSchedule.enabled,
      time,
    };
  }
  if (Array.isArray(input.maintenanceWindows)) {
    next.maintenanceWindows = input.maintenanceWindows.slice(0, 50).map((window) => ({
      id: String(window.id || crypto.randomUUID()),
      serviceId: allowedIds.has(String(window.serviceId || 'all')) ? String(window.serviceId || 'all') : 'all',
      startsAt: new Date(window.startsAt).toISOString(),
      endsAt: new Date(window.endsAt).toISOString(),
      reason: String(window.reason || '计划维护').slice(0, 200),
      createdBy: String(window.createdBy || '').slice(0, 100),
    })).filter((window) => Date.parse(window.endsAt) > Date.parse(window.startsAt));
  }
  return next;
}

export function createOperationsCenter({
  services,
  monitor,
  store,
  notifier,
  backups,
  releaseService,
  metrics,
  config,
  readinessCheck = async () => true,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const defaults = operationDefaults(config);
  const serviceIds = services.map((service) => service.id);
  const streaks = new Map();
  let current = [];
  let refreshedAt = null;
  let refreshPromise = null;
  let monitorTimer = null;
  let backupTimer = null;
  let stopped = true;
  let backupQualityCache = null;
  let backupQualityCachedAt = 0;
  let lastScheduledBackupDate = '';
  const observedBackupJobs = new Set();
  const proxyWindows = new Map();
  const lastProxyEvaluation = new Map();
  let capacityCache = null;
  let capacityCachedAt = 0;

  async function getSettings() {
    return store.getSettings(defaults);
  }

  async function recordAudit(event) {
    return store.addAudit(event);
  }

  async function notifyIncident(incident, transition, settings) {
    if (!settings.alertingEnabled) return;
    if (incident.mutedUntil && Date.parse(incident.mutedUntil) > now().getTime()) return;
    const result = await notifier.sendIncident(incident, transition);
    await recordAudit({
      actor: 'system',
      action: `notification.${transition}`,
      outcome: result.delivered ? 'success' : 'failure',
      targetType: 'incident',
      targetId: incident.id,
      details: { delivered: result.delivered, reason: result.reason || '' },
    });
  }

  async function evaluateDerivedIncident({ key, active, severity, title, description, source, observedState, details = {} }, settings) {
    const existing = await store.findActiveIncident(key);
    const timestamp = now().toISOString();
    if (active && !existing) {
      const incident = await store.createIncident({
        key,
        severity,
        title,
        description,
        source,
        observedState,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        timeline: [{ type: 'opened', at: timestamp, actor: 'system', message: description }],
      });
      await recordAudit({ actor: 'system', action: 'incident.opened', targetType: source, targetId: key, details: { incidentId: incident.id, ...details } });
      await notifyIncident(incident, 'opened', settings);
      return incident;
    }
    if (active && existing) {
      return store.updateIncident(existing.id, { lastSeenAt: timestamp, severity, description, observedState });
    }
    if (!active && existing) {
      const incident = await store.updateIncident(existing.id, {
        status: 'resolved',
        resolvedAt: timestamp,
        resolvedBy: 'system',
        observedState: 'healthy',
        lastSeenAt: timestamp,
      }, { type: 'resolved', at: timestamp, actor: 'system', message: '指标已恢复到阈值以内' });
      await recordAudit({ actor: 'system', action: 'incident.resolved', targetType: source, targetId: key, details: { incidentId: incident.id } });
      await notifyIncident(incident, 'resolved', settings);
      return incident;
    }
    return null;
  }

  async function evaluateService(service, settings, timestamp) {
    const key = `service:${service.id}`;
    const existing = await store.findActiveIncident(key);
    const streak = streaks.get(service.id) || { failures: 0, recoveries: 0 };
    const maintenance = isMaintenanceActive(service.id, settings, timestamp);
    service.maintenance = maintenance;

    if (UNHEALTHY_STATES.has(service.state)) {
      streak.failures += 1;
      streak.recoveries = 0;
      if (existing) {
        await store.updateIncident(existing.id, {
          lastSeenAt: new Date(timestamp).toISOString(),
          observedState: service.state,
          severity: incidentSeverity(service.state),
          description: service.reason === 'timeout'
            ? `${service.name} 健康检查超时。`
            : service.reason === 'high_latency'
              ? `${service.name} 健康检查耗时 ${service.latencyMs} ms。`
              : `${service.name} 健康检查返回 ${service.httpStatus || '不可达'}。`,
        });
      } else if (!maintenance && streak.failures >= settings.failureThreshold) {
        const incident = await store.createIncident({
          key,
          severity: incidentSeverity(service.state),
          title: `${service.shortName || service.name} ${service.state === 'offline' ? '离线' : '响应异常'}`,
          description: service.reason === 'timeout'
            ? `${service.name} 连续健康检查超时。`
            : service.reason === 'high_latency'
              ? `${service.name} 连续健康检查超过 ${settings.serviceLatencyThresholdMs} ms。`
              : `${service.name} 连续健康检查异常。`,
          serviceId: service.id,
          observedState: service.state,
          firstSeenAt: new Date(timestamp).toISOString(),
          lastSeenAt: new Date(timestamp).toISOString(),
          timeline: [{
            type: 'opened',
            at: new Date(timestamp).toISOString(),
            actor: 'system',
            message: `连续 ${streak.failures} 次检查异常`,
          }],
        });
        await recordAudit({
          actor: 'system',
          action: 'incident.opened',
          targetType: 'service',
          targetId: service.id,
          details: { incidentId: incident.id, state: service.state },
        });
        await notifyIncident(incident, 'opened', settings);
      }
    } else if (service.state === 'healthy') {
      streak.failures = 0;
      streak.recoveries += 1;
      if (existing && streak.recoveries >= settings.recoveryThreshold) {
        const resolvedAt = new Date(timestamp).toISOString();
        const incident = await store.updateIncident(existing.id, {
          status: 'resolved',
          observedState: 'healthy',
          lastSeenAt: resolvedAt,
          resolvedAt,
          resolvedBy: 'system',
        }, {
          type: 'resolved',
          at: resolvedAt,
          actor: 'system',
          message: `连续 ${streak.recoveries} 次检查恢复正常`,
        });
        await recordAudit({
          actor: 'system',
          action: 'incident.resolved',
          targetType: 'service',
          targetId: service.id,
          details: { incidentId: incident.id },
        });
        await notifyIncident(incident, 'resolved', settings);
      }
    }
    streaks.set(service.id, streak);
  }

  async function refresh(force = true) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const timestamp = now().getTime();
      const settings = await getSettings();
      const results = (await monitor.refresh(force)).map((service) => ({ ...service }));
      for (const service of results) {
        if (service.state === 'healthy' && Number.isFinite(service.latencyMs) && service.latencyMs >= settings.serviceLatencyThresholdMs) {
          service.state = 'degraded';
          service.reason = 'high_latency';
        }
      }
      for (const service of results) await evaluateService(service, settings, timestamp);
      await store.recordStatusSamples(results, new Date(timestamp));
      current = results;
      refreshedAt = new Date(timestamp).toISOString();
      metrics?.recordServiceStatuses?.(results);
      metrics?.recordIncidentCount?.((await store.listIncidents({ status: 'open,acknowledged', limit: 2000 })).length);
      return results;
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  function statusPayload() {
    const counts = current.reduce((summary, service) => {
      summary[service.state] = (summary[service.state] || 0) + 1;
      return summary;
    }, {});
    return { services: current, counts, refreshedAt };
  }

  async function getStatus({ force = false } = {}) {
    if (force || !current.length) await refresh(true);
    return statusPayload();
  }

  async function getHistory({ serviceId, hours = 24, limit = 3000 } = {}) {
    const safeHours = clampInteger(hours, 24, 1, 24 * 30);
    const method = safeHours > 24 && store.getStatusRollups ? store.getStatusRollups.bind(store) : store.getStatusHistory.bind(store);
    return method({
      serviceId,
      since: new Date(now().getTime() - safeHours * 3600000).toISOString(),
      limit: serviceId ? Math.min(Number(limit) || 3000, 3000) : Math.min(Math.max(Number(limit) || 3000, serviceIds.length * 720), 10000),
    });
  }

  async function getOverview() {
    if (!current.length) await refresh(true);
    const since = new Date(now().getTime() - 24 * 3600000).toISOString();
    const histories = await Promise.all(services.map(async (service) => {
      const samples = await store.getStatusHistory({ serviceId: service.id, since, limit: 3000 });
      const monitored = samples.filter((sample) => !sample.maintenance && sample.state !== 'unmonitored');
      const healthy = monitored.filter((sample) => sample.state === 'healthy').length;
      const latencies = monitored.map((sample) => sample.latencyMs).filter(Number.isFinite);
      return [service.id, {
        samples: downsample(samples),
        availability: monitored.length ? Math.round((healthy / monitored.length) * 10000) / 100 : null,
        p95LatencyMs: percentile(latencies, 0.95),
      }];
    }));
    const incidents = await store.listIncidents({ status: 'open,acknowledged', limit: 8 });
    const audit = await store.listAudit({ limit: 8 });
    return {
      ...statusPayload(),
      history: Object.fromEntries(histories),
      incidents,
      audit,
      generatedAt: now().toISOString(),
    };
  }

  async function updateIncident(id, action, { actor, note = '', assignedTo = '', muteMinutes = 60 } = {}) {
    const incident = (await store.listIncidents({ limit: 1000 })).find((item) => item.id === id);
    if (!incident) return null;
    const timestamp = now().toISOString();
    let update;
    let event;
    if (action === 'acknowledge') {
      update = { status: 'acknowledged', acknowledgedAt: timestamp, acknowledgedBy: actor };
      event = { type: 'acknowledged', at: timestamp, actor, message: note || '事件已确认' };
    } else if (action === 'resolve') {
      update = { status: 'resolved', resolvedAt: timestamp, resolvedBy: actor };
      event = { type: 'resolved', at: timestamp, actor, message: note || '事件已手动关闭' };
    } else if (action === 'mute') {
      const minutes = clampInteger(muteMinutes, 60, 5, 7 * 24 * 60);
      update = { mutedUntil: new Date(now().getTime() + minutes * 60000).toISOString() };
      event = { type: 'muted', at: timestamp, actor, message: note || `静默 ${minutes} 分钟` };
    } else if (action === 'assign') {
      update = { assignedTo: String(assignedTo || '').slice(0, 100) || null };
      event = { type: 'assigned', at: timestamp, actor, message: note || `指派给 ${assignedTo}` };
    } else if (action === 'note') {
      update = {};
      event = { type: 'note', at: timestamp, actor, message: String(note || '').slice(0, 500) };
    } else {
      return null;
    }
    const updated = await store.updateIncident(id, update, event);
    await recordAudit({
      actor,
      action: `incident.${action}`,
      targetType: 'incident',
      targetId: id,
      details: { note: String(note || '').slice(0, 200), assignedTo: update.assignedTo || null },
    });
    return updated;
  }

  async function checkOffsiteBackup() {
    if (!config.offsiteBackupStatusUrl) return { configured: false, healthy: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(config.offsiteBackupStatusUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(config.offsiteBackupStatusToken ? { Authorization: `Bearer ${config.offsiteBackupStatusToken}` } : {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      const declaredStatus = String(data.status || '').trim().toLowerCase();
      return {
        configured: true,
        healthy: response.ok && data.ok !== false && !['failed', 'unhealthy', 'error', 'offline'].includes(declaredStatus),
        checkedAt: now().toISOString(),
        lastBackupAt: data.lastBackupAt || null,
      };
    } catch (error) {
      return {
        configured: true,
        healthy: false,
        checkedAt: now().toISOString(),
        error: error?.name === 'AbortError' ? 'timeout' : 'unreachable',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function evaluateBlackboxFreshness(settings = null) {
    if (!store.getLatestBlackboxSamples) return [];
    const effectiveSettings = settings || await getSettings();
    const latest = await store.getLatestBlackboxSamples();
    for (const sample of latest) {
      const staleAfterMs = Math.max(Number(sample.expectedIntervalMs || 30000) * 3, 60000);
      const ageMs = Math.max(0, now().getTime() - Date.parse(sample.recordedAt));
      await evaluateDerivedIncident({
        key: `blackbox:${sample.probeId}:${sample.targetId}:sampling-gap`,
        active: ageMs > staleAfterMs,
        severity: 'warning',
        title: `External probe ${sample.targetId} has a sampling gap`,
        description: `No external sample has arrived for ${Math.round(ageMs / 1000)} seconds.`,
        source: 'blackbox',
        observedState: ageMs > staleAfterMs ? 'sampling_gap' : 'healthy',
        details: { probeId: sample.probeId, targetId: sample.targetId, ageMs, staleAfterMs },
      }, effectiveSettings);
    }
    return latest;
  }

  async function ingestBlackboxSamples(input, { probeId } = {}) {
    if (!store.recordBlackboxSamples || !store.getLatestBlackboxSamples) {
      throw new Error('External blackbox storage is unavailable.');
    }
    const normalizedProbeId = String(probeId || '').trim();
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(normalizedProbeId)) throw new RangeError('Invalid blackbox probe id.');
    if (!Array.isArray(input) || input.length === 0 || input.length > 500) throw new RangeError('Invalid blackbox sample batch.');
    const receivedAt = now().getTime();
    const oldestAllowed = receivedAt - (config.statusRetentionDays || 30) * 86400000;
    const normalized = input.map((sample) => {
      const targetId = String(sample?.targetId || '').trim();
      const recordedAt = Date.parse(sample?.recordedAt || '');
      const state = String(sample?.state || '').trim();
      if (!/^[A-Za-z0-9._:-]{1,64}$/.test(targetId)) throw new RangeError('Invalid blackbox target id.');
      if (!BLACKBOX_STATES.has(state)) throw new RangeError('Invalid blackbox sample state.');
      if (!Number.isFinite(recordedAt) || recordedAt < oldestAllowed || recordedAt > receivedAt + 5 * 60000) {
        throw new RangeError('Invalid blackbox sample timestamp.');
      }
      return {
        probeId: normalizedProbeId,
        targetId,
        state,
        httpStatus: Number.isFinite(Number(sample.httpStatus)) ? Number(sample.httpStatus) : null,
        latencyMs: Number.isFinite(Number(sample.latencyMs)) ? Math.min(Math.max(Number(sample.latencyMs), 0), 120000) : null,
        reason: String(sample.reason || '').slice(0, 120),
        recordedAt: new Date(recordedAt).toISOString(),
        expectedIntervalMs: clampInteger(sample.expectedIntervalMs, 30000, 10000, 300000),
      };
    }).sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));

    const settings = await getSettings();
    const latestByTarget = new Map((await store.getLatestBlackboxSamples())
      .filter((sample) => sample.probeId === normalizedProbeId)
      .map((sample) => [sample.targetId, sample]));
    const records = [];
    let gaps = 0;
    let duplicates = 0;
    for (const sample of normalized) {
      const previous = latestByTarget.get(sample.targetId);
      const elapsedMs = previous ? Date.parse(sample.recordedAt) - Date.parse(previous.recordedAt) : 0;
      if (previous && elapsedMs <= 0) {
        duplicates += 1;
        continue;
      }
      const staleAfterMs = Math.max(Number(previous?.expectedIntervalMs || sample.expectedIntervalMs) * 3, 60000);
      if (previous && elapsedMs > staleAfterMs) {
        gaps += 1;
        records.push({
          ...sample,
          state: 'unknown',
          httpStatus: null,
          latencyMs: null,
          reason: 'sampling_gap',
          recordedAt: new Date(Date.parse(previous.recordedAt) + staleAfterMs).toISOString(),
          gapMs: elapsedMs,
        });
        await evaluateDerivedIncident({
          key: `blackbox:${normalizedProbeId}:${sample.targetId}:sampling-gap`,
          active: true,
          severity: 'warning',
          title: `External probe ${sample.targetId} had a sampling gap`,
          description: `The external probe missed ${Math.round(elapsedMs / 1000)} seconds of samples.`,
          source: 'blackbox',
          observedState: 'sampling_gap',
          details: { probeId: normalizedProbeId, targetId: sample.targetId, gapMs: elapsedMs },
        }, settings);
      }
      records.push(sample);
      latestByTarget.set(sample.targetId, sample);
      await evaluateDerivedIncident({
        key: `blackbox:${normalizedProbeId}:${sample.targetId}:availability`,
        active: UNHEALTHY_STATES.has(sample.state),
        severity: sample.state === 'offline' ? 'critical' : 'warning',
        title: `External probe reports ${sample.targetId} ${sample.state}`,
        description: sample.reason || `External probe state is ${sample.state}.`,
        source: 'blackbox',
        observedState: sample.state,
        details: { probeId: normalizedProbeId, targetId: sample.targetId, httpStatus: sample.httpStatus },
      }, settings);
    }
    await store.recordBlackboxSamples(records);
    await evaluateBlackboxFreshness(settings);
    return { accepted: normalized.length - duplicates, duplicates, gaps, receivedAt: now().toISOString() };
  }

  async function getBlackboxStatus({ hours = 24, limit = 3000 } = {}) {
    if (!store.getLatestBlackboxSamples || !store.getBlackboxHistory) {
      return { observed: false, overall: 'unconfigured', latest: [], samples: [] };
    }
    const latest = (await store.getLatestBlackboxSamples()).map((sample) => {
      const staleAfterMs = Math.max(Number(sample.expectedIntervalMs || 30000) * 3, 60000);
      return { ...sample, stale: now().getTime() - Date.parse(sample.recordedAt) > staleAfterMs, staleAfterMs };
    });
    const samples = await store.getBlackboxHistory({
      since: new Date(now().getTime() - clampInteger(hours, 24, 1, 24 * 30) * 3600000).toISOString(),
      limit: clampInteger(limit, 3000, 1, 10000),
    });
    const stale = latest.some((sample) => sample.stale);
    const offline = latest.some((sample) => sample.state === 'offline');
    const degraded = latest.some((sample) => sample.state === 'degraded');
    return {
      observed: latest.length > 0,
      overall: !latest.length ? 'unconfigured' : stale ? 'unknown' : offline ? 'outage' : degraded ? 'degraded' : 'healthy',
      latest,
      samples,
    };
  }

  async function recordProxyMetric(metric) {
    const serviceId = serviceIds.includes(metric?.service) ? metric.service : 'other';
    const timestamp = now().getTime();
    const samples = proxyWindows.get(serviceId) || [];
    samples.push({
      at: timestamp,
      outcome: metric?.outcome,
      statusClass: metric?.statusClass,
      durationMs: Math.max(Number(metric?.durationMs) || 0, 0),
    });
    const cutoff = timestamp - 5 * 60000;
    while (samples[0]?.at < cutoff) samples.shift();
    proxyWindows.set(serviceId, samples);
    if (timestamp - (lastProxyEvaluation.get(serviceId) || 0) < 10000) return;
    lastProxyEvaluation.set(serviceId, timestamp);

    const settings = await getSettings();
    const failures = samples.filter((sample) => sample.statusClass === '5xx').length;
    const errorPercent = samples.length ? (failures / samples.length) * 100 : 0;
    const p95 = percentile(samples.map((sample) => sample.durationMs), 0.95);
    const enoughTraffic = samples.length >= (config.proxyAlertMinimumRequests || 20);
    await Promise.all([
      evaluateDerivedIncident({
        key: `gateway:${serviceId}:5xx`,
        active: enoughTraffic && errorPercent > settings.proxyErrorRatePercent,
        severity: 'critical',
        title: `${serviceId} 网关 5xx 比例过高`,
        description: `最近 5 分钟 5xx 比例为 ${errorPercent.toFixed(1)}%，共 ${samples.length} 个请求。`,
        source: 'gateway',
        observedState: 'high_error_rate',
        details: { errorPercent, requests: samples.length },
      }, settings),
      evaluateDerivedIncident({
        key: `gateway:${serviceId}:latency`,
        active: enoughTraffic && Number.isFinite(p95) && p95 > settings.proxyP95ThresholdMs,
        severity: 'warning',
        title: `${serviceId} 网关 P95 延迟过高`,
        description: `最近 5 分钟 P95 延迟为 ${p95 || 0} ms。`,
        source: 'gateway',
        observedState: 'high_latency',
        details: { p95LatencyMs: p95, requests: samples.length },
      }, settings),
    ]);
    return { serviceId, samples: samples.length, failures, errorPercent, p95, enoughTraffic };
  }

  async function checkCapacity({ force = false } = {}) {
    if (!force && capacityCache && now().getTime() - capacityCachedAt < 300000) return capacityCache;
    const settings = await getSettings();
    try {
      const filesystem = await statfs(config.workspaceRoot);
      const totalBytes = Number(filesystem.blocks) * Number(filesystem.bsize);
      const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
      const usedPercent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
      capacityCache = { healthy: usedPercent < settings.diskUsageThresholdPercent, usedPercent: Math.round(usedPercent * 10) / 10, thresholdPercent: settings.diskUsageThresholdPercent, checkedAt: now().toISOString() };
      capacityCachedAt = now().getTime();
      metrics?.recordCapacity?.(capacityCache);
      await evaluateDerivedIncident({
        key: 'capacity:platform-disk',
        active: !capacityCache.healthy,
        severity: 'critical',
        title: '平台磁盘使用率过高',
        description: `磁盘使用率 ${capacityCache.usedPercent}%，阈值 ${capacityCache.thresholdPercent}%。`,
        source: 'capacity',
        observedState: 'disk_pressure',
        details: { usedPercent: capacityCache.usedPercent },
      }, settings);
      return capacityCache;
    } catch (error) {
      return { healthy: false, error: String(error.message || error).slice(0, 200), checkedAt: now().toISOString() };
    }
  }

  async function observeBackupJob(job) {
    if (!job?.id || !['succeeded', 'failed'].includes(job.status) || observedBackupJobs.has(job.id)) return;
    const action = `backup.${job.type}_${job.status}`;
    const existing = (await store.listAudit({ action, limit: 200 })).some((event) => event.targetId === job.id);
    if (!existing) {
      await recordAudit({
        actor: job.requestedBy || 'system',
        action,
        outcome: job.status === 'succeeded' ? 'success' : 'failure',
        targetType: 'backup_job',
        targetId: job.id,
        occurredAt: job.finishedAt || now().toISOString(),
        details: {
          backupName: job.backupName || job.result?.backupName || '',
          exitCode: job.exitCode ?? null,
          startedAt: job.startedAt || null,
          finishedAt: job.finishedAt || null,
          durationMs: Number.isFinite(Date.parse(job.finishedAt) - Date.parse(job.startedAt))
            ? Math.max(0, Date.parse(job.finishedAt) - Date.parse(job.startedAt))
            : null,
        },
      });
    }
    observedBackupJobs.add(job.id);
    backupQualityCache = null;
  }

  async function getBackupQuality({ force = false } = {}) {
    if (!force && backupQualityCache && now().getTime() - backupQualityCachedAt < 300000) return backupQualityCache;
    const settings = await getSettings();
    const [status, offsite] = await Promise.all([backups.getStatus(), checkOffsiteBackup()]);
    const offsiteAgeHours = offsite.lastBackupAt ? durationHours(offsite.lastBackupAt, now()) : null;
    if (offsite.healthy && offsiteAgeHours !== null && offsiteAgeHours > settings.backupRpoHours) {
      offsite.healthy = false;
      offsite.error = 'stale';
    }
    offsite.ageHours = offsiteAgeHours === null ? null : Math.round(offsiteAgeHours * 10) / 10;
    await Promise.all((status.jobs || []).map(observeBackupJob));
    const valid = (status.backups || []).filter((backup) => backup.restorable && backup.createdAt);
    const latest = valid.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
    const ageHours = latest ? durationHours(latest.createdAt, now()) : null;
    const restores = (status.jobs || []).filter((job) => job.type === 'restore' && job.status === 'succeeded');
    const lastRestore = restores.sort((left, right) => Date.parse(right.finishedAt || right.createdAt) - Date.parse(left.finishedAt || left.createdAt))[0] || null;
    const lastPersistedRestore = (await store.listAudit({ action: 'backup.restore_succeeded', limit: 1 }))[0] || null;
    const restoreDrillMaxAgeDays = config.restoreDrillMaxAgeDays || 90;
    const restoreRtoMinutes = config.restoreRtoMinutes || 30;
    const lastRestoreDrillAt = lastRestore?.finishedAt || lastPersistedRestore?.occurredAt || null;
    const restoreDrillAgeDays = lastRestoreDrillAt ? durationHours(lastRestoreDrillAt, now()) / 24 : null;
    const restoreDrillState = restoreDrillAgeDays === null
      ? 'missing'
      : restoreDrillAgeDays <= restoreDrillMaxAgeDays ? 'verified' : 'overdue';
    const persistedDurationMs = lastPersistedRestore?.details?.durationMs;
    const restoreDurationMs = lastRestore?.startedAt && lastRestore?.finishedAt
      ? Math.max(0, Date.parse(lastRestore.finishedAt) - Date.parse(lastRestore.startedAt))
      : persistedDurationMs !== null && persistedDurationMs !== undefined && Number.isFinite(Number(persistedDurationMs))
        ? Number(persistedDurationMs)
        : Number.NaN;
    const restoreDurationMinutes = Number.isFinite(restoreDurationMs)
      ? Math.round((restoreDurationMs / 60000) * 10) / 10
      : null;
    const restoreRtoState = restoreDurationMinutes === null
      ? 'unknown'
      : restoreDurationMinutes <= restoreRtoMinutes ? 'met' : 'breached';
    const rpoState = ageHours === null ? 'unknown' : ageHours <= settings.backupRpoHours ? 'healthy' : 'overdue';
    backupQualityCache = {
      latestBackup: latest,
      validBackups: valid.length,
      totalBackups: (status.backups || []).length,
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      rpoHours: settings.backupRpoHours,
      rpoState,
      lastRestoreDrillAt,
      restoreDrillAgeDays: restoreDrillAgeDays === null ? null : Math.round(restoreDrillAgeDays * 10) / 10,
      restoreDrillMaxAgeDays,
      restoreDrillState,
      restoreDurationMinutes,
      restoreRtoMinutes,
      restoreRtoState,
      offsite,
      schedule: settings.backupSchedule,
      capabilities: status.capabilities,
      checkedAt: now().toISOString(),
    };
    backupQualityCachedAt = now().getTime();
    metrics?.recordBackupQuality?.(backupQualityCache);

    await Promise.all([
      evaluateDerivedIncident({
        key: 'backup:restore-drill',
        active: restoreDrillState !== 'verified',
        severity: restoreDrillState === 'missing' ? 'critical' : 'warning',
        title: restoreDrillState === 'missing' ? 'Restore drill is missing' : 'Restore drill is overdue',
        description: restoreDrillState === 'missing'
          ? 'No successful restore drill has been recorded.'
          : `The last successful restore drill is ${backupQualityCache.restoreDrillAgeDays} days old.`,
        source: 'backup',
        observedState: restoreDrillState,
        details: { lastRestoreDrillAt, maxAgeDays: restoreDrillMaxAgeDays },
      }, settings),
      evaluateDerivedIncident({
        key: 'backup:restore-rto',
        active: restoreRtoState === 'breached',
        severity: 'warning',
        title: 'Restore exceeded the recovery time objective',
        description: restoreDurationMinutes === null
          ? 'Restore duration is unavailable.'
          : `The last restore took ${restoreDurationMinutes} minutes; target is ${restoreRtoMinutes} minutes.`,
        source: 'backup',
        observedState: restoreRtoState,
        details: { restoreDurationMinutes, rtoMinutes: restoreRtoMinutes },
      }, settings),
      evaluateDerivedIncident({
        key: 'backup:offsite',
        active: offsite.configured && offsite.healthy === false,
        severity: 'critical',
        title: 'Offsite backup is unhealthy',
        description: offsite.error
          ? `Offsite backup status is ${offsite.error}.`
          : 'The offsite backup endpoint reported a failure.',
        source: 'backup',
        observedState: offsite.configured ? (offsite.healthy ? 'healthy' : 'unhealthy') : 'unconfigured',
        details: { checkedAt: offsite.checkedAt || null, lastBackupAt: offsite.lastBackupAt || null },
      }, settings),
    ]);

    const key = 'backup:freshness';
    const existing = await store.findActiveIncident(key);
    if (rpoState !== 'healthy' && !existing) {
      const incident = await store.createIncident({
        key,
        severity: 'critical',
        title: latest ? '备份已超过 RPO' : '尚无可恢复备份',
        description: latest
          ? `最近备份距今 ${backupQualityCache.ageHours} 小时，已超过 ${settings.backupRpoHours} 小时目标。`
          : '未找到通过完整性检查的可恢复备份。',
        source: 'backup',
        observedState: rpoState,
      });
      await recordAudit({ actor: 'system', action: 'incident.opened', targetType: 'backup', targetId: latest?.name || '', details: { incidentId: incident.id } });
      await notifyIncident(incident, 'opened', settings);
    } else if (rpoState === 'healthy' && existing) {
      const incident = await store.updateIncident(existing.id, {
        status: 'resolved',
        resolvedAt: now().toISOString(),
        resolvedBy: 'system',
        observedState: 'healthy',
      }, { type: 'resolved', at: now().toISOString(), actor: 'system', message: '备份新鲜度恢复正常' });
      await notifyIncident(incident, 'resolved', settings);
    }
    return backupQualityCache;
  }

  async function maybeRunScheduledBackup() {
    const settings = await getSettings();
    if (!settings.backupSchedule?.enabled) return;
    const currentTime = now();
    const date = currentTime.toLocaleDateString('en-CA');
    const time = currentTime.toTimeString().slice(0, 5);
    if (time !== settings.backupSchedule.time || lastScheduledBackupDate === date) return;
    lastScheduledBackupDate = date;
    try {
      const job = await backups.startBackup({ requestedBy: 'system:scheduler' });
      backupQualityCache = null;
      await recordAudit({ actor: 'system:scheduler', action: 'backup.scheduled', targetType: 'backup_job', targetId: job.id, details: { scheduledTime: time } });
    } catch (error) {
      await recordAudit({ actor: 'system:scheduler', action: 'backup.scheduled', outcome: 'failure', targetType: 'backup', details: { error: String(error.message || error).slice(0, 200) } });
    }
  }

  async function runDiagnostics() {
    const startedAt = now();
    const checks = await Promise.allSettled([
      refresh(true),
      store.ping(),
      readinessCheck(),
      getBackupQuality({ force: true }),
      notifier.check(),
      releaseService.getSummary(),
      checkCapacity({ force: true }),
    ]);
    const definitions = [
      {
        id: 'service_health',
        evaluate: (value) => Array.isArray(value) && value.every((service) => !UNHEALTHY_STATES.has(service.state)) ? 'passed' : 'failed',
      },
      { id: 'operations_store', evaluate: (value) => value === true ? 'passed' : 'failed' },
      { id: 'platform_readiness', evaluate: (value) => value === true ? 'passed' : 'failed' },
      { id: 'backup_runner', evaluate: (value) => value?.rpoState === 'healthy' && value?.capabilities?.canBackup ? 'passed' : 'failed' },
      { id: 'notification_service', evaluate: (value) => !value?.configured ? 'skipped' : value.healthy ? 'passed' : 'failed' },
      { id: 'release_integration', evaluate: (value) => !value?.capabilities?.githubConfigured ? 'skipped' : value.capabilities.issue ? 'failed' : 'passed' },
      { id: 'platform_capacity', evaluate: (value) => value?.healthy ? 'passed' : 'failed' },
    ];
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      checks: checks.map((result, index) => ({
        id: definitions[index].id,
        status: result.status === 'fulfilled' ? definitions[index].evaluate(result.value) : 'failed',
        detail: result.status === 'rejected'
          ? String(result.reason?.message || result.reason).slice(0, 240)
          : result.value,
      })),
    };
  }

  async function updateSettings(patch, actor) {
    const currentSettings = await getSettings();
    const normalized = normalizeOperationSettings(patch, currentSettings, serviceIds);
    const updated = await store.updateSettings(normalized, defaults);
    await recordAudit({
      actor,
      action: 'operations.settings_updated',
      targetType: 'operations_settings',
      details: {
        alertingEnabled: updated.alertingEnabled,
        monitorIntervalMs: updated.monitorIntervalMs,
        backupSchedule: updated.backupSchedule,
        maintenanceWindows: updated.maintenanceWindows.length,
      },
    });
    return updated;
  }

  async function previewSettings(patch) {
    const currentSettings = await getSettings();
    return normalizeOperationSettings(patch, currentSettings, serviceIds);
  }

  async function monitorLoop() {
    if (stopped) return;
    try {
      await refresh(true);
      await getBackupQuality();
      await checkCapacity();
      await evaluateBlackboxFreshness();
    } catch (error) {
      await recordAudit({ actor: 'system', action: 'monitor.cycle', outcome: 'failure', details: { error: String(error.message || error).slice(0, 200) } });
    } finally {
      if (!stopped) {
        const settings = await getSettings().catch(() => defaults);
        monitorTimer = setTimeout(monitorLoop, settings.monitorIntervalMs);
        monitorTimer.unref?.();
      }
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    monitorLoop();
    backupTimer = setInterval(() => maybeRunScheduledBackup().catch(() => {}), 60000);
    backupTimer.unref?.();
  }

  function stop() {
    stopped = true;
    if (monitorTimer) clearTimeout(monitorTimer);
    if (backupTimer) clearInterval(backupTimer);
  }

  return {
    getBackupQuality,
    getBlackboxStatus,
    getHistory,
    getOverview,
    getSettings,
    getStatus,
    ingestBlackboxSamples,
    observeBackupJob,
    previewSettings,
    recordProxyMetric,
    recordAudit,
    refresh,
    runDiagnostics,
    start,
    stop,
    updateIncident,
    updateSettings,
  };
}
