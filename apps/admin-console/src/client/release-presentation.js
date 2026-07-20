const RELEASE_STATUS_LABELS = {
  queued: '已排队',
  requested: '已排队',
  waiting: '等待中',
  pending: '等待中',
  building: '构建中',
  in_progress: '进行中',
  running: '执行中',
  completed: '已完成',
  success: '成功',
  succeeded: '成功',
  failure: '失败',
  failed: '失败',
  cancelled: '已取消',
  canceled: '已取消',
  timed_out: '已超时',
  action_required: '需要处理',
  stale: '已失效',
  skipped: '已跳过',
  neutral: '已结束',
  rolled_back: '已自动回滚',
  unknown: '状态未知',
};

const WORKFLOW_LABELS = {
  'Build and push Aliyun ACR images': '构建并推送阿里云 ACR 镜像',
};

const RUNTIME_STATE_LABELS = {
  created: '已创建',
  running: '运行中',
  paused: '已暂停',
  restarting: '重启中',
  removing: '移除中',
  exited: '已退出',
  dead: '已终止',
  missing: '容器缺失',
  unknown: '状态未知',
};

const RUNTIME_HEALTH_LABELS = {
  healthy: '健康',
  unhealthy: '不健康',
  starting: '健康检查中',
  none: '未配置健康检查',
  not_configured: '未配置健康检查',
  running: '未配置健康检查',
  unknown: '健康状态未知',
};

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function shortIdentifier(value, length = 19) {
  const text = String(value || '').trim();
  return text ? text.slice(0, length) : '';
}

export function releaseStatusLabel(status) {
  return RELEASE_STATUS_LABELS[normalized(status)] || '状态未知';
}

export function releaseStateClass(status) {
  const value = normalized(status);
  if (['success', 'succeeded'].includes(value)) return 'success';
  if (['failure', 'failed', 'cancelled', 'canceled', 'timed_out', 'action_required'].includes(value)) return 'failure';
  if (value === 'rolled_back') return 'warning';
  if (['queued', 'requested', 'waiting', 'pending'].includes(value)) return 'queued';
  if (['building', 'in_progress', 'running'].includes(value)) return 'running';
  return 'unknown';
}

export function workflowNameLabel(name) {
  const value = String(name || '').trim();
  return WORKFLOW_LABELS[value] || value || '历史构建记录';
}

export function environmentLabel(environment) {
  const value = normalized(environment);
  return {
    production: '生产环境',
    prod: '生产环境',
    staging: '预发布环境',
    stage: '预发布环境',
    test: '测试环境',
    testing: '测试环境',
    development: '开发环境',
    dev: '开发环境',
  }[value] || String(environment || '生产环境');
}

export function runtimeStateLabel(state) {
  return RUNTIME_STATE_LABELS[normalized(state)] || '状态未知';
}

export function runtimeHealthLabel(health) {
  return RUNTIME_HEALTH_LABELS[normalized(health)] || '健康状态未知';
}

export function runtimeStateSummary(runtime) {
  if (!runtime) return '部署执行器未返回状态';
  return `${runtimeStateLabel(runtime.state)} · ${runtimeHealthLabel(runtime.health)}`;
}

export function runtimeImageReference(runtime) {
  if (!runtime) return '--';
  return runtime.containerImage || runtime.reference || runtime.configuredImage || '镜像引用不可用';
}

export function runtimeVersionLabel(runtime) {
  if (!runtime) return '版本标识不可用';
  const identifiers = [];
  if (runtime.revision) identifiers.push(`提交 ${shortIdentifier(runtime.revision, 12)}`);
  if (runtime.digest) identifiers.push(`Digest ${shortIdentifier(runtime.digest)}`);
  if (runtime.imageId) identifiers.push(`镜像 ID ${shortIdentifier(runtime.imageId)}`);
  return identifiers.join(' · ') || '版本标识不可用';
}

export function runtimeVersionTitle(runtime) {
  if (!runtime) return '';
  return [
    runtime.revision && `提交：${runtime.revision}`,
    runtime.digest && `Digest：${runtime.digest}`,
    runtime.imageId && `镜像 ID：${runtime.imageId}`,
  ].filter(Boolean).join('\n');
}

export function componentObservation(component) {
  const runtime = component?.runtime || null;
  const observed = typeof component?.observed === 'boolean'
    ? component.observed
    : Boolean(runtime && (runtime.observed !== false) && runtime.state !== 'missing');
  if (!observed) return { label: '未观测', className: '' };
  if (component.inSync === true) return { label: '同步', className: 'synced' };
  if (component.inSync === false) return { label: '漂移', className: 'drifted' };
  return { label: '已观测', className: 'observed' };
}
