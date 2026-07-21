function normalizeTaskStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['queued', 'pending', 'scheduled'].includes(value)) return 'pending';
  if (['running', 'building', 'deploying', 'rolling_back', 'in_progress', 'processing'].includes(value)) return 'running';
  if (['succeeded', 'success', 'completed', 'delivered', 'resolved'].includes(value)) return 'succeeded';
  if (['failed', 'failure', 'timed_out'].includes(value)) return 'failed';
  if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
  if (['open', 'acknowledged'].includes(value)) return 'action_required';
  return 'pending';
}

function taskTime(task) {
  return task.updatedAt || task.completedAt || task.finishedAt || task.createdAt || task.requestedAt || task.openedAt || null;
}

function mapBackup(job) {
  return {
    id: `backup:${job.id}`,
    source: 'backup',
    sourceId: job.id,
    title: job.type === 'restore' ? 'Database restore' : 'Database backup',
    status: normalizeTaskStatus(job.status),
    rawStatus: job.status,
    requestedBy: job.requestedBy || 'system',
    updatedAt: taskTime(job),
    detail: job.backupName || job.error || '',
    view: 'backup',
  };
}

function mapRelease(item, kind) {
  return {
    id: `${kind}:${item.id}`,
    source: kind,
    sourceId: item.id,
    title: kind === 'release_build' ? 'Release build' : item.action === 'rollback' ? 'Release rollback' : 'Release deployment',
    status: normalizeTaskStatus(item.status),
    rawStatus: item.status,
    requestedBy: item.requestedBy || 'system',
    updatedAt: taskTime(item),
    detail: (item.targets || item.components || []).join(', ') || item.error || '',
    view: 'releases',
  };
}

function mapNotification(job) {
  return {
    id: `notification:${job.id}`,
    source: 'notification',
    sourceId: job.id,
    title: job.templateKey ? `Notification: ${job.templateKey}` : 'Notification delivery job',
    status: normalizeTaskStatus(job.status),
    rawStatus: job.status,
    requestedBy: job.createdBy || job.caller || 'system',
    updatedAt: taskTime(job),
    detail: job.targetId || job.touser || '',
    view: 'notification',
  };
}

function mapIncident(incident) {
  return {
    id: `incident:${incident.id}`,
    source: 'incident',
    sourceId: incident.id,
    title: incident.title || 'Operational incident',
    status: normalizeTaskStatus(incident.status),
    rawStatus: incident.status,
    requestedBy: incident.assignedTo || 'unassigned',
    updatedAt: taskTime(incident),
    detail: incident.serviceId || incident.source || '',
    view: 'incidents',
  };
}

export function createTaskCenter({ backups, releases, notificationManagement, operationsStore } = {}) {
  async function list({ status, source, limit = 100 } = {}) {
    const settled = await Promise.allSettled([
      backups.getStatus(),
      releases.getSummary(),
      notificationManagement.listJobs({ page: 1, pageSize: 100 }),
      operationsStore.listIncidents({ limit: 100 }),
    ]);
    const [backupResult, releaseResult, notificationResult, incidentResult] = settled;
    const tasks = [
      ...(backupResult.status === 'fulfilled' ? (backupResult.value.jobs || []).map(mapBackup) : []),
      ...(releaseResult.status === 'fulfilled' ? (releaseResult.value.builds || []).map((item) => mapRelease(item, 'release_build')) : []),
      ...(releaseResult.status === 'fulfilled' ? (releaseResult.value.deployments || []).map((item) => mapRelease(item, 'release_deployment')) : []),
      ...(notificationResult.status === 'fulfilled' ? (notificationResult.value.jobs || notificationResult.value.items || []).map(mapNotification) : []),
      ...(incidentResult.status === 'fulfilled' ? incidentResult.value.map(mapIncident) : []),
    ]
      .filter((task) => !status || task.status === status)
      .filter((task) => !source || task.source === source)
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))
      .slice(0, Math.min(200, Math.max(1, Number(limit) || 100)));
    const counts = tasks.reduce((result, task) => ({ ...result, [task.status]: (result[task.status] || 0) + 1 }), {});
    return {
      tasks,
      counts,
      generatedAt: new Date().toISOString(),
      sources: settled.map((result, index) => ({
        id: ['backup', 'release', 'notification', 'incident'][index],
        available: result.status === 'fulfilled',
      })),
    };
  }

  return { list };
}

export { normalizeTaskStatus };
