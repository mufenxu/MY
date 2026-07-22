import {
  boundedDateRange,
  boundedInteger,
  enumFilter,
  OperationalIntelligenceError,
  safeIdentifier,
  safeIdentifiers,
  sanitizeOperationalText,
} from './operational-query.js';

const CALENDAR_TYPES = new Set(['release', 'configuration', 'maintenance', 'incident']);
const SOURCE_SCAN_LIMIT = 200;

function timeline(value, from, to) {
  return (Array.isArray(value) ? value : [])
    .map((event) => ({
      type: String(event.type || event.status || 'updated').slice(0, 40),
      at: event.at || event.occurredAt || event.createdAt || null,
    }))
    .filter((event) => event.at && Date.parse(event.at) >= from && Date.parse(event.at) <= to)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .slice(-20);
}

function overlaps(event, from, to, currentTime) {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt || currentTime);
  return Number.isFinite(start) && start <= to && Math.max(start, Number.isFinite(end) ? end : start) >= from;
}

function mapReleases({ builds = [], deployments = [] }, from, to) {
  return [
    ...builds.map((build) => ({
      id: `release:build:${build.id}`,
      type: 'release',
      category: 'build',
      title: 'Release build',
      status: String(build.status || ''),
      serviceId: null,
      startsAt: build.startedAt || build.createdAt,
      endsAt: build.completedAt || null,
      scope: safeIdentifiers(build.targets),
      timeline: timeline(build.timeline, from, to),
    })),
    ...deployments.map((deployment) => ({
      id: `release:deployment:${deployment.id}`,
      type: 'release',
      category: deployment.action === 'rollback' ? 'rollback' : 'deployment',
      title: deployment.action === 'rollback' ? 'Release rollback' : 'Release deployment',
      status: String(deployment.status || ''),
      serviceId: null,
      startsAt: deployment.startedAt || deployment.requestedAt || deployment.createdAt,
      endsAt: deployment.completedAt || null,
      scope: safeIdentifiers(deployment.components),
      timeline: timeline(deployment.timeline, from, to),
    })),
  ];
}

function mapConfigurations(changes) {
  return changes.map((change) => ({
    id: `configuration:${change.id}`,
    type: 'configuration',
    category: change.kind === 'rollback' ? 'rollback' : 'change',
    title: sanitizeOperationalText(change.summary || 'Configuration change', 160),
    status: String(change.status || ''),
    serviceId: null,
    startsAt: change.createdAt,
    endsAt: change.appliedAt || change.rejectedAt || null,
    scope: safeIdentifiers(change.changedKeys),
    timeline: [],
  }));
}

function mapMaintenance(settings, currentTime) {
  const currentTimestamp = Date.parse(currentTime);
  return (settings.maintenanceWindows || []).slice(0, 50).map((window) => ({
    id: `maintenance:${safeIdentifier(window.id, safeIdentifier(`${window.serviceId}:${window.startsAt}`))}`,
    type: 'maintenance',
    category: 'maintenance',
    title: sanitizeOperationalText(window.reason || 'Planned maintenance', 160),
    status: Date.parse(window.endsAt) < currentTimestamp ? 'completed' : Date.parse(window.startsAt) > currentTimestamp ? 'scheduled' : 'active',
    serviceId: safeIdentifier(window.serviceId || 'all'),
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    scope: [],
    timeline: [],
  }));
}

function mapIncidents(incidents, from, to) {
  return incidents.map((incident) => ({
    id: `incident:${incident.id}`,
    type: 'incident',
    category: String(incident.severity || 'warning').slice(0, 40),
    title: sanitizeOperationalText(incident.title || 'Operational incident', 160),
    status: String(incident.status || ''),
    serviceId: incident.serviceId || null,
    startsAt: incident.openedAt || incident.firstSeenAt,
    endsAt: incident.resolvedAt || null,
    scope: [],
    timeline: timeline(incident.timeline, from, to),
  }));
}

function unavailable(message) {
  return Promise.reject(new Error(message));
}

