import { useCallback, useEffect, useMemo, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  DatabaseBackup,
  ExternalLink,
  FileClock,
  Fingerprint,
  Gauge,
  HardDrive,
  History,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  PackageCheck,
  Play,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  ServerCog,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  UserRoundCheck,
  UserPlus,
  Wrench,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import {
  componentObservation,
  componentHistory,
  environmentLabel,
  releaseStateClass,
  releaseDuration,
  releaseIsActive,
  releaseStatusLabel,
  releaseTimingVerb,
  runtimeImageReference,
  runtimeStateSummary,
  runtimeVersionLabel,
  runtimeVersionTitle,
  workflowNameLabel,
} from './release-presentation.js';
import { SelectControl } from './UiControls.jsx';

const STATE_LABELS = {
  healthy: '正常',
  degraded: '异常',
  offline: '离线',
  unmonitored: '未监测',
};
const INCIDENT_LABELS = { open: '待处理', acknowledged: '已确认', resolved: '已恢复' };
const ROLE_LABELS = { viewer: '只读管理员', operator: '运维管理员', super_admin: '超级管理员' };
const ACTION_LABELS = {
  'auth.login': '管理员登录',
  'auth.logout': '退出登录',
  'security.account_created': '创建管理员',
  'security.account_updated': '更新管理员',
  'security.password_changed': '修改登录密码',
  'security.totp_enrollment_started': '开始绑定动态验证',
  'security.totp_enabled': '启用动态验证',
  'security.totp_disabled': '停用动态验证',
  'security.recovery_codes_regenerated': '重置恢复码',
  'security.passkey_enrollment_started': '开始注册 Passkey',
  'security.passkey_registered': '注册 Passkey',
  'security.passkey_deleted': '删除 Passkey',
  'incident.opened': '产生事件',
  'incident.resolved': '事件恢复',
  'incident.acknowledge': '确认事件',
  'incident.mute': '静默事件',
  'incident.assign': '指派事件',
  'incident.note': '添加备注',
  'backup.started': '启动备份',
  'backup.restore': '恢复备份',
  'backup.deleted': '删除备份',
  'backup.uploaded': '上传备份',
  'backup.downloaded': '下载备份',
  'backup.backup_succeeded': '备份完成',
  'backup.backup_failed': '备份失败',
  'backup.restore_succeeded': '恢复完成',
  'backup.restore_failed': '恢复失败',
  'notification.opened': '发送告警通知',
  'notification.resolved': '发送恢复通知',
  'release.build': '触发构建',
  'release.build_succeeded': '镜像构建成功',
  'release.build_failed': '镜像构建失败',
  'release.build_cancelled': '镜像构建取消',
  'release.deploy': '部署版本',
  'release.deploy_succeeded': '生产部署成功',
  'release.deploy_failed': '生产部署失败',
  'release.deploy_rolled_back': '部署失败自动回滚',
  'release.rollback': '回滚版本',
  'release.rollback_succeeded': '生产回滚成功',
  'release.rollback_failed': '生产回滚失败',
  'release.rollback_rolled_back': '回滚失败自动恢复',
  'diagnostics.run': '运行诊断',
  'security.session_revoked': '撤销会话',
  'operations.settings_updated': '更新运维设置',
  'gateway.proxy_error': '网关请求异常',
};
const CHART_COLORS = ['#2877f7', '#11ad78', '#ff8a00', '#8a45ef', '#d75467', '#13bad6'];
function formatDateTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatRelative(value, nowValue = Date.now()) {
  const milliseconds = Number(nowValue) - Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) return '--';
  const minutes = Math.max(0, Math.round(milliseconds / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function shortValue(value, length = 12) {
  const text = String(value || '');
  return text ? text.slice(0, length) : '--';
}

function roleAtLeast(role, required) {
  return ({ viewer: 1, operator: 2, super_admin: 3 }[role] || 0) >= ({ viewer: 1, operator: 2, super_admin: 3 }[required] || 0);
}

function Feedback({ error, message }) {
  if (!error && !message) return null;
  return (
    <div className={`ops-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
      {error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}
      <span>{error || message}</span>
    </div>
  );
}

function LoadingBlock({ label = '正在加载' }) {
  return <div className="ops-loading"><LoaderCircle className="spin" size={20} /> {label}</div>;
}

function StatePill({ value }) {
  return <span className={`ops-state state-${value}`}><i />{STATE_LABELS[value] || value || '--'}</span>;
}

function SeverityPill({ value }) {
  return <span className={`ops-severity severity-${value}`}>{value === 'critical' ? '严重' : value === 'warning' ? '警告' : '提示'}</span>;
}

function MonitoringChart({ groups }) {
  const entries = Object.entries(groups).filter(([, samples]) => samples.length).slice(0, 6);
  if (!entries.length) return <div className="ops-empty">当前时间范围暂无历史样本</div>;
  const allSamples = entries.flatMap(([, samples]) => samples);
  const timestamps = allSamples.map((sample) => Date.parse(sample.recordedAt)).filter(Number.isFinite);
  const latencies = allSamples.map((sample) => sample.latencyMs).filter(Number.isFinite);
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps, start + 1);
  const maximum = Math.max(...latencies, 1);
  const minimumPositive = Math.min(...latencies.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaleLatency = (value) => useLogScale ? Math.log10(value + 1) : value;
  const scaledMaximum = scaleLatency(maximum);
  const width = 880;
  const height = 250;
  const x = (value) => 42 + ((Date.parse(value) - start) / (end - start)) * 806;
  const y = (value) => 212 - (scaleLatency(Math.min(value, maximum)) / scaledMaximum) * 164;

  return (
    <div className="ops-history-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="服务响应时间历史趋势">
        {[48, 102, 157, 212].map((position) => <line key={position} x1="40" x2="850" y1={position} y2={position} />)}
        {entries.map(([serviceId, samples], index) => {
          const points = samples
            .filter((sample) => Number.isFinite(sample.latencyMs))
            .map((sample) => `${x(sample.recordedAt)},${y(sample.latencyMs)}`)
            .join(' ');
          return points ? <polyline key={serviceId} points={points} style={{ stroke: CHART_COLORS[index] }} /> : null;
        })}
      </svg>
      <div className="ops-chart-legend">
        {entries.map(([serviceId], index) => <span key={serviceId}><i style={{ background: CHART_COLORS[index] }} />{serviceId}</span>)}
      </div>
    </div>
  );
}

export function MonitoringView({ services }) {
  const [hours, setHours] = useState(24);
  const [selected, setSelected] = useState('all');
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ hours: String(hours), limit: '3000' });
      if (selected !== 'all') query.set('serviceId', selected);
      setSamples((await requestJson(`/api/operations/history?${query}`)).samples || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [hours, selected]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => samples.reduce((result, sample) => {
    const id = sample.serviceId || selected;
    if (!result[id]) result[id] = [];
    result[id].push(sample);
    return result;
  }, {}), [samples, selected]);
  const summaries = Object.entries(groups).map(([serviceId, values]) => {
    const monitored = values.filter((sample) => !sample.maintenance && sample.state !== 'unmonitored');
    const healthy = monitored.filter((sample) => sample.state === 'healthy').length;
    const sortedLatency = monitored.map((sample) => sample.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      serviceId,
      samples: values.length,
      availability: monitored.length ? (healthy / monitored.length) * 100 : null,
      p95: sortedLatency.length ? sortedLatency[Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)] : null,
      latest: values.at(-1),
    };
  });
  const averageAvailability = summaries.filter((item) => item.availability !== null);
  const availability = averageAvailability.length
    ? averageAvailability.reduce((sum, item) => sum + item.availability, 0) / averageAvailability.length
    : null;
  const p95Values = summaries.map((item) => item.p95).filter(Number.isFinite);

  return (
    <section className="page-view ops-page" aria-label="监控分析">
      <div className="ops-toolbar">
        <div className="ops-segmented" aria-label="时间范围">
          {[1, 24, 168, 720].map((value) => <button key={value} className={hours === value ? 'active' : ''} type="button" onClick={() => setHours(value)}>{value === 1 ? '1 小时' : value === 24 ? '24 小时' : value === 168 ? '7 天' : '30 天'}</button>)}
        </div>
        <div className="ops-select-label"><span>服务</span>
          <SelectControl
            ariaLabel="筛选监控服务"
            value={selected}
            onChange={setSelected}
            options={[
              { value: 'all', label: '全部服务' },
              ...services.filter((service) => service.healthPath).map((service) => ({ value: service.id, label: service.shortName || service.name })),
            ]}
          />
        </div>
        <button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新</button>
      </div>
      <Feedback error={error} />
      <div className="ops-kpis">
        <article><Activity size={20} /><div><span>平均可用率</span><strong>{availability === null ? '--' : `${availability.toFixed(2)}%`}</strong><small>排除维护窗口</small></div></article>
        <article><Gauge size={20} /><div><span>最高 P95</span><strong>{p95Values.length ? `${Math.max(...p95Values)} ms` : '--'}</strong><small>健康检查响应</small></div></article>
        <article><History size={20} /><div><span>历史样本</span><strong>{samples.length}</strong><small>{hours === 720 ? '最近 30 天' : `最近 ${hours} 小时`}</small></div></article>
        <article><ServerCog size={20} /><div><span>监测服务</span><strong>{summaries.length}</strong><small>服务端持续采集</small></div></article>
      </div>
      <section className="ops-panel">
        <header><div><span>性能趋势</span><h3>真实响应时间序列</h3></div><Gauge size={20} /></header>
        {loading ? <LoadingBlock label="正在读取历史样本" /> : <MonitoringChart groups={groups} />}
      </section>
      <section className="ops-panel ops-table-panel">
        <div className="ops-table-head monitoring-table"><span>服务</span><span>当前</span><span>可用率</span><span>P95</span><span>样本</span><span>最近采集</span></div>
        {summaries.map((item) => (
          <div className="ops-table-row monitoring-table" key={item.serviceId}>
            <strong>{services.find((service) => service.id === item.serviceId)?.shortName || item.serviceId}</strong>
            <StatePill value={item.latest?.state} />
            <span>{item.availability === null ? '--' : `${item.availability.toFixed(2)}%`}</span>
            <span>{Number.isFinite(item.p95) ? `${item.p95} ms` : '--'}</span>
            <span>{item.samples}</span>
            <span>{formatRelative(item.latest?.recordedAt)}</span>
          </div>
        ))}
      </section>
    </section>
  );
}

export function IncidentsView({ session }) {
  const [filter, setFilter] = useState('active');
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canOperate = roleAtLeast(session.user?.role, 'operator');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = filter === 'active' ? 'open,acknowledged' : filter === 'resolved' ? 'resolved' : '';
      const query = status ? `?status=${encodeURIComponent(status)}&limit=200` : '?limit=200';
      const data = await requestJson(`/api/incidents${query}`);
      setIncidents(data.incidents || []);
      setSelectedId((current) => (data.incidents || []).some((item) => item.id === current) ? current : data.incidents?.[0]?.id || null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  const selected = incidents.find((incident) => incident.id === selectedId) || null;

  useEffect(() => {
    setAssignee(selected?.assignedTo || '');
  }, [selected?.id, selected?.assignedTo]);

  async function act(action, extra = {}) {
    if (!selected) return;
    setActing(action);
    setError('');
    setMessage('');
    try {
      await requestJson(`/api/incidents/${encodeURIComponent(selected.id)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action, note, ...extra }),
      });
      setNote('');
      setMessage(action === 'acknowledge' ? '事件已确认' : action === 'resolve' ? '事件已关闭' : action === 'mute' ? '事件已静默' : '事件已更新');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActing('');
    }
  }

  return (
    <section className="page-view ops-page" aria-label="告警事件">
      <div className="ops-toolbar">
        <div className="ops-segmented">
          {[['active', '待处理'], ['resolved', '已恢复'], ['all', '全部']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} type="button" onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新</button>
      </div>
      <Feedback error={error} message={message} />
      <div className="ops-kpis incident-kpis">
        <article><BellRing size={20} /><div><span>当前列表</span><strong>{incidents.length}</strong><small>符合筛选条件</small></div></article>
        <article><AlertTriangle size={20} /><div><span>严重事件</span><strong>{incidents.filter((item) => item.severity === 'critical').length}</strong><small>优先处理</small></div></article>
        <article><UserRoundCheck size={20} /><div><span>已确认</span><strong>{incidents.filter((item) => item.status === 'acknowledged').length}</strong><small>正在跟进</small></div></article>
        <article><CheckCircle2 size={20} /><div><span>已恢复</span><strong>{incidents.filter((item) => item.status === 'resolved').length}</strong><small>自动或手动关闭</small></div></article>
      </div>
      <div className="incident-workspace">
        <section className="ops-panel incident-list-panel">
          {loading ? <LoadingBlock label="正在读取事件" /> : incidents.length ? incidents.map((incident) => (
            <button type="button" className={`incident-list-row ${selectedId === incident.id ? 'selected' : ''}`} key={incident.id} onClick={() => setSelectedId(incident.id)}>
              <span className={`incident-mark severity-${incident.severity}`}><CircleAlert size={17} /></span>
              <span><strong>{incident.title}</strong><small>{incident.description}</small></span>
              <span><SeverityPill value={incident.severity} /><small>{formatRelative(incident.lastSeenAt)}</small></span>
              <ChevronRight size={16} />
            </button>
          )) : <div className="ops-empty">当前没有事件</div>}
        </section>
        <aside className="ops-panel incident-detail-panel">
          {selected ? (
            <>
              <header><div><span>{selected.serviceId || selected.source}</span><h3>{selected.title}</h3></div><SeverityPill value={selected.severity} /></header>
              <p>{selected.description}</p>
              <dl className="ops-detail-grid">
                <div><dt>状态</dt><dd>{INCIDENT_LABELS[selected.status] || selected.status}</dd></div>
                <div><dt>首次发生</dt><dd>{formatDateTime(selected.firstSeenAt)}</dd></div>
                <div><dt>最近观测</dt><dd>{formatDateTime(selected.lastSeenAt)}</dd></div>
                <div><dt>负责人</dt><dd>{selected.assignedTo || '未指派'}</dd></div>
              </dl>
              <div className="incident-timeline">
                {(selected.timeline || []).slice(-8).reverse().map((event, index) => <div key={`${event.at}-${index}`}><i /><span><strong>{event.message}</strong><small>{event.actor} · {formatDateTime(event.at)}</small></span></div>)}
              </div>
              {canOperate && selected.status !== 'resolved' && (
                <div className="incident-actions">
                  <div className="incident-assignment">
                    <label>负责人<input value={assignee} maxLength={100} onChange={(event) => setAssignee(event.target.value)} placeholder="管理员账号" /></label>
                    <button type="button" onClick={() => act('assign', { assignedTo: assignee })} disabled={Boolean(acting) || !assignee}><UserRoundCheck size={16} />指派</button>
                  </div>
                  <label>处理备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="记录判断和处理结果" /></label>
                  <div>
                    <button type="button" onClick={() => act('note')} disabled={Boolean(acting) || !note.trim()}><MessageSquareText size={16} />记录备注</button>
                    {selected.status === 'open' && <button type="button" onClick={() => act('acknowledge')} disabled={Boolean(acting)}><Check size={16} />确认</button>}
                    <button type="button" onClick={() => act('mute', { muteMinutes: 60 })} disabled={Boolean(acting)}><Clock3 size={16} />静默 1 小时</button>
                    <button className="primary-button" type="button" onClick={() => act('resolve')} disabled={Boolean(acting)}>{acting === 'resolve' ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}关闭事件</button>
                  </div>
                </div>
              )}
            </>
          ) : <div className="ops-empty">选择一个事件查看详情</div>}
        </aside>
      </div>
    </section>
  );
}

export function ReleasesView({ session }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());
  const [historyTab, setHistoryTab] = useState('builds');
  const [targets, setTargets] = useState(['platform']);
  const [credentials, setCredentials] = useState({ password: '', totp: '' });
  const [operation, setOperation] = useState({
    action: 'deploy', buildId: '', sourceDeploymentId: '', components: [], confirmText: '',
    password: '', totp: '', maintenanceApproved: false,
  });
  const [preflight, setPreflight] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await requestJson('/api/releases')); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const hasActiveOperations = Boolean(data?.metrics?.activeOperations)
    || (data?.runs || []).some((run) => releaseIsActive(run.conclusion || run.status));
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, hasActiveOperations ? 10000 : 60000);
    return () => window.clearInterval(timer);
  }, [hasActiveOperations, load]);
  useEffect(() => {
    if (!hasActiveOperations) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') setClockNow(Date.now());
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [hasActiveOperations]);

  function toggleTarget(target) {
    setTargets((current) => current.includes(target) ? current.filter((value) => value !== target) : [...current, target]);
  }

  function selectBuild(build) {
    setHistoryTab('builds');
    setPreflight(null);
    setOperation({
      action: 'deploy', buildId: build.id, sourceDeploymentId: '',
      components: (build.artifacts || []).map((artifact) => artifact.component),
      confirmText: '', password: '', totp: '', maintenanceApproved: false,
    });
  }

  function selectLatestUpdates() {
    const build = (data?.builds || []).find((item) => item.id === data?.metrics?.latestBuildId);
    const components = data?.metrics?.availableUpdateComponents || [];
    if (!build || !components.length) return;
    setHistoryTab('builds');
    setPreflight(null);
    setOperation({
      action: 'deploy', buildId: build.id, sourceDeploymentId: '', components,
      confirmText: '', password: '', totp: '', maintenanceApproved: false,
    });
  }

  function selectRollback(deployment) {
    setHistoryTab('deployments');
    setPreflight(null);
    setOperation({
      action: 'rollback', buildId: '', sourceDeploymentId: deployment.id,
      components: [...(deployment.components || [])],
      confirmText: '', password: '', totp: '', maintenanceApproved: false,
    });
  }

  function toggleOperationComponent(component) {
    setPreflight(null);
    setOperation((current) => ({
      ...current,
      components: current.components.includes(component)
        ? current.components.filter((value) => value !== component)
        : [...current.components, component],
      confirmText: '',
      maintenanceApproved: component === 'mongodb' ? false : current.maintenanceApproved,
    }));
  }

  async function triggerBuild() {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await requestJson('/api/releases/build', {
        method: 'POST',
        body: JSON.stringify({ targets, ...credentials }),
      });
      setCredentials({ password: '', totp: '' });
      setMessage('构建任务已提交到 GitHub Actions');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function runPreflight() {
    setSubmitting(true);
    setError('');
    setMessage('');
    setPreflight(null);
    try {
      const result = await requestJson('/api/releases/preflight', {
        method: 'POST',
        body: JSON.stringify({
          action: operation.action,
          components: operation.components,
          maintenanceApproved: operation.maintenanceApproved,
        }),
      });
      setPreflight(result);
      setMessage('发布前检查已通过');
    } catch (requestError) {
      if (requestError.details?.checks) setPreflight(requestError.details);
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerDeployment() {
    const required = `${operation.action === 'rollback' ? 'ROLLBACK' : 'DEPLOY'} ${operation.components.join(',')}`;
    if (operation.confirmText !== required) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await requestJson('/api/releases/deploy', {
        method: 'POST',
        body: JSON.stringify(operation),
      });
      setMessage(operation.action === 'rollback' ? '回滚任务已进入受控执行队列' : '部署任务已进入受控执行队列');
      setOperation((current) => ({ ...current, confirmText: '', password: '', totp: '' }));
      setPreflight(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) return <section className="page-view ops-page"><LoadingBlock label="正在读取发布状态" /></section>;
  const capabilities = data?.capabilities || {};
  const metrics = data?.metrics || {};
  const successRate = metrics.completedBuilds ? Math.round((metrics.successfulBuilds / metrics.completedBuilds) * 100) : null;
  const buildRows = (data?.builds || []).length
    ? data.builds
    : (data?.runs || []).map((run) => ({
      ...run,
      status: run.conclusion || run.status,
      workflowRun: { url: run.url, actor: run.actor, event: run.event },
      targets: [],
      legacy: true,
    }));
  const deployments = data?.deployments || [];
  const selectedSource = operation.action === 'deploy'
    ? (data?.builds || []).find((build) => build.id === operation.buildId)
    : deployments.find((deployment) => deployment.id === operation.sourceDeploymentId);
  const availableArtifacts = selectedSource?.artifacts || [];
  const confirmation = `${operation.action === 'rollback' ? 'ROLLBACK' : 'DEPLOY'} ${operation.components.join(',')}`;
  const operationAllowed = operation.action === 'rollback' ? capabilities.canRollback : capabilities.canDeploy;
  const totpReady = !session.user?.totpEnabled || operation.totp.length === 6;
  const mode = capabilities.canDeploy ? '受控发布' : capabilities.canBuild ? '仅构建' : '只读';
  return (
    <section className="page-view ops-page" aria-label="发布中心">
      <div className="ops-toolbar">
        <div className="release-capabilities">
          <span className={`integration-state ${capabilities.githubConfigured ? 'ready' : ''}`}><i />{capabilities.githubConfigured ? 'GitHub 已连接' : 'GitHub 未配置'}</span>
          <span className={`integration-state ${capabilities.deployRunnerHealthy ? 'ready' : ''}`}><i />{capabilities.deployRunnerHealthy ? '部署执行器已连接' : capabilities.deployRunnerConfigured ? '部署执行器不可用' : '部署执行器未配置'}</span>
          <span className="release-environment"><Cloud size={15} />{environmentLabel(data?.environment)}</span>
          {data?.metrics?.availableUpdates > 0 && <span className="integration-state ready"><i />{data.metrics.availableUpdates} 个更新可用</span>}
        </div>
        <div className="release-capabilities">
          {roleAtLeast(session.user?.role, 'super_admin') && data?.metrics?.availableUpdates > 0 && <button className="primary-button" type="button" onClick={selectLatestUpdates} disabled={!capabilities.canDeploy || loading}><Rocket size={17} />一键更新</button>}
          <button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />检查更新</button>
        </div>
      </div>
      <Feedback error={error || capabilities.issue} message={message} />
      <div className="ops-kpis">
        <article><Rocket size={20} /><div><span>平台版本</span><strong>{data?.revision?.slice(0, 12) || '--'}</strong><small>{data?.imageBuiltAt ? `镜像构建 ${formatDateTime(data.imageBuiltAt)}` : '等待镜像版本标识'}</small></div></article>
        <article><PackageCheck size={20} /><div><span>运行观测</span><strong>{metrics.observedComponents || 0}/{data?.components?.length || 0}</strong><small>实际运行组件</small></div></article>
        <article className={metrics.driftCount ? 'warning' : ''}><AlertTriangle size={20} /><div><span>版本漂移</span><strong>{metrics.driftCount || 0}</strong><small>{metrics.driftCount ? '期望与实际不一致' : '未发现版本漂移'}</small></div></article>
        <article><ShieldCheck size={20} /><div><span>操作模式</span><strong>{mode}</strong><small>{successRate === null ? '暂无持久化构建结果' : `最近构建成功率 ${successRate}%`}</small></div></article>
      </div>

      <section className="ops-panel release-inventory">
        <header><div><span>生产事实源</span><h3>组件版本与运行状态</h3></div><HardDrive size={20} /></header>
        <div className="release-inventory-head"><span>组件</span><span>期望镜像</span><span>实际镜像版本</span><span>生命周期</span><span>状态</span></div>
        {(data?.components || []).map((component) => {
          const observation = componentObservation(component);
          const history = componentHistory(component, data?.builds, data?.deployments);
          const actualImage = runtimeImageReference(component.runtime);
          return (
            <div className={`release-inventory-row ${component.inSync === false ? 'drift' : ''}`} key={component.id}>
              <span><strong>{component.id}</strong><small>{component.serviceId}</small></span>
              <span className="release-reference"><strong title={component.desiredImage || ''}>{component.desiredImage || '未配置'}</strong><small>{component.configured ? '环境配置已声明' : '环境配置缺失'}</small></span>
              <span className="release-reference release-runtime-reference">
                <strong title={actualImage}>{actualImage}</strong>
                <small title={runtimeVersionTitle(component.runtime)}>{runtimeVersionLabel(component.runtime)}</small>
                <small>{runtimeStateSummary(component.runtime)}</small>
              </span>
              <span className="release-lifecycle">
                <small title={history.buildId || ''}><b>构建</b>{formatDateTime(history.buildAt)}</small>
                <small title={history.deploymentId || ''}><b>部署</b>{formatDateTime(history.deploymentAt)}</small>
                <small title={component.runtime?.startedAt || ''}><b>启动</b>{formatDateTime(component.runtime?.startedAt)}{component.runtime?.startedAt ? ` · ${formatRelative(component.runtime.startedAt)}` : ''}</small>
              </span>
              <span className={`release-sync ${observation.className}`}><i />{observation.label}</span>
            </div>
          );
        })}
      </section>

      <section className="ops-panel release-history">
        <header>
          <div><span>发布记录</span><h3>{historyTab === 'builds' ? '构建与产物' : '部署与回滚'}</h3></div>
          <div className="ops-segmented">
            <button type="button" className={historyTab === 'builds' ? 'active' : ''} onClick={() => setHistoryTab('builds')}>构建</button>
            <button type="button" className={historyTab === 'deployments' ? 'active' : ''} onClick={() => setHistoryTab('deployments')}>部署</button>
          </div>
        </header>
        {(historyTab === 'builds' ? buildRows.length : deployments.length) > 0 && (
          <div className="release-history-head" aria-hidden="true">
            <span /><span>版本 / 任务</span><span>执行人</span><span>执行时间</span><span>耗时 / 同步</span><span>状态</span><span>操作</span>
          </div>
        )}
        {historyTab === 'builds' && (buildRows.length ? buildRows.map((build) => (
          <div className="release-history-row" key={build.id}>
            <span className={`run-state ${releaseStateClass(build.status)}`}><i /></span>
            <span className="release-run-source"><strong>{shortValue(build.revision || build.id)}</strong><small>{build.targets?.length ? build.targets.join('、') : workflowNameLabel(build.name)}</small></span>
            <span className="release-run-actor"><strong>{build.requestedBy || build.workflowRun?.actor || '--'}</strong><small>构建发起人</small></span>
            <span className="release-run-date"><strong>{formatDateTime(releaseIsActive(build.status) ? build.startedAt || build.createdAt : build.completedAt || build.updatedAt || build.createdAt)}</strong><small>{releaseIsActive(build.status) ? '开始时间' : '完成时间'}</small></span>
            <span className="release-run-duration">
              <strong className={releaseIsActive(build.status) ? 'live' : ''}>{releaseIsActive(build.status) ? `${releaseTimingVerb(build.status)} ${releaseDuration(build.startedAt || build.createdAt, null, clockNow)}` : releaseDuration(build.startedAt || build.createdAt, build.completedAt || build.updatedAt)}</strong>
              <small>{releaseIsActive(build.status) ? `同步 ${releaseDuration(data?.refreshedAt || build.updatedAt, null, clockNow)}前` : '总耗时'}</small>
            </span>
            <span className={`release-status status-${releaseStateClass(build.status)}`}>{releaseStatusLabel(build.status)}</span>
            <span className="release-row-actions">
              {build.workflowRun?.url && <a href={build.workflowRun.url} target="_blank" rel="noreferrer" aria-label="打开 GitHub 运行记录"><ExternalLink size={15} /></a>}
              {roleAtLeast(session.user?.role, 'super_admin') && build.status === 'succeeded' && build.artifacts?.length > 0 && <button type="button" onClick={() => selectBuild(build)} disabled={!capabilities.canDeploy}><Rocket size={15} />部署</button>}
            </span>
          </div>
        )) : <div className="ops-empty">暂无构建记录</div>)}
        {historyTab === 'deployments' && (deployments.length ? deployments.map((deployment) => (
          <div className="release-history-row" key={deployment.id}>
            <span className={`run-state ${releaseStateClass(deployment.status)}`}><i /></span>
            <span className="release-run-source"><strong>{deployment.action === 'rollback' ? '回滚' : '部署'} · {shortValue(deployment.buildId || deployment.sourceDeploymentId)}</strong><small>{deployment.components.join('、')}</small></span>
            <span className="release-run-actor"><strong>{deployment.requestedBy || '--'}</strong><small>操作发起人</small></span>
            <span className="release-run-date"><strong>{formatDateTime(releaseIsActive(deployment.status) ? deployment.startedAt || deployment.createdAt : deployment.completedAt || deployment.updatedAt || deployment.createdAt)}</strong><small>{releaseIsActive(deployment.status) ? '开始时间' : '完成时间'}</small></span>
            <span className="release-run-duration">
              <strong className={releaseIsActive(deployment.status) ? 'live' : ''}>{releaseIsActive(deployment.status) ? `${releaseTimingVerb(deployment.status)} ${releaseDuration(deployment.startedAt || deployment.createdAt, null, clockNow)}` : releaseDuration(deployment.startedAt || deployment.createdAt, deployment.completedAt || deployment.updatedAt)}</strong>
              <small>{releaseIsActive(deployment.status) ? `同步 ${releaseDuration(data?.refreshedAt || deployment.updatedAt, null, clockNow)}前` : '总耗时'}</small>
            </span>
            <span className={`release-status status-${releaseStateClass(deployment.status)}`}>{releaseStatusLabel(deployment.status)}</span>
            <span className="release-row-actions">
              {roleAtLeast(session.user?.role, 'super_admin') && deployment.status === 'succeeded' && <button type="button" onClick={() => selectRollback(deployment)} disabled={!capabilities.canRollback}><RotateCcw size={15} />回滚到此版本</button>}
            </span>
          </div>
        )) : <div className="ops-empty">暂无部署记录</div>)}
      </section>

      {roleAtLeast(session.user?.role, 'super_admin') && (
        <section className="ops-panel protected-operation">
          <header><div><span>受保护操作</span><h3>重新构建生产镜像</h3></div><LockKeyhole size={20} /></header>
          {!capabilities.canBuild && <div className="release-disabled-reason"><CircleAlert size={16} /><span>{capabilities.reasons?.build?.join('；') || '构建操作不可用'}</span></div>}
          <div className="release-targets">
            {(data?.components || []).map((component) => <label key={component.id}><input type="checkbox" checked={targets.includes(component.id)} onChange={() => toggleTarget(component.id)} /><span>{component.id}</span></label>)}
          </div>
          <div className="reauth-fields">
            <label>管理员密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>
            {session.user?.totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}
            <button className="primary-button" type="button" disabled={!capabilities.canBuild || !targets.length || !credentials.password || (session.user?.totpEnabled && credentials.totp.length !== 6) || submitting} onClick={triggerBuild}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Rocket size={17} />}触发构建</button>
          </div>
        </section>
      )}

      {roleAtLeast(session.user?.role, 'super_admin') && selectedSource && (
        <section className="ops-panel protected-operation deployment-operation">
          <header><div><span>受控执行</span><h3>{operation.action === 'rollback' ? '回滚历史成功版本' : '部署不可变构建产物'}</h3></div><ShieldCheck size={20} /></header>
          {!operationAllowed && <div className="release-disabled-reason"><CircleAlert size={16} /><span>{capabilities.reasons?.[operation.action === 'rollback' ? 'rollback' : 'deploy']?.join('；') || '当前操作不可用'}</span></div>}
          <div className="release-operation-source">
            <span><strong>{operation.action === 'rollback' ? shortValue(selectedSource.buildId || selectedSource.id) : shortValue(selectedSource.revision || selectedSource.id)}</strong><small>{availableArtifacts.length} 个不可变产物</small></span>
            <button type="button" onClick={() => { setOperation((current) => ({ ...current, buildId: '', sourceDeploymentId: '', components: [] })); setPreflight(null); }} aria-label="关闭发布操作"><XCircle size={18} /></button>
          </div>
          <div className="release-targets">
            {availableArtifacts.map((artifact) => <label key={artifact.component}><input type="checkbox" checked={operation.components.includes(artifact.component)} onChange={() => toggleOperationComponent(artifact.component)} /><span>{artifact.component} · {shortValue(artifact.digest, 18)}</span></label>)}
          </div>
          {preflight?.checks?.length > 0 && <div className="release-preflight-list">
            {preflight.checks.map((check) => <div key={check.id} className={`check-${check.status}`}><span>{check.status === 'passed' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}
          </div>}
          <div className="deployment-fields">
            <label>管理员密码<input type="password" autoComplete="current-password" value={operation.password} onChange={(event) => setOperation({ ...operation, password: event.target.value })} /></label>
            {session.user?.totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={operation.totp} onChange={(event) => setOperation({ ...operation, totp: event.target.value.replace(/\D/g, '') })} /></label>}
            {operation.components.includes('mongodb') && <label className="release-maintenance-confirm"><input type="checkbox" checked={operation.maintenanceApproved} onChange={(event) => { setPreflight(null); setOperation({ ...operation, maintenanceApproved: event.target.checked, confirmText: '' }); }} /><span>确认 MongoDB 维护窗口</span></label>}
            <label className="wide">确认短语<input value={operation.confirmText} onChange={(event) => setOperation({ ...operation, confirmText: event.target.value })} placeholder={confirmation} /></label>
            <button className="secondary-action" type="button" onClick={runPreflight} disabled={!operationAllowed || !operation.components.length || submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}运行预检</button>
            <button className="primary-button" type="button" onClick={triggerDeployment} disabled={
              !operationAllowed || !preflight?.ok || !operation.components.length || !operation.password || !totpReady || submitting
              || operation.confirmText !== confirmation
            }>{submitting ? <LoaderCircle className="spin" size={17} /> : operation.action === 'rollback' ? <RotateCcw size={17} /> : <Rocket size={17} />}{operation.action === 'rollback' ? '提交回滚' : '提交部署'}</button>
          </div>
        </section>
      )}
    </section>
  );
}

export function SecurityAuditView({ session, onLogout }) {
  const [tab, setTab] = useState('audit');
  const [events, setEvents] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState({ password: '', totp: '' });
  const [enrollment, setEnrollment] = useState(null);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [passkeyName, setPasskeyName] = useState('');
  const [newAccount, setNewAccount] = useState({ username: '', password: '', role: 'viewer' });
  const [newPassword, setNewPassword] = useState('');
  const [accountRoles, setAccountRoles] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const canManageAccounts = roleAtLeast(session.user?.role, 'super_admin');
      const [auditResult, sessionsResult, passkeyResult, accountResult] = await Promise.all([
        requestJson('/api/audit?limit=200'),
        requestJson('/api/security/sessions'),
        requestJson('/api/security/passkeys'),
        canManageAccounts ? requestJson('/api/security/accounts') : Promise.resolve({ accounts: [] }),
      ]);
      setEvents(auditResult.events || []);
      setSessionData(sessionsResult);
      setPasskeys(passkeyResult.passkeys || []);
      setAccounts(accountResult.accounts || []);
      setAccountRoles(Object.fromEntries((accountResult.accounts || []).map((account) => [account.username, account.role])));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [session.user?.role]);
  useEffect(() => { load(); }, [load]);

  async function revoke(nonce) {
    setError('');
    setMessage('');
    try {
      const result = await requestJson(`/api/security/sessions/${encodeURIComponent(nonce)}`, { method: 'DELETE' });
      if (result.current) {
        onLogout();
        return;
      }
      setMessage('会话已撤销');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function sensitiveBody(extra = {}) {
    return JSON.stringify({ ...extra, password: credentials.password, totp: credentials.totp });
  }

  async function runSensitive(action) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const shouldReload = await action();
      setCredentials({ password: '', totp: '' });
      if (shouldReload !== false) await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function beginTotpEnrollment() {
    await runSensitive(async () => {
      const result = await requestJson('/api/security/totp/enrollment', { method: 'POST', body: sensitiveBody() });
      setEnrollment(result.enrollment);
      setRecoveryCodes([]);
      setMessage('动态验证注册已创建');
    });
  }

  async function confirmTotpEnrollment() {
    setSubmitting(true);
    setError('');
    try {
      const result = await requestJson('/api/security/totp/confirm', {
        method: 'POST',
        body: JSON.stringify({ totp: enrollmentCode }),
      });
      setEnrollment(null);
      setEnrollmentCode('');
      setRecoveryCodes(result.recoveryCodes || []);
      setMessage('动态验证已启用');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function registerPasskey() {
    await runSensitive(async () => {
      const generated = await requestJson('/api/security/passkeys/options', { method: 'POST', body: sensitiveBody() });
      const response = await startRegistration({ optionsJSON: generated.options });
      await requestJson('/api/security/passkeys/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: generated.challengeId, response, name: passkeyName || 'Passkey' }),
      });
      setPasskeyName('');
      setMessage('Passkey 已注册');
    });
  }

  async function createAccount() {
    await runSensitive(async () => {
      await requestJson('/api/security/accounts', {
        method: 'POST',
        body: sensitiveBody({ username: newAccount.username, newPassword: newAccount.password, role: newAccount.role }),
      });
      setNewAccount({ username: '', password: '', role: 'viewer' });
      setMessage('管理员账号已创建');
    });
  }

  async function regenerateRecoveryCodes() {
    await runSensitive(async () => {
      const result = await requestJson('/api/security/totp/recovery-codes', { method: 'POST', body: sensitiveBody() });
      setRecoveryCodes(result.recoveryCodes || []);
      setMessage('恢复码已重置，旧恢复码已全部失效');
    });
  }

  async function disableTotp() {
    await runSensitive(async () => {
      const result = await requestJson('/api/security/totp', { method: 'DELETE', body: sensitiveBody() });
      if (result.currentSessionRevoked) {
        onLogout();
        return false;
      }
      setMessage('动态验证已停用');
      return true;
    });
  }

  async function updateAccount(account, patch) {
    await runSensitive(async () => {
      const result = await requestJson(`/api/security/accounts/${encodeURIComponent(account.username)}`, {
        method: 'PATCH',
        body: sensitiveBody({ role: accountRoles[account.username] || account.role, ...patch }),
      });
      if (result.currentSessionRevoked) {
        onLogout();
        return false;
      }
      setMessage('管理员账号已更新');
      return true;
    });
  }

  async function changePassword() {
    await runSensitive(async () => {
      const result = await requestJson('/api/security/password', {
        method: 'POST',
        body: sensitiveBody({ newPassword }),
      });
      if (result.currentSessionRevoked) {
        setNewPassword('');
        onLogout();
        return false;
      }
      return true;
    });
  }

  const totpEnabled = Boolean(sessionData?.security?.totpEnabled);
  const canManageAccounts = roleAtLeast(session.user?.role, 'super_admin');

  const failures = events.filter((event) => event.outcome === 'failure').length;
  return (
    <section className="page-view ops-page" aria-label="安全审计">
      <div className="ops-toolbar"><div className="ops-segmented"><button type="button" className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>审计日志</button><button type="button" className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>登录会话</button><button type="button" className={tab === 'authenticators' ? 'active' : ''} onClick={() => setTab('authenticators')}>认证方式</button>{canManageAccounts && <button type="button" className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>管理员</button>}</div><button className="secondary-action" type="button" onClick={load}><RefreshCw size={17} />刷新</button></div>
      <Feedback error={error} message={message} />
      <div className="ops-kpis">
        <article><ShieldCheck size={20} /><div><span>当前角色</span><strong>{ROLE_LABELS[session.user?.role] || session.user?.role}</strong><small>最小权限控制</small></div></article>
        <article><KeyRound size={20} /><div><span>动态验证</span><strong>{totpEnabled ? '已启用' : '未启用'}</strong><small>{totpEnabled ? `剩余 ${sessionData?.security?.recoveryCodesRemaining || 0} 个恢复码` : '等待绑定'}</small></div></article>
        <article><UserRoundCheck size={20} /><div><span>有效会话</span><strong>{sessionData?.sessions?.length || 0}</strong><small>支持远程下线</small></div></article>
        <article><XCircle size={20} /><div><span>失败事件</span><strong>{failures}</strong><small>最近 200 条审计</small></div></article>
      </div>
      {loading ? <LoadingBlock /> : tab === 'audit' ? (
        <section className="ops-panel ops-table-panel">
          <div className="ops-table-head audit-table"><span>时间</span><span>操作</span><span>操作者</span><span>目标</span><span>来源 IP</span><span>结果</span></div>
          {events.map((event) => <div className="ops-table-row audit-table" key={event.id}><span>{formatDateTime(event.occurredAt)}</span><strong>{ACTION_LABELS[event.action] || event.action}</strong><span>{event.actor}</span><span className="audit-target"><strong>{event.targetId || event.targetType}</strong><small>{event.requestId || event.details?.errorKind || ''}</small></span><span>{event.ip || '--'}</span><span className={`audit-outcome ${event.outcome}`}>{event.outcome === 'success' ? '成功' : '失败'}</span></div>)}
        </section>
      ) : tab === 'sessions' ? (
        <section className="ops-panel session-list">
          {(sessionData?.sessions || []).map((item) => <div className="session-row" key={item.nonce}><span className={item.nonce === sessionData.currentNonce ? 'current' : ''}><UserRoundCheck size={18} /></span><span><strong>{item.subject} · {ROLE_LABELS[item.role] || item.role}</strong><small>{item.ip || '未知 IP'} · {item.userAgent || '未知客户端'}</small></span><span><strong>{item.nonce === sessionData.currentNonce ? '当前会话' : formatRelative(item.createdAt)}</strong><small>空闲到期 {formatDateTime(item.idleExpiresAt || item.expiresAt)}</small></span>{roleAtLeast(session.user?.role, 'super_admin') && <button type="button" onClick={() => revoke(item.nonce)}><XCircle size={16} />下线</button>}</div>)}
        </section>
      ) : tab === 'authenticators' ? (
        <div className="security-auth-layout">
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><KeyRound size={18} /></span><div><strong>动态验证</strong><small>{totpEnabled ? '已启用' : '未启用'}</small></div></div>
            {!enrollment && <div className="ops-inline-form"><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>当前动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={beginTotpEnrollment}><KeyRound size={17} />{totpEnabled ? '重新绑定' : '绑定 TOTP'}</button></div>}
            {enrollment && <div className="totp-enrollment"><img src={enrollment.qrDataUrl} alt="TOTP 二维码" /><code>{enrollment.secret}</code><div className="ops-inline-form"><label>动态验证码<input inputMode="numeric" maxLength={6} value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value.replace(/\D/g, ''))} /></label><button className="primary-button" type="button" disabled={submitting || enrollmentCode.length !== 6} onClick={confirmTotpEnrollment}><Check size={17} />确认绑定</button></div></div>}
            {recoveryCodes.length > 0 && <div className="recovery-code-grid">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>}
            {totpEnabled && !enrollment && <div className="security-auth-actions">
              <button className="secondary-action" type="button" disabled={submitting || !credentials.password || credentials.totp.length !== 6} onClick={regenerateRecoveryCodes}><RefreshCw size={16} />重置恢复码</button>
              <button className="danger-action" type="button" disabled={submitting || !credentials.password || credentials.totp.length !== 6 || session.mfaRequired} onClick={disableTotp}><XCircle size={16} />停用 TOTP</button>
            </div>}
          </section>
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><Fingerprint size={18} /></span><div><strong>Passkey</strong><small>{passkeys.length} 个凭据</small></div></div>
            <div className="ops-inline-form"><label>凭据名称<input value={passkeyName} maxLength={64} onChange={(event) => setPasskeyName(event.target.value)} /></label><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={registerPasskey}><Fingerprint size={17} />注册 Passkey</button></div>
            <div className="passkey-list">{passkeys.map((item) => <div className="session-row" key={item.id}><span><Fingerprint size={18} /></span><span><strong>{item.name || 'Passkey'}</strong><small>{item.deviceType || '设备凭据'} · {formatDateTime(item.createdAt)}</small></span><button type="button" onClick={() => runSensitive(async () => { await requestJson(`/api/security/passkeys/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: sensitiveBody() }); setMessage('Passkey 已删除'); })}><XCircle size={16} />删除</button></div>)}</div>
          </section>
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><LockKeyhole size={18} /></span><div><strong>登录密码</strong><small>修改后所有会话下线</small></div></div>
            <div className="ops-inline-form"><label>新密码<input type="password" minLength={15} maxLength={256} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || newPassword.length < 15 || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={changePassword}><Save size={17} />修改密码</button></div>
          </section>
        </div>
      ) : (
        <div className="security-auth-layout">
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><UserPlus size={18} /></span><div><strong>创建管理员</strong><small>独立账号</small></div></div>
            <div className="ops-inline-form"><label>账号<input value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value })} /></label><label>新密码<input type="password" minLength={15} maxLength={256} autoComplete="new-password" value={newAccount.password} onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })} /></label><label>角色<SelectControl ariaLabel="管理员角色" value={newAccount.role} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} onChange={(role) => setNewAccount({ ...newAccount, role })} /></label><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || !newAccount.username || newAccount.password.length < 15 || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={createAccount}><UserPlus size={17} />创建账号</button></div>
          </section>
          <section className="ops-panel session-list account-list">{accounts.map((account) => <div className="session-row account-row" key={account.username}>
            <span className={account.active ? 'current' : ''}><UserRoundCheck size={18} /></span>
            <span><strong>{account.username}</strong><small>{account.active ? '正常' : '已停用'} · TOTP {account.totpEnabled ? '已启用' : '未启用'} · Passkey {account.passkeyCount}</small></span>
            <SelectControl ariaLabel={`${account.username} 的角色`} value={accountRoles[account.username] || account.role} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} onChange={(role) => setAccountRoles((current) => ({ ...current, [account.username]: role }))} />
            <button type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6) || accountRoles[account.username] === account.role} onClick={() => updateAccount(account, {})}><Save size={16} />保存角色</button>
            <button type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={() => updateAccount(account, { active: !account.active })}>{account.active ? <XCircle size={16} /> : <Check size={16} />}{account.active ? '停用' : '启用'}</button>
          </div>)}</section>
        </div>
      )}
    </section>
  );
}

export function SettingsDiagnosticsView({ session }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [maintenance, setMaintenance] = useState({ serviceId: 'all', duration: 60, reason: '' });
  const canSave = roleAtLeast(session.user?.role, 'super_admin');
  const canDiagnose = roleAtLeast(session.user?.role, 'operator');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await requestJson('/api/operations/settings');
      setData(result);
      setDraft(result.settings);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/operations/settings', { method: 'PUT', body: JSON.stringify(draft) });
      setDraft(result.settings);
      setMessage('运行设置已保存');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function addMaintenance() {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + Number(maintenance.duration) * 60000);
    setDraft({
      ...draft,
      maintenanceWindows: [...(draft.maintenanceWindows || []), {
        id: crypto.randomUUID(), serviceId: maintenance.serviceId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: maintenance.reason || '计划维护', createdBy: session.user?.username,
      }],
    });
    setMaintenance({ ...maintenance, reason: '' });
  }

  async function runDiagnostics() {
    setRunning(true);
    setError('');
    try { setDiagnostics(await requestJson('/api/diagnostics/run', { method: 'POST' })); } catch (requestError) { setError(requestError.message); } finally { setRunning(false); }
  }

  if (loading || !draft) return <section className="page-view ops-page"><LoadingBlock label="正在读取运行设置" /></section>;
  return (
    <section className="page-view ops-page" aria-label="系统设置与诊断">
      <div className="ops-toolbar"><span className="integration-state ready"><i />配置不包含任何敏感值</span>{canSave && <button className="primary-button compact" type="button" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}保存设置</button>}</div>
      <Feedback error={error} message={message} />
      <div className="settings-layout">
        <section className="ops-panel settings-section">
          <header><div><span>监控与告警</span><h3>采集和事件阈值</h3></div><Settings2 size={20} /></header>
          <div className="settings-grid">
            <label className="toggle-field"><span><strong>企业微信告警</strong><small>事件产生和恢复时推送</small></span><input type="checkbox" checked={draft.alertingEnabled} disabled={!canSave} onChange={(event) => setDraft({ ...draft, alertingEnabled: event.target.checked })} /></label>
            <div className="settings-control-field"><span>监控间隔</span><SelectControl ariaLabel="监控间隔" disabled={!canSave} value={draft.monitorIntervalMs} onChange={(value) => setDraft({ ...draft, monitorIntervalMs: value })} options={[{ value: 10000, label: '10 秒' }, { value: 30000, label: '30 秒' }, { value: 60000, label: '1 分钟' }, { value: 300000, label: '5 分钟' }]} /></div>
            <label><span>连续失败次数</span><input type="number" min="1" max="10" disabled={!canSave} value={draft.failureThreshold} onChange={(event) => setDraft({ ...draft, failureThreshold: Number(event.target.value) })} /></label>
            <label><span>连续恢复次数</span><input type="number" min="1" max="10" disabled={!canSave} value={draft.recoveryThreshold} onChange={(event) => setDraft({ ...draft, recoveryThreshold: Number(event.target.value) })} /></label>
            <label><span>健康检查延迟阈值（ms）</span><input type="number" min="100" max="30000" disabled={!canSave} value={draft.serviceLatencyThresholdMs} onChange={(event) => setDraft({ ...draft, serviceLatencyThresholdMs: Number(event.target.value) })} /></label>
            <label><span>网关 P95 阈值（ms）</span><input type="number" min="100" max="120000" disabled={!canSave} value={draft.proxyP95ThresholdMs} onChange={(event) => setDraft({ ...draft, proxyP95ThresholdMs: Number(event.target.value) })} /></label>
            <label><span>网关 5xx 阈值（%）</span><input type="number" min="1" max="100" disabled={!canSave} value={draft.proxyErrorRatePercent} onChange={(event) => setDraft({ ...draft, proxyErrorRatePercent: Number(event.target.value) })} /></label>
            <label><span>磁盘使用率阈值（%）</span><input type="number" min="50" max="99" disabled={!canSave} value={draft.diskUsageThresholdPercent} onChange={(event) => setDraft({ ...draft, diskUsageThresholdPercent: Number(event.target.value) })} /></label>
          </div>
        </section>
        <section className="ops-panel settings-section">
          <header><div><span>灾备策略</span><h3>RPO 与自动备份</h3></div><DatabaseBackup size={20} /></header>
          <div className="settings-grid">
            <label className="toggle-field"><span><strong>每日自动备份</strong><small>由内网备份执行器运行</small></span><input type="checkbox" checked={draft.backupSchedule.enabled} disabled={!canSave} onChange={(event) => setDraft({ ...draft, backupSchedule: { ...draft.backupSchedule, enabled: event.target.checked } })} /></label>
            <label><span>执行时间</span><input type="time" disabled={!canSave} value={draft.backupSchedule.time} onChange={(event) => setDraft({ ...draft, backupSchedule: { ...draft.backupSchedule, time: event.target.value } })} /></label>
            <label><span>RPO 目标（小时）</span><input type="number" min="1" max="720" disabled={!canSave} value={draft.backupRpoHours} onChange={(event) => setDraft({ ...draft, backupRpoHours: Number(event.target.value) })} /></label>
          </div>
        </section>
      </div>
      <section className="ops-panel maintenance-panel">
        <header><div><span>告警抑制</span><h3>维护窗口</h3></div><Wrench size={20} /></header>
        {canSave && <div className="maintenance-form"><SelectControl ariaLabel="维护服务" value={maintenance.serviceId} onChange={(value) => setMaintenance({ ...maintenance, serviceId: value })} options={[{ value: 'all', label: '全部服务' }, ...data.services.map((service) => ({ value: service.id, label: service.shortName || service.name }))]} /><SelectControl ariaLabel="维护时长" value={maintenance.duration} onChange={(value) => setMaintenance({ ...maintenance, duration: value })} options={[{ value: 30, label: '30 分钟' }, { value: 60, label: '1 小时' }, { value: 120, label: '2 小时' }, { value: 240, label: '4 小时' }]} /><input value={maintenance.reason} maxLength={200} placeholder="维护原因" onChange={(event) => setMaintenance({ ...maintenance, reason: event.target.value })} /><button type="button" onClick={addMaintenance}><Clock3 size={16} />添加</button></div>}
        <div className="maintenance-list">{(draft.maintenanceWindows || []).length ? draft.maintenanceWindows.map((window) => <div key={window.id}><span><strong>{window.serviceId === 'all' ? '全部服务' : data.services.find((service) => service.id === window.serviceId)?.shortName || window.serviceId}</strong><small>{window.reason}</small></span><span>{formatDateTime(window.startsAt)} 至 {formatDateTime(window.endsAt)}</span>{canSave && <button type="button" aria-label="移除维护窗口" onClick={() => setDraft({ ...draft, maintenanceWindows: draft.maintenanceWindows.filter((item) => item.id !== window.id) })}><XCircle size={17} /></button>}</div>) : <div className="ops-empty compact">暂无维护窗口</div>}</div>
      </section>
      <section className="ops-panel diagnostics-panel">
        <header><div><span>一键排查</span><h3>系统诊断</h3></div>{canDiagnose && <button className="primary-button compact" type="button" onClick={runDiagnostics} disabled={running}>{running ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}运行诊断</button>}</header>
        <p>检查服务健康、运维数据库、平台就绪状态、备份执行器、通知服务和发布集成，不读取或返回任何凭据。</p>
        {diagnostics && <div className="diagnostics-grid">{diagnostics.checks.map((check) => <div key={check.id} className={check.status}><span>{check.status === 'passed' ? <CheckCircle2 size={18} /> : check.status === 'skipped' ? <Clock3 size={18} /> : <XCircle size={18} />}</span><div><strong>{check.id}</strong><small>{check.status === 'passed' ? '检查通过' : check.status === 'skipped' ? '未配置，已跳过' : typeof check.detail === 'string' ? check.detail : '需要处理'}</small></div></div>)}</div>}
      </section>
    </section>
  );
}

export function OverviewOperations({ summary, onOpenIncidents, onOpenAudit }) {
  const incidents = summary?.incidents || [];
  const audit = summary?.audit || [];
  return (
    <section className="overview-operations" aria-label="事件与最近活动">
      <header className="overview-operations-heading">
        <div><Activity size={18} /><span><strong>运维动态</strong><small>事件处置与关键操作</small></span></div>
      </header>
      <div className="overview-operations-grid">
        <div className="overview-band">
          <header><div><BellRing size={18} /><span><strong>未解决事件</strong><small>{incidents.length ? `${incidents.length} 项需要关注` : '当前运行平稳'}</small></span></div><button type="button" onClick={onOpenIncidents}>查看全部 <ChevronRight size={15} /></button></header>
          <div>{incidents.length ? incidents.slice(0, 3).map((incident) => <button type="button" key={incident.id} onClick={onOpenIncidents}><SeverityPill value={incident.severity} /><span><strong>{incident.title}</strong><small>{formatRelative(incident.lastSeenAt)}</small></span></button>) : <div className="overview-empty"><CheckCircle2 size={18} />没有待处理事件</div>}</div>
        </div>
        <div className="overview-band">
          <header><div><FileClock size={18} /><span><strong>最近活动</strong><small>关键操作均已审计</small></span></div><button type="button" onClick={onOpenAudit}>审计日志 <ChevronRight size={15} /></button></header>
          <div>{audit.length ? audit.slice(0, 3).map((event) => <button type="button" key={event.id} onClick={onOpenAudit}><span className={`activity-icon ${event.outcome}`}><TerminalSquare size={16} /></span><span><strong>{ACTION_LABELS[event.action] || event.action}</strong><small>{event.actor} · {formatRelative(event.occurredAt)}</small></span></button>) : <div className="overview-empty"><History size={18} />暂无最近活动</div>}</div>
        </div>
      </div>
    </section>
  );
}

export function BackupQualityStrip() {
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    requestJson('/api/backups/quality').then(setQuality).catch((requestError) => setError(requestError.message));
  }, []);
  if (error) return <Feedback error={error} />;
  if (!quality) return null;
  return (
    <section className="backup-quality-strip" aria-label="灾备质量">
      <div className={`quality-item ${quality.rpoState}`}><Clock3 size={18} /><span><strong>{quality.ageHours === null ? '暂无' : `${quality.ageHours} 小时`}</strong><small>最近可恢复备份 · RPO {quality.rpoHours}h</small></span></div>
      <div className={`quality-item ${quality.restoreDrillState === 'verified' ? 'healthy' : 'warning'}`}><DatabaseBackup size={18} /><span><strong>{quality.lastRestoreDrillAt ? formatDateTime(quality.lastRestoreDrillAt) : '尚未演练'}</strong><small>最近恢复验证</small></span></div>
      <div className={`quality-item ${quality.offsite.healthy === true ? 'healthy' : quality.offsite.configured ? 'warning' : 'unknown'}`}><Cloud size={18} /><span><strong>{quality.offsite.healthy === true ? '同步正常' : quality.offsite.configured ? '同步异常' : '未配置'}</strong><small>异地备份状态</small></span></div>
      <div className={`quality-item ${quality.schedule.enabled ? 'healthy' : 'unknown'}`}><FileClock size={18} /><span><strong>{quality.schedule.enabled ? `每日 ${quality.schedule.time}` : '手动执行'}</strong><small>自动备份计划</small></span></div>
    </section>
  );
}
