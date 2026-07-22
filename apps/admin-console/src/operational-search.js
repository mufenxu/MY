import {
  boundedInteger,
  enumFilter,
  normalizedText,
  sanitizeOperationalText,
  safeIdentifier,
  safeIdentifiers,
} from './operational-query.js';

const SEARCH_TYPES = new Set(['service', 'incident', 'task', 'release', 'configuration']);
const SEARCH_RESULT_VIEWS = new Set([
  'all', 'miniapp', 'service', 'monitoring', 'incidents', 'diagnostics',
  'tasks', 'releases', 'configuration', 'backup', 'notification', 'automation', 'security',
]);
const SOURCE_SCAN_LIMIT = 200;

function safeStatus(value) {
  return sanitizeOperationalText(value, 40);
}

function safeTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeConsoleView(value, fallback = 'tasks') {
  const normalized = String(value || '').trim();
  return SEARCH_RESULT_VIEWS.has(normalized) ? normalized : fallback;
}

function searchable(value) {
  return String(value || '').toLocaleLowerCase('en-US');
}

function resultScore(result, query) {
  const title = searchable(result.title);
  const entityId = searchable(result.entityId);
  const haystack = searchable(result.searchText);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  if (title === query || entityId === query) return 100;
  if (title.startsWith(query) || entityId.startsWith(query)) return 80;
  if (title.includes(query)) return 60;
  return 40 + Math.min(10, tokens.length);
}

function serviceResults(services) {
  return services.map((service) => ({
    id: `service:${safeIdentifier(service.id)}`,
    entityId: safeIdentifier(service.id),
    type: 'service',
    title: sanitizeOperationalText(service.shortName || service.name, 100),
    subtitle: sanitizeOperationalText(service.description, 160),
    status: null,
    serviceId: safeIdentifier(service.id),
    occurredAt: null,
    view: 'all',
    searchText: [service.id, service.name, service.shortName, service.category, service.description, ...(service.capabilities || [])].join(' '),
  }));
}

function incidentResults(incidents) {
  return incidents.map((incident) => ({
    id: `incident:${safeIdentifier(incident.id)}`,
    entityId: safeIdentifier(incident.id),
    type: 'incident',
    title: sanitizeOperationalText(incident.title || 'Operational incident', 140),
    subtitle: sanitizeOperationalText([incident.severity, incident.serviceId].filter(Boolean).join(' · '), 160),
    status: safeStatus(incident.status),
    serviceId: incident.serviceId ? safeIdentifier(incident.serviceId) : null,
    occurredAt: safeTimestamp(incident.lastSeenAt || incident.openedAt),
    view: 'incidents',
    searchText: [incident.id, incident.title, incident.serviceId, incident.severity, incident.status, incident.source].join(' '),
  }));
}

function taskResults(tasks) {
  return tasks.map((task) => ({
    id: `task:${safeIdentifier(task.id)}`,
    entityId: safeIdentifier(task.sourceId || task.id),
    type: 'task',
    title: sanitizeOperationalText(task.title || 'Operational task', 140),
    subtitle: sanitizeOperationalText(task.source, 60),
    status: safeStatus(task.status),
    serviceId: null,
    occurredAt: safeTimestamp(task.updatedAt),
    view: safeConsoleView(task.view),
    searchText: [task.id, task.sourceId, task.source, task.title, task.status, task.rawStatus, task.view].join(' '),
  }));
}

function releaseResults({ builds = [], deployments = [] }) {
  return [
    ...builds.map((build) => ({
      id: `release:build:${safeIdentifier(build.id)}`,
      entityId: safeIdentifier(build.id),
      type: 'release',
      category: 'build',
      title: 'Release build',
      subtitle: safeIdentifiers(build.targets).join(', '),
      status: safeStatus(build.status),
      serviceId: null,
      occurredAt: safeTimestamp(build.updatedAt || build.createdAt),
      view: 'releases',
      searchText: [build.id, build.status, build.environment, ...safeIdentifiers(build.targets)].join(' '),
    })),
    ...deployments.map((deployment) => ({
      id: `release:deployment:${safeIdentifier(deployment.id)}`,
      entityId: safeIdentifier(deployment.id),
      type: 'release',
      category: deployment.action === 'rollback' ? 'rollback' : 'deployment',
      title: deployment.action === 'rollback' ? 'Release rollback' : 'Release deployment',
      subtitle: safeIdentifiers(deployment.components).join(', '),
      status: safeStatus(deployment.status),
      serviceId: null,
      occurredAt: safeTimestamp(deployment.updatedAt || deployment.requestedAt || deployment.createdAt),
      view: 'releases',
      searchText: [deployment.id, deployment.action, deployment.status, deployment.environment, ...safeIdentifiers(deployment.components)].join(' '),
    })),
  ];
}

