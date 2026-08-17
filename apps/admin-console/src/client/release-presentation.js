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
  unknown: '状态未知',
};

const WORKFLOW_LABELS = {
  'Build and push Aliyun ACR images': '构建并推送阿里云 ACR 镜像',
};

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function releaseStatusLabel(status) {
  return RELEASE_STATUS_LABELS[normalized(status)] || '状态未知';
}

export function releaseStateClass(status) {
  const value = normalized(status);
  if (['success', 'succeeded'].includes(value)) return 'success';
  if (['failure', 'failed', 'cancelled', 'canceled', 'timed_out', 'action_required'].includes(value)) return 'failure';
  if (['queued', 'requested', 'waiting', 'pending'].includes(value)) return 'queued';
  if (['building', 'in_progress', 'running'].includes(value)) return 'running';
  return 'unknown';
}

export function releaseIsActive(status) {
  return ['queued', 'requested', 'waiting', 'pending', 'building', 'in_progress', 'running']
    .includes(normalized(status));
}

export function releaseTimingVerb(status) {
  return ['queued', 'requested', 'waiting', 'pending'].includes(normalized(status)) ? '已等待' : '已运行';
}

export function releaseDuration(startAt, endAt = null, nowValue = Date.now()) {
  const started = Date.parse(startAt || '');
  const ended = endAt ? Date.parse(endAt) : Number(nowValue);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return '--';
  const totalSeconds = Math.max(0, Math.floor((ended - started) / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const pad = (value) => String(value).padStart(2, '0');
  if (days > 0) return `${days}天 ${pad(hours)}时 ${pad(minutes)}分`;
  if (totalHours > 0) return `${pad(totalHours)}时 ${pad(minutes)}分 ${pad(seconds)}秒`;
  if (totalMinutes > 0) return `${pad(totalMinutes)}分 ${pad(seconds)}秒`;
  return `${seconds}秒`;
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
