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
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import { PLATFORM_BRAND_ICON } from './brand.js';
import { EmptyState } from './Pearl.jsx';
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
    <div className={`alert ${error ? 'is-error' : 'is-ok'}`} role={error ? 'alert' : 'status'}>
      {error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      <span>{error || message}</span>
    </div>
  );
}

const TASK_STATUS = {
  pending: { label: '等待执行', tone: '', icon: Clock3 },
  running: { label: '执行中', tone: 'info', icon: LoaderCircle },
  succeeded: { label: '已完成', tone: 'ok', icon: CheckCircle2 },
  failed: { label: '失败', tone: 'danger', icon: XCircle },
  cancelled: { label: '已取消', tone: '', icon: XCircle },
  action_required: { label: '需要处理', tone: 'warn', icon: AlertTriangle },
};

const TASK_SOURCE = {
  backup: '数据备份',
  release_build: '发布构建',
  notification: '通知任务',
  incident: '告警事件',
  configuration: '配置审批',
};

export function TaskCenterView({ onNavigate, targetEntityId = '' }) {
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
    if (!targetEntityId || !data?.tasks) return undefined;
    setStatusFilter('all');
    setSourceFilter('all');
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-task-entity-id]')]
        .find((element) => element.dataset.taskEntityId === targetEntityId);
      target?.scrollIntoView({ block: 'center' });
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [data?.tasks, targetEntityId]);
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
    <section className="page-view view-stack" aria-label="待办任务">
      <Feedback error={error} />
      <div className="toolbar">
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
        <div className="toolbar-end">
          <span className="toolbar-hint">{tasks.length} 条结果 · {formatDateTime(data?.generatedAt)}</span>
          <button className="btn btn-secondary btn-sm" type="button" disabled={refreshing} onClick={() => load(true)}>
            <RefreshCw className={refreshing ? 'spin' : ''} size={15} />刷新
          </button>
        </div>
      </div>
      <div className="stat-strip">
        <div className="stat-card"><span className="stat-icon tone-info"><FileClock size={17} /></span><div><span className="panel-meta">任务总数</span><strong className="stat-figure">{data?.tasks?.length || 0}</strong><small className="panel-meta">跨服务聚合</small></div></div>
        <div className="stat-card"><span className="stat-icon tone-violet"><Activity size={17} /></span><div><span className="panel-meta">正在处理</span><strong className="stat-figure">{activeCount}</strong><small className="panel-meta">等待或执行中</small></div></div>
        <div className="stat-card"><span className="stat-icon tone-warn"><AlertTriangle size={17} /></span><div><span className="panel-meta">需要关注</span><strong className="stat-figure">{attentionCount}</strong><small className="panel-meta">失败或需人工介入</small></div></div>
        <div className="stat-card"><span className="stat-icon tone-ok"><CheckCircle2 size={17} /></span><div><span className="panel-meta">已完成</span><strong className="stat-figure">{counts.succeeded || 0}</strong><small className="panel-meta">最近一次成功</small></div></div>
      </div>
      <section className="panel panel-flush">
        <div className="panel-head">
          <div className="panel-title"><FileClock size={15} />统一任务列表</div>
          <span className="panel-meta">{tasks.length} 条</span>
        </div>
        <div className="data-list">
          <div className="data-head col-task"><span>任务</span><span>状态</span><span>发起人</span><span>更新时间</span><span /></div>
          {loading && !data && <div className="data-list-empty"><LoaderCircle className="spin" size={16} /> 正在聚合任务…</div>}
          {tasks.map((task) => {
            const meta = TASK_STATUS[task.status] || TASK_STATUS.pending;
            const StatusIcon = meta.icon;
            const targeted = task.sourceId === targetEntityId || task.id === targetEntityId;
            return (
              <div className={`data-row col-task${targeted ? ' is-targeted' : ''}`} data-task-entity-id={task.sourceId || task.id} role="row" key={task.id}>
                <span className="cell-stack"><strong>{task.title}</strong><small>{TASK_SOURCE[task.source] || task.source}{task.detail ? ` · ${task.detail}` : ''}</small></span>
                <span><span className={`tag${meta.tone ? ` tone-${meta.tone}` : ''}`}><StatusIcon className={task.status === 'running' ? 'spin' : ''} size={13} />{meta.label}</span></span>
                <span className="cell-soft">{task.requestedBy || '--'}</span>
                <span className="cell-mono">{formatDateTime(task.updatedAt)}</span>
                <span className="row-actions">
                  <button type="button" className="icon-action" title="打开关联模块" aria-label={`打开${task.title}`} onClick={() => onNavigate(task.view, { entity: task.sourceId || task.id })}><ArrowRight size={16} /></button>
                </span>
              </div>
            );
          })}
          {!loading && tasks.length === 0 && <div className="data-list-empty"><EmptyState title="当前筛选条件下没有任务" detail="调整筛选条件，或等待后台任务产生" /></div>}
        </div>
        {(data?.sources || []).length > 0 && (
          <div className="table-foot">
            <span className="panel-meta">数据源</span>
            <div className="inline-actions">
              {(data?.sources || []).map((source) => (
                <span key={source.id} className={`tag ${source.available ? 'tone-ok' : 'tone-danger'}`}><i className="tag-dot" />{TASK_SOURCE[source.id] || (source.id === 'release' ? '发布中心' : source.id)}</span>
              ))}
            </div>
          </div>
        )}
      </section>
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