function configurationResults(changes) {
  return changes.map((change) => ({
    id: `configuration:${safeIdentifier(change.id)}`,
    entityId: safeIdentifier(change.id),
    type: 'configuration',
    title: sanitizeOperationalText(change.summary || 'Configuration change', 140),
    subtitle: safeIdentifiers(change.changedKeys).join(', '),
    status: safeStatus(change.status),
    serviceId: null,
    occurredAt: safeTimestamp(change.updatedAt || change.createdAt),
    view: 'configuration',
    searchText: [change.id, change.kind, change.status, change.summary, ...safeIdentifiers(change.changedKeys)].join(' '),
  }));
}

function unavailable(message) {
  return Promise.reject(new Error(message));
}

function withTimeout(load, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(load),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Operational search source timed out.')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function createOperationalSearch({
  services = [],
  operationsStore,
  taskCenter,
  releaseStore,
  configurationStore,
  sourceTimeoutMs = 2000,
  now = () => new Date(),
} = {}) {
  const boundedSourceTimeoutMs = Math.min(5000, Math.max(100, Number(sourceTimeoutMs) || 2000));
  async function search({ q, type, limit } = {}) {
    const normalizedQuery = normalizedText(q, {
      minimum: 2,
      maximum: 80,
      code: 'INVALID_SEARCH_QUERY',
      label: 'Search query',
    });
    const query = searchable(normalizedQuery);
    const types = enumFilter(type, SEARCH_TYPES, { code: 'INVALID_SEARCH_TYPE', label: 'Search type' });
    const resultLimit = boundedInteger(limit, {
      fallback: 20,
      maximum: 50,
      code: 'INVALID_SEARCH_LIMIT',
      label: 'Search limit',
    });
    const loaders = {
      service: () => Promise.resolve(serviceResults(services)),
      incident: () => typeof operationsStore?.listIncidents === 'function'
        ? operationsStore.listIncidents({ limit: SOURCE_SCAN_LIMIT }).then(incidentResults)
        : unavailable('Incident source unavailable.'),
      task: () => typeof taskCenter?.list === 'function'
        ? taskCenter.list({ limit: SOURCE_SCAN_LIMIT }).then((result) => taskResults(result.tasks || []))
        : unavailable('Task source unavailable.'),
      release: () => typeof releaseStore?.listBuilds === 'function' && typeof releaseStore?.listDeployments === 'function'
        ? Promise.all([
          releaseStore.listBuilds({ limit: 100 }),
          releaseStore.listDeployments({ limit: 100 }),
        ]).then(([builds, deployments]) => releaseResults({ builds, deployments }))
        : unavailable('Release source unavailable.'),
      configuration: () => typeof configurationStore?.listChanges === 'function'
        ? configurationStore.listChanges(SOURCE_SCAN_LIMIT).then(configurationResults)
        : unavailable('Configuration source unavailable.'),
    };
    const settled = await Promise.allSettled(types.map((source) => withTimeout(loaders[source], boundedSourceTimeoutMs)));
    const matches = settled.flatMap((result, index) => result.status === 'fulfilled'
      ? result.value.map((item) => ({ ...item, score: resultScore(item, query), sourceOrder: index })).filter((item) => item.score > 0)
      : []);
    matches.sort((left, right) => right.score - left.score
      || Date.parse(right.occurredAt || 0) - Date.parse(left.occurredAt || 0)
      || left.sourceOrder - right.sourceOrder
      || left.title.localeCompare(right.title));
    const results = matches.slice(0, resultLimit).map(({ searchText, score, sourceOrder, ...item }) => item);
    return {
      query: normalizedQuery,
      types,
      results,
      totalMatched: matches.length,
      truncated: matches.length > resultLimit,
      generatedAt: now().toISOString(),
      sources: settled.map((result, index) => ({ id: types[index], available: result.status === 'fulfilled' })),
    };
  }

  return { search };
}

export { SEARCH_TYPES };
