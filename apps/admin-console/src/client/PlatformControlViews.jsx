import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileClock,
  GitPullRequest,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Route,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import { PLATFORM_BRAND_ICON } from './brand.js';
import { ConfirmDialog, SelectControl } from './UiControls.jsx';

const ROLE_LEVELS = { viewer: 1, operator: 2, super_admin: 3 };

function hasRole(role, required) {
  return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[required] || 0);
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function Feedback({ message, error }) {
  if (!message && !error) return null;
  return (
    <div className={`ops-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
      <span>{error || message}</span>
    </div>
  );
}

const TASK_STATUS = {
  pending: { label: '等待执行', className: 'pending', icon: Clock3 },
  running: { label: '执行中', className: 'running', icon: LoaderCircle },
  succeeded: { label: '已完成', className: 'succeeded', icon: CheckCircle2 },
  failed: { label: '失败', className: 'failed', icon: XCircle },
  cancelled: { label: '已取消', className: 'cancelled', icon: XCircle },
  action_required: { label: '需要处理', className: 'attention', icon: AlertTriangle },
};

const TASK_SOURCE = {
  backup: '数据备份',
  release_build: '发布构建',
  release_deployment: '发布部署',
  notification: '通知任务',
  incident: '告警事件',
  configuration: '配置审批',
};

export function TaskCenterView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setData(await requestJson('/api/tasks?limit=200'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const hasActive = data?.tasks?.some((task) => ['pending', 'running', 'action_required'].includes(task.status));
    if (!hasActive) return undefined;
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, [data?.tasks, load]);

  const tasks = useMemo(() => (data?.tasks || []).filter((task) => (
    (statusFilter === 'all' || task.status === statusFilter)
    && (sourceFilter === 'all' || task.source === sourceFilter)
  )), [data?.tasks, sourceFilter, statusFilter]);
  const counts = data?.counts || {};
  const activeCount = (counts.pending || 0) + (counts.running || 0);
  const attentionCount = (counts.failed || 0) + (counts.action_required || 0);

  return (
    <section className="platform-control-view task-center-view">
      <Feedback error={error} />
      <div className="control-kpis" aria-label="任务统计">
        <article><FileClock size={19} /><span>任务总数<strong>{data?.tasks?.length || 0}</strong></span></article>
        <article><Activity size={19} /><span>正在处理<strong>{activeCount}</strong></span></article>
        <article className={attentionCount ? 'attention' : ''}><AlertTriangle size={19} /><span>需要关注<strong>{attentionCount}</strong></span></article>
        <article><CheckCircle2 size={19} /><span>已完成<strong>{counts.succeeded || 0}</strong></span></article>
      </div>
      <div className="control-toolbar">
        <SelectControl
          value={statusFilter}
          ariaLabel="按任务状态筛选"
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: '全部状态' },
            ...Object.entries(TASK_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
          ]}
        />
        <SelectControl
          value={sourceFilter}
          ariaLabel="按任务来源筛选"
          onChange={setSourceFilter}
          options={[
            { value: 'all', label: '全部来源' },
            ...Object.entries(TASK_SOURCE).map(([value, label]) => ({ value, label })),
          ]}
        />
        <span>{tasks.length} 条结果 · {formatDateTime(data?.generatedAt)}</span>
        <button className="secondary-action compact" type="button" disabled={refreshing} onClick={() => load(true)}>
          <RefreshCw className={refreshing ? 'spin' : ''} size={16} />刷新
        </button>
      </div>
      {loading ? (
        <div className="ops-loading"><LoaderCircle className="spin" size={18} />正在聚合任务...</div>
      ) : tasks.length === 0 ? (
        <div className="ops-empty">当前筛选条件下没有任务。</div>
      ) : (
        <div className="control-table" role="table" aria-label="统一任务列表">
          <div className="control-table-head" role="row">
            <span>任务</span><span>状态</span><span>发起人</span><span>更新时间</span><span aria-label="操作" />
          </div>
          {tasks.map((task) => {
            const meta = TASK_STATUS[task.status] || TASK_STATUS.pending;
            const StatusIcon = meta.icon;
            return (
              <div className="control-table-row task-row" role="row" key={task.id}>
                <div><strong>{task.title}</strong><small>{TASK_SOURCE[task.source] || task.source}{task.detail ? ` · ${task.detail}` : ''}</small></div>
                <span className={`control-status ${meta.className}`}><StatusIcon className={task.status === 'running' ? 'spin' : ''} size={14} />{meta.label}</span>
                <span>{task.requestedBy || '--'}</span>
                <time dateTime={task.updatedAt || undefined}>{formatDateTime(task.updatedAt)}</time>
                <button type="button" className="icon-action" title="打开关联模块" aria-label={`打开${task.title}`} onClick={() => onNavigate(task.view)}><ArrowRight size={17} /></button>
              </div>
            );
          })}
        </div>
      )}
      <div className="source-health" aria-label="任务数据源状态">
        {(data?.sources || []).map((source) => (
          <span key={source.id} className={source.available ? 'available' : 'unavailable'}><i />{TASK_SOURCE[source.id] || (source.id === 'release' ? '发布中心' : source.id)}</span>
        ))}
      </div>
    </section>
  );
}

const CONFIG_FIELDS = [
  { key: 'monitorIntervalMs', label: '监控间隔', unit: '毫秒', min: 10000, max: 300000 },
  { key: 'failureThreshold', label: '连续失败阈值', unit: '次', min: 1, max: 10 },
  { key: 'recoveryThreshold', label: '连续恢复阈值', unit: '次', min: 1, max: 20 },
  { key: 'serviceLatencyThresholdMs', label: '服务延迟阈值', unit: '毫秒', min: 100, max: 30000 },
  { key: 'proxyP95ThresholdMs', label: '网关 P95 阈值', unit: '毫秒', min: 100, max: 120000 },
  { key: 'proxyErrorRatePercent', label: '网关错误率阈值', unit: '%', min: 1, max: 100 },
  { key: 'diskUsageThresholdPercent', label: '磁盘使用率阈值', unit: '%', min: 50, max: 99 },
  { key: 'backupRpoHours', label: '备份 RPO', unit: '小时', min: 1, max: 720 },
];

const CHANGE_STATUS = {
  pending: '待审批', applying: '应用中', applied: '已应用', rejected: '已拒绝', conflicted: '版本冲突', failed: '应用失败',
};

export function ConfigurationView({ session }) {
  const [overview, setOverview] = useState(null);
  const [draft, setDraft] = useState(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const canPropose = hasRole(session.user?.role, 'operator');
  const canApprove = hasRole(session.user?.role, 'super_admin');
  const username = session.user?.username;

  const load = useCallback(async ({ preserveDraft = false } = {}) => {
    setLoading(true);
    setError('');
    try {
      const next = await requestJson('/api/configuration');
      setOverview(next);
      if (!preserveDraft) setDraft(next.settings);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function propose(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await requestJson('/api/configuration/changes', { method: 'POST', body: JSON.stringify({ settings: draft, summary }) });
      setSummary('');
      setMessage('配置变更提案已提交，当前运行配置尚未改变。');
      await load({ preserveDraft: false });
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function executeDecision() {
    if (!confirmation) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (confirmation.type === 'rollback') {
        await requestJson(`/api/configuration/versions/${confirmation.version.version}/rollback`, {
          method: 'POST', body: JSON.stringify({ summary: `回滚到配置版本 v${confirmation.version.version}` }),
        });
        setMessage(`回滚提案已创建，目标版本为 v${confirmation.version.version}。`);
      } else {
        await requestJson(`/api/configuration/changes/${confirmation.change.id}/${confirmation.type}`, {
          method: 'POST', body: JSON.stringify({ note: confirmation.type === 'approve' ? '经控制台审批' : '经控制台拒绝' }),
        });
        setMessage(confirmation.type === 'approve' ? '配置已审批并生成新版本。' : '配置提案已拒绝。');
      }
      setConfirmation(null);
      await load({ preserveDraft: false });
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  if (loading && !overview) return <div className="ops-loading"><LoaderCircle className="spin" size={18} />正在读取配置版本...</div>;

  return (
    <section className="platform-control-view configuration-view">
      <Feedback message={message} error={error} />
      <form className="configuration-editor" onSubmit={propose}>
        <div className="section-bar"><div><h3>运行参数</h3><span>{overview?.twoPersonApproval ? '已启用双人审批，提案人不能自行批准' : '开发环境允许同一管理员完成审批'}</span></div><span className="version-badge"><History size={16} />当前 v{overview?.currentVersion || 1}</span></div>
        <label className="configuration-toggle">
          <span><strong>启用告警</strong><small>关闭后仍保留监控数据，但不创建新告警。</small></span>
          <input type="checkbox" checked={Boolean(draft?.alertingEnabled)} disabled={!canPropose || busy} onChange={(event) => updateField('alertingEnabled', event.target.checked)} />
        </label>
        <div className="configuration-fields">
          {CONFIG_FIELDS.map((field) => (
            <label key={field.key}><span>{field.label}<small>{field.unit}</small></span><input type="number" min={field.min} max={field.max} value={draft?.[field.key] ?? ''} disabled={!canPropose || busy} onChange={(event) => updateField(field.key, Number(event.target.value))} /></label>
          ))}
          <label><span>定时备份时间<small>本地时间</small></span><input type="time" value={draft?.backupSchedule?.time || '02:30'} disabled={!canPropose || busy} onChange={(event) => setDraft((current) => ({ ...current, backupSchedule: { ...current.backupSchedule, time: event.target.value } }))} /></label>
          <label className="inline-check"><span>启用定时备份<small>按上方时间执行</small></span><input type="checkbox" checked={Boolean(draft?.backupSchedule?.enabled)} disabled={!canPropose || busy} onChange={(event) => setDraft((current) => ({ ...current, backupSchedule: { ...current.backupSchedule, enabled: event.target.checked } }))} /></label>
        </div>
        <div className="configuration-submit">
          <label><span>变更摘要</span><textarea maxLength={200} required value={summary} disabled={!canPropose || busy} placeholder="说明修改目的、影响与观察项" onChange={(event) => setSummary(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={!canPropose || busy || !summary.trim()}><GitPullRequest size={16} />提交审批</button>
        </div>
      </form>

      <section className="configuration-history">
        <div className="section-bar"><div><h3>变更提案</h3><span>最近 {overview?.changes?.length || 0} 条</span></div></div>
        {(overview?.changes || []).length === 0 ? <div className="ops-empty compact">暂无配置提案。</div> : (
          <div className="configuration-list">
            {overview.changes.map((change) => {
              const selfApprovalBlocked = overview.twoPersonApproval && change.createdBy === username;
              return (
                <article key={change.id}>
                  <div className="configuration-record-main"><span className={`change-status ${change.status}`}>{CHANGE_STATUS[change.status] || change.status}</span><div><strong>{change.summary}</strong><small>{change.kind === 'rollback' ? `回滚提案 · 目标 v${change.targetVersion}` : '参数变更'} · {change.createdBy} · {formatDateTime(change.createdAt)}</small></div></div>
                  <div className="changed-keys">{(change.changedKeys || []).map((key) => <code key={key}>{key}</code>)}</div>
                  {change.status === 'pending' && canApprove && (
                    <div className="record-actions">
                      <button type="button" className="secondary-action compact" disabled={busy || selfApprovalBlocked} title={selfApprovalBlocked ? '双人审批要求由另一位管理员批准' : '批准并应用'} onClick={() => setConfirmation({ type: 'approve', change })}><ShieldCheck size={15} />批准</button>
                      <button type="button" className="secondary-action compact danger" disabled={busy} onClick={() => setConfirmation({ type: 'reject', change })}><XCircle size={15} />拒绝</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="configuration-history">
        <div className="section-bar"><div><h3>版本历史</h3><span>回滚同样需要创建并审批提案</span></div></div>
        <div className="version-list">
          {(overview?.versions || []).map((version) => (
            <div key={version.version}><span className="version-number">v{version.version}</span><div><strong>{version.summary || '初始配置基线'}</strong><small>{version.createdBy || 'system'} · {formatDateTime(version.createdAt)}</small></div>{version.version !== overview.currentVersion && <button type="button" className="icon-action" title={`创建回滚到 v${version.version} 的提案`} aria-label={`回滚到版本 ${version.version}`} disabled={!canPropose || busy} onClick={() => setConfirmation({ type: 'rollback', version })}><RotateCcw size={16} /></button>}</div>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.type === 'approve' ? '批准并应用配置？' : confirmation?.type === 'reject' ? '拒绝配置提案？' : `创建回滚到 v${confirmation?.version?.version} 的提案？`}
        description={confirmation?.type === 'approve' ? '应用成功后将立即生成新的不可变配置版本。' : confirmation?.type === 'reject' ? '该提案将结束，运行配置不会发生变化。' : '此操作不会直接覆盖配置，仍需按正常审批流程应用。'}
        detail={confirmation?.change?.summary || confirmation?.version?.summary}
        confirmLabel={confirmation?.type === 'approve' ? '批准并应用' : confirmation?.type === 'reject' ? '确认拒绝' : '创建回滚提案'}
        tone={confirmation?.type === 'reject' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={executeDecision}
      />
    </section>
  );
}

const DIAGNOSIS_META = {
  end_to_end_healthy: { label: '端到端正常', className: 'healthy' },
  service_reachable: { label: '服务可达', className: 'healthy' },
  gateway_or_public_route_failure: { label: '公网网关或路由异常', className: 'failed' },
  monitor_route_mismatch: { label: '监控路由不一致', className: 'attention' },
  service_or_dependency_failure: { label: '服务或依赖异常', className: 'failed' },
  service_unavailable: { label: '服务不可用', className: 'failed' },
};

export function DiagnosticsView({ services, session }) {
  const monitoredServices = services.filter((service) => service.healthPath || ['core', 'exam', 'campus', 'mqtt', 'notify'].includes(service.id));
  const [serviceId, setServiceId] = useState('all');
  const [traceResult, setTraceResult] = useState(null);
  const [systemResult, setSystemResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const canRun = hasRole(session.user?.role, 'operator');

  async function runTrace() {
    setBusy('trace'); setError('');
    try {
      setTraceResult(await requestJson('/api/diagnostics/traces', {
        method: 'POST', timeoutMs: 30000, body: JSON.stringify(serviceId === 'all' ? {} : { serviceId }),
      }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(''); }
  }

  async function runSystemChecks() {
    setBusy('system'); setError('');
    try { setSystemResult(await requestJson('/api/diagnostics/run', { method: 'POST', timeoutMs: 30000 })); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(''); }
  }

  return (
    <section className="platform-control-view diagnostics-view">
      <Feedback error={error} />
      <section className="diagnostic-launcher">
        <div><Route size={22} /><span><strong>端到端追踪</strong><small>每次运行会生成独立请求 ID 并记录审计事件。</small></span></div>
        <SelectControl value={serviceId} ariaLabel="选择诊断服务" disabled={!canRun || Boolean(busy)} onChange={setServiceId} options={[{ value: 'all', label: '全部受监控服务' }, ...monitoredServices.map((service) => ({ value: service.id, label: service.shortName || service.name }))]} />
        <button className="primary-button" type="button" disabled={!canRun || Boolean(busy)} onClick={runTrace}>{busy === 'trace' ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}开始追踪</button>
        <button className="secondary-action" type="button" disabled={!canRun || Boolean(busy)} onClick={runSystemChecks}>{busy === 'system' ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}系统自检</button>
      </section>

      {traceResult && (
        <section className="trace-results">
          <div className="section-bar"><div><h3>链路结果</h3><span>{traceResult.summary.healthy}/{traceResult.summary.total} 条链路正常 · {formatDateTime(traceResult.finishedAt)}</span></div></div>
          {traceResult.traces.map((trace) => {
            const diagnosis = DIAGNOSIS_META[trace.diagnosis] || { label: trace.diagnosis, className: 'attention' };
            return (
              <article className="trace-record" key={trace.requestId}>
                <header><div><strong>{trace.serviceName}</strong><code>{trace.requestId}</code></div><span className={`control-status ${diagnosis.className}`}>{diagnosis.label}</span></header>
                <div className="trace-stages">
                  {trace.stages.map((stage, index) => (
                    <div className={`trace-stage ${stage.state}`} key={stage.id}>
                      <span className="stage-marker">{stage.state === 'passed' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                      <div><strong>{stage.label}</strong><small>{stage.httpStatus ? `HTTP ${stage.httpStatus} · ` : ''}{stage.latencyMs} ms{stage.error ? ` · ${stage.error}` : ''}</small>{stage.requestId && <code>{stage.requestId}</code>}</div>
                      {index < trace.stages.length - 1 && <i aria-hidden="true" />}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {systemResult && (
        <section className="system-check-results">
          <div className="section-bar"><div><h3>系统自检</h3><span>{formatDateTime(systemResult.checkedAt || systemResult.generatedAt)}</span></div></div>
          <div className="system-check-grid">
            {(systemResult.checks || []).map((check) => <div key={check.id} className={check.status}><span>{check.status === 'passed' ? <CheckCircle2 size={17} /> : check.status === 'skipped' ? <Clock3 size={17} /> : <XCircle size={17} />}</span><div><strong>{check.label || check.id}</strong><small>{check.message || check.detail || check.status}</small></div></div>)}
          </div>
        </section>
      )}
    </section>
  );
}

const PUBLIC_STATUS_META = {
  operational: { label: '所有系统运行正常', className: 'operational', icon: CheckCircle2 },
  degraded: { label: '部分服务需要关注', className: 'degraded', icon: AlertTriangle },
  outage: { label: '系统服务中断', className: 'outage', icon: XCircle },
  unknown: { label: '状态数据暂不可确认', className: 'unknown', icon: Clock3 },
};

const SERVICE_STATE_LABEL = { healthy: '运行正常', degraded: '性能下降', offline: '服务中断', unmonitored: '未监控' };

export function PublicStatusView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await requestJson('/api/public/status', { timeoutMs: 15000 })); setError(''); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const meta = PUBLIC_STATUS_META[data?.overall] || PUBLIC_STATUS_META.unknown;
  const OverallIcon = meta.icon;
  return (
    <main className="public-status-page">
      <header className="public-status-header"><a href="/" className="public-brand-mark" aria-label="返回管理控制台"><img src={PLATFORM_BRAND_ICON} alt="" /></a><div><strong>{data?.platformName || 'MY Platform'}</strong><span>服务状态</span></div></header>
      <section className={`public-overall-status ${meta.className}`}>
        <OverallIcon size={28} />
        <div><h1>{meta.label}</h1><p>{data?.stale ? '部分状态数据已过期，当前结论可能不完整。' : '状态来自平台实时健康检查，不使用人工覆盖。'}</p></div>
        <time dateTime={data?.generatedAt || undefined}>更新于 {formatDateTime(data?.generatedAt)}</time>
      </section>
      {error && <div className="public-status-error"><AlertTriangle size={18} />{error}</div>}
      {loading ? <div className="public-status-loading"><LoaderCircle className="spin" size={20} />正在获取服务状态...</div> : (
        <>
          <section className="public-service-band">
            <div className="public-section-heading"><h2>系统组件</h2><span>{data?.services?.length || 0} 项</span></div>
            <div className="public-service-list">
              {(data?.services || []).map((service) => <article key={service.id}><div><strong>{service.name}</strong><small>{service.stale ? '状态数据已过期' : `检查于 ${formatDateTime(service.checkedAt)}`}</small></div><span className={`public-service-state ${service.stale ? 'unknown' : service.state}`}><i />{service.stale ? '待确认' : SERVICE_STATE_LABEL[service.state] || service.state}</span></article>)}
            </div>
          </section>
          <section className="public-incident-band">
            <div className="public-section-heading"><h2>当前事件</h2><span>{data?.incidents?.length || 0} 项</span></div>
            {(data?.incidents || []).length === 0 ? <div className="public-no-incidents"><CheckCircle2 size={19} />当前没有需要公开关注的服务事件。</div> : <div className="public-incident-list">{data.incidents.map((incident) => <article key={incident.id}><AlertTriangle size={18} /><div><strong>{incident.severity === 'critical' ? '严重服务事件' : '服务异常事件'}</strong><small>{incident.serviceId || 'platform'} · 始于 {formatDateTime(incident.openedAt)}</small></div><span>{incident.state === 'acknowledged' ? '处理中' : '调查中'}</span></article>)}</div>}
          </section>
        </>
      )}
      <footer><span>自动更新间隔 30 秒</span><a href="/">管理控制台 <ArrowRight size={14} /></a></footer>
    </main>
  );
}