export function createChangeCalendar({ services = [], releaseStore, configurationStore, operationsStore, operationsManager, now = () => new Date() } = {}) {
  const serviceIds = new Set(services.map((service) => service.id));

  async function list({ from, to, type, serviceId, page, pageSize } = {}) {
    const range = boundedDateRange({ from, to }, { now, maximumDays: 90, code: 'INVALID_CHANGE_CALENDAR_RANGE' });
    const types = enumFilter(type, CALENDAR_TYPES, { code: 'INVALID_CHANGE_CALENDAR_TYPE', label: 'Calendar type' });
    const normalizedServiceId = String(serviceId || '').trim();
    if (normalizedServiceId && normalizedServiceId !== 'all' && !serviceIds.has(normalizedServiceId)) {
      throw new OperationalIntelligenceError(400, 'INVALID_SERVICE_ID', 'Service identifier is invalid.');
    }
    const normalizedPage = boundedInteger(page, {
      fallback: 1,
      maximum: 100,
      code: 'INVALID_CHANGE_CALENDAR_PAGE',
      label: 'Calendar page',
    });
    const normalizedPageSize = boundedInteger(pageSize, {
      fallback: 20,
      maximum: 50,
      code: 'INVALID_CHANGE_CALENDAR_PAGE_SIZE',
      label: 'Calendar page size',
    });
    const fromTime = Date.parse(range.from);
    const toTime = Date.parse(range.to);
    const currentTime = now().toISOString();
    const loaders = {
      release: () => typeof releaseStore?.listBuilds === 'function' && typeof releaseStore?.listDeployments === 'function'
        ? Promise.all([
          releaseStore.listBuilds({ limit: 100 }),
          releaseStore.listDeployments({ limit: 100 }),
        ]).then(([builds, deployments]) => ({ events: mapReleases({ builds, deployments }, fromTime, toTime), scanLimitReached: builds.length >= 100 || deployments.length >= 100 }))
        : unavailable('Release source unavailable.'),
      configuration: () => typeof configurationStore?.listChanges === 'function'
        ? configurationStore.listChanges(SOURCE_SCAN_LIMIT).then((changes) => ({ events: mapConfigurations(changes), scanLimitReached: changes.length >= SOURCE_SCAN_LIMIT }))
        : unavailable('Configuration source unavailable.'),
      maintenance: () => typeof operationsManager?.getSettings === 'function'
        ? operationsManager.getSettings().then((settings) => ({ events: mapMaintenance(settings, currentTime), scanLimitReached: (settings.maintenanceWindows || []).length >= 50 }))
        : unavailable('Maintenance source unavailable.'),
      incident: () => typeof operationsStore?.listIncidents === 'function'
        ? operationsStore.listIncidents({ limit: SOURCE_SCAN_LIMIT }).then((incidents) => ({ events: mapIncidents(incidents, fromTime, toTime), scanLimitReached: incidents.length >= SOURCE_SCAN_LIMIT }))
        : unavailable('Incident source unavailable.'),
    };
    const settled = await Promise.allSettled(types.map((source) => loaders[source]()));
    const events = settled
      .flatMap((result) => result.status === 'fulfilled' ? result.value.events : [])
      .filter((event) => overlaps(event, fromTime, toTime, currentTime))
      .filter((event) => !normalizedServiceId
        || normalizedServiceId === 'all'
        || event.serviceId === normalizedServiceId
        || event.scope?.includes(normalizedServiceId)
        || (event.type === 'maintenance' && event.serviceId === 'all'))
      .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt) || left.id.localeCompare(right.id));
    const offset = (normalizedPage - 1) * normalizedPageSize;
    return {
      range,
      types,
      serviceId: normalizedServiceId || null,
      events: events.slice(offset, offset + normalizedPageSize),
      pagination: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: events.length,
        pages: Math.ceil(events.length / normalizedPageSize),
        hasMore: offset + normalizedPageSize < events.length,
      },
      sources: settled.map((result, index) => ({
        id: types[index],
        available: result.status === 'fulfilled',
        scanLimitReached: result.status === 'fulfilled' && result.value.scanLimitReached,
      })),
      generatedAt: currentTime,
    };
  }

  return { list };
}

export { CALENDAR_TYPES };