const CHANGE_TONE = {
  pending: 'tone-info', applying: 'tone-info', applied: 'tone-ok', rejected: 'tone-danger', conflicted: 'tone-danger', failed: 'tone-danger',
};

const MAINTENANCE_DURATIONS = [
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 240, label: '4 小时' },
];

const MINUTE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function formatMinute(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '--' : MINUTE_FORMATTER.format(date);
}

export function ConfigurationView({ session, targetEntityId = '', services = [] }) {
  const [overview, setOverview] = useState(null);
  const [draft, setDraft] = useState(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [maintenance, setMaintenance] = useState({ serviceId: 'all', duration: 60, reason: '' });
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
  useEffect(() => {
    if (!targetEntityId || !overview?.changes) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-configuration-entity-id]')]
        .find((element) => element.dataset.configurationEntityId === targetEntityId);
      target?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [overview?.changes, targetEntityId]);

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function serviceLabel(id) {
    if (id === 'all') return '全部服务';
    const service = services.find((item) => item.id === id);
    return service?.shortName || service?.name || id;
  }

  function addMaintenanceWindow() {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + Number(maintenance.duration) * 60000);
    setDraft((current) => ({
      ...current,
      maintenanceWindows: [...(current?.maintenanceWindows || []), {
        id: crypto.randomUUID(),
        serviceId: maintenance.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: maintenance.reason.trim() || '计划维护',
        createdBy: username,
      }],
    }));
    setMaintenance((current) => ({ ...current, reason: '' }));
  }

  function removeMaintenanceWindow(id) {
    setDraft((current) => ({
      ...current,
      maintenanceWindows: (current?.maintenanceWindows || []).filter((window) => window.id !== id),
    }));
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

  if (loading && !overview) {
    return <section className="page-view"><div className="loading-inline"><LoaderCircle className="spin" size={16} />正在读取配置版本...</div></section>;
  }

  const changes = overview?.changes || [];
  const versions = overview?.versions || [];
  const windows = draft?.maintenanceWindows || [];

  return (
    <section className="page-view view-stack" aria-label="运行设置">
      <Feedback message={message} error={error} />
      <form className="panel config-form" onSubmit={propose}>
        <div className="section-bar">
          <div>
            <h3>运行参数</h3>
            <span>{overview?.twoPersonApproval ? '双人审批已启用，提案人不能自行批准' : '单人模式，可由当前管理员完成审批'}</span>
          </div>
          <span className="tag tone-info"><History size={12} />当前 v{overview?.currentVersion || 1}</span>
        </div>
        <label className="config-toggle">
          <span><strong>启用告警</strong><small>关闭后仍保留监控数据，但不会创建新告警。</small></span>
          <input type="checkbox" checked={Boolean(draft?.alertingEnabled)} disabled={!canPropose || busy} onChange={(event) => updateField('alertingEnabled', event.target.checked)} />
        </label>
        <div className="config-grid">
          {CONFIG_FIELDS.map((field) => (
            <label className="config-field" key={field.key}>
              <span>{field.label}<small>{field.unit}</small></span>
              <input type="number" min={field.min} max={field.max} value={draft?.[field.key] ?? ''} disabled={!canPropose || busy} onChange={(event) => updateField(field.key, Number(event.target.value))} />
            </label>
          ))}
        </div>

        <div className="config-subsection">
          <div className="section-bar">
            <div><h3>维护窗口</h3><span>窗口期内不产生新告警，与运行参数一并提交审批</span></div>
            <span className="panel-meta">{windows.length} 个窗口</span>
          </div>
          <div className="config-window-editor">
            <SelectControl ariaLabel="维护服务" disabled={!canPropose || busy} value={maintenance.serviceId} onChange={(value) => setMaintenance((current) => ({ ...current, serviceId: value }))} options={[{ value: 'all', label: '全部服务' }, ...services.map((service) => ({ value: service.id, label: service.shortName || service.name }))]} />
            <SelectControl ariaLabel="维护时长" disabled={!canPropose || busy} value={maintenance.duration} onChange={(value) => setMaintenance((current) => ({ ...current, duration: value }))} options={MAINTENANCE_DURATIONS} />
            <input aria-label="维护原因" value={maintenance.reason} maxLength={200} placeholder="维护原因（可选）" disabled={!canPropose || busy} onChange={(event) => setMaintenance((current) => ({ ...current, reason: event.target.value }))} />
            <button className="btn btn-secondary btn-sm" type="button" disabled={!canPropose || busy} onClick={addMaintenanceWindow}><Plus size={14} />添加</button>
          </div>
          {windows.length > 0 ? (
            <div className="config-windows">
              {windows.map((window) => (
                <div className="config-window" key={window.id}>
                  <span className="config-window-copy">
                    <strong>{serviceLabel(window.serviceId)}</strong>
                    <small>{window.reason}</small>
                  </span>
                  <span className="config-window-time">{formatMinute(window.startsAt)} 至 {formatMinute(window.endsAt)}</span>
                  <button className="icon-action" type="button" aria-label={`移除 ${serviceLabel(window.serviceId)} 的维护窗口`} disabled={!canPropose || busy} onClick={() => removeMaintenanceWindow(window.id)}><XCircle size={15} /></button>
                </div>
              ))}
            </div>
          ) : <p className="config-hint">尚未添加维护窗口。计划维护前在此添加，避免告警噪声。</p>}
        </div>

        <div className="config-submit">
          <label>
            <span>变更摘要</span>
            <textarea maxLength={200} required value={summary} disabled={!canPropose || busy} placeholder="说明修改目的、影响与观察项" onChange={(event) => setSummary(event.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!canPropose || busy || !summary.trim()}><GitPullRequest size={16} />提交审批</button>
        </div>
      </form>

      <div className="split">
        <section className="panel panel-flush">
          <div className="panel-head">
            <div className="panel-title"><GitPullRequest size={15} />变更提案</div>
            <span className="panel-meta">最近 {changes.length} 条</span>
          </div>
          {changes.length > 0 ? (
            <div className="config-list">
              {changes.map((change) => {
                const selfApprovalBlocked = overview?.twoPersonApproval && change.createdBy === username;
                return (
                  <article className={`config-item ${targetEntityId === change.id ? 'is-targeted' : ''}`.trim()} data-configuration-entity-id={change.id} key={change.id}>
                    <div className="config-item-copy">
                      <div className="config-item-head">
                        <span className={`tag ${CHANGE_TONE[change.status] || ''}`.trim()}>{CHANGE_STATUS[change.status] || change.status}</span>
                        <strong>{change.summary}</strong>
                      </div>
                      <small>{change.kind === 'rollback' ? `回滚提案 · 目标 v${change.targetVersion}` : '参数变更'} · {change.createdBy} · {formatDateTime(change.createdAt)}</small>
                      {(change.changedKeys || []).length > 0 && (
                        <div className="config-keys">{(change.changedKeys || []).map((key) => <code key={key}>{key}</code>)}</div>
                      )}
                    </div>
                    {change.status === 'pending' && canApprove && (
                      <div className="inline-actions">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || selfApprovalBlocked} title={selfApprovalBlocked ? '双人审批要求由另一位管理员批准' : '批准并应用'} onClick={() => setConfirmation({ type: 'approve', change })}><ShieldCheck size={14} />批准</button>
                        <button type="button" className="btn btn-text btn-sm is-danger" disabled={busy} onClick={() => setConfirmation({ type: 'reject', change })}><XCircle size={14} />拒绝</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <div className="config-empty">暂无配置提案，提交运行参数或维护窗口后会出现在这里</div>}
        </section>

        <aside className="panel panel-flush">
          <div className="panel-head">
            <div className="panel-title"><History size={15} />版本历史</div>
            <span className="panel-meta">回滚同样需要审批</span>
          </div>
          <div className="version-list">
            {versions.map((version) => (
              <div className="version-row" key={version.version}>
                <span className="version-tag">v{version.version}</span>
                <span className="version-copy">
                  <strong>{version.summary === 'Initial configuration baseline' ? '初始配置基线' : (version.summary || '初始配置基线')}</strong>
                  <small>{version.createdBy || 'system'} · {formatDateTime(version.createdAt)}</small>
                </span>
                {version.version === overview?.currentVersion
                  ? <span className="tag tone-ok">当前</span>
                  : <button type="button" className="icon-action" title={`创建回滚到 v${version.version} 的提案`} aria-label={`回滚到版本 ${version.version}`} disabled={!canPropose || busy} onClick={() => setConfirmation({ type: 'rollback', version })}><RotateCcw size={15} /></button>}
              </div>
            ))}
          </div>
        </aside>
      </div>
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
  end_to_end_healthy: { label: '端到端正常', tone: 'ok' },
  service_reachable: { label: '服务可达', tone: 'ok' },
  gateway_or_public_route_failure: { label: '公网网关或路由异常', tone: 'danger' },
  monitor_route_mismatch: { label: '监控路由不一致', tone: 'warn' },
  service_or_dependency_failure: { label: '服务或依赖异常', tone: 'danger' },
  service_unavailable: { label: '服务不可用', tone: 'danger' },
};

export function DiagnosticsView({ services, session, targetEntityId = '' }) {
  const monitoredServices = services.filter((service) => service.healthPath || ['core', 'exam', 'campus', 'mqtt', 'notify'].includes(service.id));
  const [serviceId, setServiceId] = useState(() => targetEntityId || 'all');
  const [traceResult, setTraceResult] = useState(null);
  const [systemResult, setSystemResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const canRun = hasRole(session.user?.role, 'operator');

  useEffect(() => {
    if (targetEntityId && monitoredServices.some((service) => service.id === targetEntityId)) setServiceId(targetEntityId);
  }, [monitoredServices, targetEntityId]);

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
    <section className="page-view view-stack" aria-label="连接检查">
      <Feedback error={error} />
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title"><Route size={15} />端到端追踪</div>
          <span className="panel-meta">每次运行会生成独立请求 ID 并记录审计事件</span>
        </div>
        <div className="panel-body">
          <div className="toolbar">
            <SelectControl value={serviceId} ariaLabel="选择诊断服务" disabled={!canRun || Boolean(busy)} onChange={setServiceId} options={[{ value: 'all', label: '全部受监控服务' }, ...monitoredServices.map((service) => ({ value: service.id, label: service.shortName || service.name }))]} />
            <div className="toolbar-end">
              <button className="btn btn-secondary btn-sm" type="button" disabled={!canRun || Boolean(busy)} onClick={runSystemChecks}>{busy === 'system' ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}系统自检</button>
              <button className="btn btn-primary btn-sm" type="button" disabled={!canRun || Boolean(busy)} onClick={runTrace}>{busy === 'trace' ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />}开始追踪</button>
            </div>
          </div>
        </div>
      </section>

      {!traceResult && !systemResult && (
        <EmptyState icon={Route} title="还没有运行过检查" detail="选择服务后开始追踪，结果会按链路节点逐段展开" />
      )}

      {traceResult && (
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title"><Activity size={15} />链路结果</div>
            <span className="panel-meta">{traceResult.summary.healthy}/{traceResult.summary.total} 条链路正常 · {formatDateTime(traceResult.finishedAt)}</span>
          </div>
          <div className="panel-body trace-body">
            {traceResult.traces.map((trace) => {
              const diagnosis = DIAGNOSIS_META[trace.diagnosis] || { label: trace.diagnosis, tone: 'warn' };
              return (
                <article className="trace-record" key={trace.requestId}>
                  <header>
                    <div><strong>{trace.serviceName}</strong><code className="trace-id">{trace.requestId}</code></div>
                    <span className={`tag tone-${diagnosis.tone}`}>{diagnosis.label}</span>
                  </header>
                  <div className="trace-stages">
                    {trace.stages.map((stage, index) => (
                      <div className={`trace-stage is-${stage.state}`} key={stage.id}>
                        <span className="stage-marker">{stage.state === 'passed' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                        <div>
                          <strong>{stage.label}</strong>
                          <small>{stage.httpStatus ? `HTTP ${stage.httpStatus} · ` : ''}{stage.latencyMs} ms{stage.error ? ` · ${stage.error}` : ''}</small>
                          {stage.requestId && <code className="trace-id">{stage.requestId}</code>}
                        </div>
                        {index < trace.stages.length - 1 && <i aria-hidden="true" />}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {systemResult && (
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title"><ShieldCheck size={15} />系统自检</div>
            <span className="panel-meta">{formatDateTime(systemResult.checkedAt || systemResult.generatedAt)}</span>
          </div>
          <div className="panel-body">
            <div className="check-grid">
              {(systemResult.checks || []).map((check) => (
                <div key={check.id} className={`check-card is-${check.status}`}>
                  <span>{check.status === 'passed' ? <CheckCircle2 size={17} /> : check.status === 'skipped' ? <Clock3 size={17} /> : <XCircle size={17} />}</span>
                  <div><strong>{check.label || check.id}</strong><small>{check.message || check.detail || check.status}</small></div>
                </div>
              ))}
            </div>
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
