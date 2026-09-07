import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRequest } from './useLatestRequest.js';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  Cloud,
  DatabaseBackup,
  Download,
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
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Target,
  UserRoundCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import { resolveConsoleView } from './navigation.js';
import {
  environmentLabel,
  releaseStateClass,
  releaseDuration,
  releaseIsActive,
  releaseStatusLabel,
  releaseTimingVerb,
  workflowNameLabel,
} from './release-presentation.js';
import { SegmentedTabs, SelectControl } from './UiControls.jsx';

const STATE_LABELS = {
  healthy: '正常',
  degraded: '异常',
  offline: '离线',
  unmonitored: '未监测',
};
const INCIDENT_LABELS = { open: '待处理', acknowledged: '已确认', resolved: '已恢复' };
const ROLE_LABELS = { viewer: '只读管理员', operator: '运维管理员', super_admin: '超级管理员' };
const BACKUP_STORAGE_PROVIDERS = [
  { value: 'r2', label: 'Cloudflare R2' },
  { value: 'aws-s3', label: 'AWS S3' },
  { value: 'minio', label: 'MinIO' },
  { value: 'b2', label: 'Backblaze B2' },
];
const EMPTY_BACKUP_STORAGE = {
  enabled: false,
  provider: 'r2',
  accountId: '',
  endpoint: '',
  region: 'auto',
  bucket: '',
  prefix: 'my-platform/backups',
  forcePathStyle: false,
  localRetentionDays: 14,
  remoteRetentionDays: 14,
};
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
  'incident.runbook_step': '更新处置步骤',
  'incident.postmortem': '保存事故复盘',
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
  'diagnostics.run': '运行诊断',
  'security.session_revoked': '撤销会话',
  'operations.settings_updated': '更新运维设置',
  'gateway.proxy_error': '网关请求异常',
};
const CHART_COLORS = ['#2877f7', '#11ad78', '#ff8a00', '#8a45ef', '#d75467', '#13bad6'];
const RELEASE_HISTORY_COLLAPSED_LIMIT = 5;
const SLO_STATUS_LABELS = { healthy: '预算充足', at_risk: '预算承压', exhausted: '预算耗尽', no_data: '暂无数据' };
const CALENDAR_TYPE_LABELS = { release: '发布', configuration: '配置', maintenance: '维护', incident: '事件' };
const SEARCH_TYPE_LABELS = { service: '服务', incident: '事件', task: '任务', release: '发布', configuration: '配置' };
const OPERATIONAL_STATUS_LABELS = {
  open: '待处理', acknowledged: '已确认', resolved: '已恢复',
  pending: '待处理', action_required: '需要处理', applying: '应用中', applied: '已应用', rejected: '已拒绝',
  queued: '已排队', running: '执行中', succeeded: '已成功', failed: '已失败', cancelled: '已取消',
  scheduled: '已计划', active: '进行中', completed: '已完成',
};
function formatDateTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatBackupBytes(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
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

function SloStatusPill({ value }) {
  const state = value === 'healthy' ? 'healthy' : value === 'at_risk' ? 'degraded' : value === 'exhausted' ? 'offline' : 'unmonitored';
  return <span className={`ops-state state-${state}`}><i />{SLO_STATUS_LABELS[value] || value || '--'}</span>;
}

function sourceAvailabilityError(data) {
  const unavailable = (data?.sources || []).filter((source) => !source.available).map((source) => source.id);
  return unavailable.length ? `部分数据源暂不可用：${unavailable.join('、')}` : '';
}

function sourceScanLimitWarning(data) {
  const limited = (data?.sources || []).filter((source) => source.scanLimitReached).map((source) => source.id);
  return limited.length ? `部分数据源已达扫描上限：${limited.join('、')}，当前结果可能不完整` : '';
}

function operationalStatusLabel(value, type) {
  if (!value) return '--';
  if (type === 'release') return releaseStatusLabel(value);
  return OPERATIONAL_STATUS_LABELS[value] || value;
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

function TrendMonitoringPanel({ services }) {
  const [hours, setHours] = useState(24);
  const [selected, setSelected] = useState('all');
  const [samples, setSamples] = useState([]);
  const { loading, error, runRequest } = useLatestRequest();

  const load = useCallback(async () => {
    await runRequest(async (signal) => {
      const query = new URLSearchParams({ hours: String(hours), limit: '3000' });
      if (selected !== 'all') query.set('serviceId', selected);
      return requestJson(`/api/operations/history?${query}`, { signal });
    }, (result) => setSamples(result.samples || []));
  }, [hours, selected, runRequest]);

  useEffect(() => {
    load();
  }, [load]);

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
    <>
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
        {loading && samples.length === 0 ? <LoadingBlock label="正在读取历史样本" /> : <MonitoringChart groups={groups} />}
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
    </>
  );
}

function SloPanel({ services }) {
  const [windowValue, setWindowValue] = useState('7d');
  const [selected, setSelected] = useState('all');
  const [data, setData] = useState(null);
  const { loading, error, runRequest } = useLatestRequest();

  const load = useCallback(async () => {
    await runRequest(async (signal) => {
      const query = new URLSearchParams({ window: windowValue });
      if (selected !== 'all') query.set('serviceId', selected);
      return requestJson(`/api/operations/slo?${query}`, { signal });
    }, setData);
  }, [selected, windowValue, runRequest]);

  useEffect(() => {
    load();
  }, [load]);

  const reports = data?.services || [];
  const overall = data?.overall || {};
  const remaining = overall.errorBudget?.remainingPercent;
  const burnRate = overall.errorBudget?.burnRate;

  return (
    <>
      <div className="ops-toolbar">
        <SegmentedTabs ariaLabel="SLO 时间窗口" idPrefix="slo-window-tab" items={[{ id: '1d', label: '1 天' }, { id: '7d', label: '7 天' }, { id: '30d', label: '30 天' }]} value={windowValue} onChange={setWindowValue} />
        <div className="ops-select-label"><span>服务</span>
          <SelectControl
            ariaLabel="筛选 SLO 服务"
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
      {loading && !data ? <LoadingBlock label="正在计算 SLO 与错误预算" /> : (
        <>
          <div className="ops-kpis">
            <article><Target size={20} /><div><span>目标可用率</span><strong>{data ? `${data.targetPercent}%` : '--'}</strong><small>{data?.window || windowValue} 统一目标</small></div></article>
            <article><Activity size={20} /><div><span>实际可用率</span><strong>{Number.isFinite(overall.availabilityPercent) ? `${overall.availabilityPercent.toFixed(3)}%` : '--'}</strong><small>排除维护与未监测</small></div></article>
            <article><Gauge size={20} /><div><span>剩余错误预算</span><strong>{Number.isFinite(remaining) ? `${remaining.toFixed(1)}%` : '--'}</strong><small>{SLO_STATUS_LABELS[overall.status] || '暂无数据'}</small></div></article>
            <article><History size={20} /><div><span>预算烧毁率</span><strong>{Number.isFinite(burnRate) ? `${burnRate.toFixed(2)}x` : '--'}</strong><small>{reports.length} 项服务目标</small></div></article>
          </div>
          <section className="ops-panel ops-table-panel" aria-busy={loading}>
            <div className="ops-table-head monitoring-table slo-table"><span>服务</span><span>状态</span><span>可用率</span><span>目标</span><span>剩余预算</span><span>烧毁率</span></div>
            {reports.length ? reports.map((report) => (
              <div className="ops-table-row monitoring-table slo-table" key={report.serviceId}>
                <strong>{report.name || report.serviceId}</strong>
                <SloStatusPill value={report.status} />
                <span>{Number.isFinite(report.availabilityPercent) ? `${report.availabilityPercent.toFixed(3)}%` : '--'}</span>
                <span>{report.targetPercent}%</span>
                <span>{Number.isFinite(report.errorBudget?.remainingPercent) ? `${report.errorBudget.remainingPercent.toFixed(1)}%` : '--'}</span>
                <span>{Number.isFinite(report.errorBudget?.burnRate) ? `${report.errorBudget.burnRate.toFixed(2)}x` : '--'}</span>
              </div>
            )) : <div className="ops-empty">当前时间窗口暂无可用 SLO 样本</div>}
          </section>
        </>
      )}
    </>
  );
}

function ChangeCalendarPanel({ services }) {
  const [period, setPeriod] = useState(30);
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const { loading, error, runRequest } = useLatestRequest();

  const load = useCallback(async () => {
    await runRequest(async (signal) => {
      const current = new Date();
      const futureDays = period === 90 ? 30 : 15;
      const query = new URLSearchParams({
        from: new Date(current.getTime() - (period - futureDays) * 86400000).toISOString(),
        to: new Date(current.getTime() + futureDays * 86400000).toISOString(),
        page: String(page),
        pageSize: '20',
      });
      if (type !== 'all') query.set('type', type);
      if (selected !== 'all') query.set('serviceId', selected);
      return requestJson(`/api/operations/change-calendar?${query}`, { signal });
    }, setData);
  }, [page, period, selected, type, runRequest]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const pages = Math.max(1, data?.pagination?.pages || 1);
    if (data && page > pages) setPage(pages);
  }, [data, page]);

  const events = data?.events || [];
  const pagination = data?.pagination || { page, pages: 1, total: 0, hasMore: false };
  const warning = [sourceAvailabilityError(data), sourceScanLimitWarning(data)].filter(Boolean).join('；');

  return (
    <>
      <div className="ops-toolbar">
        <SegmentedTabs ariaLabel="变更日历范围" idPrefix="change-calendar-range-tab" items={[{ id: 30, label: '30 天' }, { id: 90, label: '90 天' }]} value={period} onChange={(value) => { setPeriod(value); setPage(1); }} />
        <div className="ops-select-label"><span>类型</span><SelectControl ariaLabel="筛选变更类型" value={type} onChange={(value) => { setType(value); setPage(1); }} options={[{ value: 'all', label: '全部类型' }, ...Object.entries(CALENDAR_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} /></div>
        <div className="ops-select-label"><span>服务</span><SelectControl ariaLabel="筛选变更服务" value={selected} onChange={(value) => { setSelected(value); setPage(1); }} options={[{ value: 'all', label: '全部服务' }, ...services.map((service) => ({ value: service.id, label: service.shortName || service.name }))]} /></div>
        <button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新</button>
      </div>
      <Feedback error={error || warning} />
      {loading && !data ? <LoadingBlock label="正在读取变更日历" /> : (
        <section className="ops-panel ops-table-panel" aria-busy={loading}>
          <header><div><span>变更日历</span><h3>发布、配置、维护与事件</h3></div><CalendarDays size={20} /></header>
          <div className="ops-table-head monitoring-table change-calendar-table"><span>开始时间</span><span>类型</span><span>变更</span><span>状态</span><span>范围</span><span>结束时间</span></div>
          {events.length ? events.map((event) => (
            <div className="ops-table-row monitoring-table change-calendar-table" key={event.id}>
              <strong>{formatDateTime(event.startsAt)}</strong>
              <span>{CALENDAR_TYPE_LABELS[event.type] || event.type}</span>
              <span className="audit-target"><strong>{event.title}</strong><small>{event.timeline?.length ? `${event.timeline.length} 个时间线节点` : event.category}</small></span>
              <span>{operationalStatusLabel(event.status, event.type)}</span>
              <span>{event.serviceId || event.scope?.join(', ') || '--'}</span>
              <span>{formatDateTime(event.endsAt)}</span>
            </div>
          )) : <div className="ops-empty">当前筛选范围暂无变更记录</div>}
          <footer className="notify-pagination"><span>共 {pagination.total || 0} 项 · 第 {pagination.page || page} / {Math.max(1, pagination.pages || 1)} 页</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button><button type="button" disabled={!pagination.hasMore || loading} onClick={() => setPage((current) => current + 1)}>下一页</button></div></footer>
        </section>
      )}
    </>
  );
}

function OperationalSearchPanel({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [type, setType] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);

  const runSearch = useCallback(async (value, selectedType) => {
    const normalized = value.trim();
    if (normalized.length < 2) {
      setError('请输入至少 2 个字符');
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const search = new URLSearchParams({ q: normalized, limit: '20' });
      if (selectedType !== 'all') search.set('type', selectedType);
      const result = await requestJson(`/api/operations/search?${search}`, { signal: controller.signal });
      if (requestRef.current === controller) setData(result);
    } catch (requestError) {
      if (requestRef.current === controller && requestError.code !== 'REQUEST_ABORTED') setError(requestError.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => {
    const controller = requestRef.current;
    requestRef.current = null;
    controller?.abort();
  }, []);

  function submit(event) {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 2) {
      setError('请输入至少 2 个字符');
      return;
    }
    setLastQuery(normalized);
    runSearch(normalized, type);
  }

  function changeType(value) {
    setType(value);
    if (lastQuery) runSearch(lastQuery, value);
  }

  const results = data?.results || [];
  const warning = sourceAvailabilityError(data);

  return (
    <>
      <section className="ops-panel">
        <header><div><span>运营检索</span><h3>跨服务查找运营对象</h3></div><Search size={20} /></header>
        <form className="ops-inline-form" role="search" onSubmit={submit}>
          <label>关键词<input type="search" minLength={2} maxLength={80} value={query} placeholder="服务、事件、任务、发布或配置变更" onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="ops-toolbar">
            <SelectControl ariaLabel="筛选检索类型" value={type} onChange={changeType} options={[{ value: 'all', label: '全部类型' }, ...Object.entries(SEARCH_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} />
            <button className="primary-button" type="submit" disabled={loading || query.trim().length < 2}><Search size={17} />检索</button>
            <button className="secondary-action" type="button" disabled={loading || !lastQuery} onClick={() => runSearch(lastQuery, type)}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新</button>
          </div>
        </form>
      </section>
      <Feedback error={error || warning} />
      {loading && !data ? <LoadingBlock label="正在检索运营数据" /> : data ? (
        <section className="ops-panel ops-table-panel" aria-busy={loading}>
          <div className="ops-table-head monitoring-table operational-search-table"><span>类型</span><span>对象</span><span>状态</span><span>服务</span><span>更新时间</span><span>操作</span></div>
          {results.length ? results.map((result) => (
            <div className="ops-table-row monitoring-table operational-search-table" key={result.id}>
              <strong>{SEARCH_TYPE_LABELS[result.type] || result.type}</strong>
              <span className="audit-target"><strong>{result.title}</strong><small>{result.subtitle || result.entityId}</small></span>
              <span>{operationalStatusLabel(result.status, result.type)}</span>
              <span>{result.serviceId || '--'}</span>
              <span>{formatDateTime(result.occurredAt)}</span>
              <span>{result.view && onNavigate ? <button className="secondary-action" type="button" onClick={() => onNavigate(resolveConsoleView(result.view), { entity: result.entityId })}><ExternalLink size={15} />打开对象</button> : '--'}</span>
            </div>
          )) : <div className="ops-empty">没有找到匹配的运营对象</div>}
          <footer className="notify-pagination"><span>{data.truncated ? `匹配 ${data.totalMatched || results.length} 项，仅展示前 ${results.length} 项` : `共 ${data.totalMatched || 0} 项`}</span></footer>
        </section>
      ) : <div className="ops-empty compact">输入关键词开始检索</div>}
    </>
  );
}

export function MonitoringView({ services }) {
  return (
    <section className="page-view ops-page" aria-label="运行趋势">
      <TrendMonitoringPanel services={services} />
    </section>
  );
}

export function IncidentsView({ session, targetEntityId = '', onNavigate }) {
  const [filter, setFilter] = useState(targetEntityId ? 'all' : 'active');
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
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
      setSelectedId((current) => {
        if (targetEntityId && (data.incidents || []).some((item) => item.id === targetEntityId)) return targetEntityId;
        return (data.incidents || []).some((item) => item.id === current) ? current : data.incidents?.[0]?.id || null;
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filter, targetEntityId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!targetEntityId) return;
    setFilter('all');
    setSelectedId(targetEntityId);
  }, [targetEntityId]);
  const selected = incidents.find((incident) => incident.id === selectedId) || null;

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
      setMessage(action === 'acknowledge' ? '事件已确认'
        : action === 'resolve' ? '事件已关闭'
          : action === 'mute' ? '事件已静默'
            : '事件已更新');
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
          {loading && incidents.length === 0 ? <LoadingBlock label="正在读取事件" /> : incidents.length ? incidents.map((incident) => (
            <button type="button" className={`incident-list-row ${selectedId === incident.id ? 'selected' : ''}`} data-entity-id={incident.id} key={incident.id} onClick={() => setSelectedId(incident.id)}>
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
              </dl>
              {onNavigate && (
                <div className="incident-context-actions" aria-label="事件关联工具">
                  <button type="button" onClick={() => onNavigate('diagnostics', { entity: selected.serviceId || null })}><Play size={15} />运行诊断</button>
                  <button type="button" onClick={() => onNavigate('releases')}><Rocket size={15} />检查发布</button>
                  <button type="button" onClick={() => onNavigate('configuration')}><Settings2 size={15} />检查配置</button>
                </div>
              )}
              <div className="incident-timeline">
                {(selected.timeline || []).slice(-8).reverse().map((event, index) => <div key={`${event.at}-${index}`}><i /><span><strong>{event.message}</strong><small>{event.actor} · {formatDateTime(event.at)}</small></span></div>)}
              </div>
              {canOperate && selected.status !== 'resolved' && (
                <div className="incident-actions">
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

export function ReleasesView({ session, targetEntityId = '' }) {
  const [data, setData] = useState(null);
  const { loading, error, setError, runRequest } = useLatestRequest();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [targets, setTargets] = useState(['platform']);
  const [credentials, setCredentials] = useState({ password: '', totp: '' });

  const load = useCallback(async () => {
    await runRequest((signal) => requestJson('/api/releases', { signal }), setData);
  }, [runRequest]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!targetEntityId || !data) return undefined;
    const buildIndex = (data.builds || []).findIndex((build) => build.id === targetEntityId);
    if (buildIndex >= 0) {
      setHistoryExpanded(buildIndex >= RELEASE_HISTORY_COLLAPSED_LIMIT);
    }
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-release-entity-id]')]
        .find((element) => element.dataset.releaseEntityId === targetEntityId);
      target?.scrollIntoView({ block: 'center' });
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [data, targetEntityId]);
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

  if (loading && !data) return <section className="page-view ops-page"><LoadingBlock label="正在读取发布状态" /></section>;
  const capabilities = data?.capabilities || {};
  const metrics = data?.metrics || {};
  const successRate = metrics.completedBuilds ? Math.round((metrics.successfulBuilds / metrics.completedBuilds) * 100) : null;
  const buildRows = data?.builds || [];
  const visibleBuildRows = historyExpanded ? buildRows : buildRows.slice(0, RELEASE_HISTORY_COLLAPSED_LIMIT);
  const hiddenHistoryCount = Math.max(0, buildRows.length - RELEASE_HISTORY_COLLAPSED_LIMIT);
  const mode = capabilities.canBuild ? '可构建' : '只读';
  return (
    <section className="page-view ops-page" aria-label="发布中心">
      <div className="ops-toolbar">
        <div className="release-capabilities">
          <span className={`integration-state ${capabilities.githubConfigured ? 'ready' : ''}`}><i />{capabilities.githubConfigured ? 'GitHub 已连接' : 'GitHub 未配置'}</span>
          <span className="release-environment"><Cloud size={15} />{environmentLabel(data?.environment)}</span>
        </div>
        <div className="release-capabilities">
          <button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} />刷新状态</button>
        </div>
      </div>
      <Feedback error={error || capabilities.issue} message={message} />
      <div className="ops-kpis">
        <article><Rocket size={20} /><div><span>平台版本</span><strong>{data?.revision?.slice(0, 12) || '--'}</strong><small>{data?.imageBuiltAt ? `镜像构建 ${formatDateTime(data.imageBuiltAt)}` : '等待镜像版本标识'}</small></div></article>
        <article><PackageCheck size={20} /><div><span>镜像目标</span><strong>{metrics.configuredComponents || 0}/{data?.components?.length || 0}</strong><small>已配置构建镜像</small></div></article>
        <article><History size={20} /><div><span>完成构建</span><strong>{metrics.completedBuilds || 0}</strong><small>{metrics.latestRevision ? `最新 ${shortValue(metrics.latestRevision)}` : '暂无成功构建'}</small></div></article>
        <article><ShieldCheck size={20} /><div><span>操作模式</span><strong>{mode}</strong><small>{successRate === null ? '暂无持久化构建结果' : `最近构建成功率 ${successRate}%`}</small></div></article>
      </div>

      <section className="ops-panel release-inventory">
        <header><div><span>构建目标</span><h3>组件镜像与最新产物</h3></div><PackageCheck size={20} /></header>
        <div className="release-inventory-head"><span>组件</span><span>配置镜像</span><span>最新不可变产物</span><span>构建时间</span><span>状态</span></div>
        {(data?.components || []).map((component) => {
          const latestBuild = buildRows.find((build) => build.status === 'succeeded'
            && build.artifacts?.some((artifact) => artifact.component === component.id));
          const artifact = latestBuild?.artifacts?.find((item) => item.component === component.id);
          return (
            <div className="release-inventory-row" key={component.id}>
              <span><strong>{component.id}</strong><small>ACR 构建目标</small></span>
              <span className="release-reference"><strong title={component.image || ''}>{component.image || '未配置'}</strong><small>{component.configured ? '环境配置已声明' : '环境配置缺失'}</small></span>
              <span className="release-reference"><strong title={artifact?.reference || ''}>{artifact?.reference || '暂无产物'}</strong><small>{artifact?.digest ? shortValue(artifact.digest, 24) : '等待构建回调'}</small></span>
              <span className="release-lifecycle"><small title={latestBuild?.id || ''}><b>构建</b>{formatDateTime(latestBuild?.completedAt || latestBuild?.updatedAt)}</small></span>
              <span className={`release-sync ${component.configured ? 'synced' : 'unknown'}`}><i />{component.configured ? '已配置' : '未配置'}</span>
            </div>
          );
        })}
      </section>

      <section className="ops-panel release-history">
        <header>
          <div><span>构建记录</span><h3>构建与产物</h3></div>
        </header>
        <div>
        {buildRows.length > 0 && (
          <div className="release-history-head" aria-hidden="true">
            <span /><span>版本 / 任务</span><span>执行人</span><span>执行时间</span><span>耗时 / 同步</span><span>状态</span><span>操作</span>
          </div>
        )}
        {buildRows.length ? visibleBuildRows.map((build) => (
          <div className={`release-history-row ${targetEntityId === build.id ? 'targeted-entity' : ''}`} data-release-entity-id={build.id} key={build.id}>
            <span className={`run-state ${releaseStateClass(build.status)}`}><i /></span>
            <span className="release-run-source"><strong>{shortValue(build.revision || build.id)}</strong><small>{build.observedOnly ? `GitHub 观察 · ${workflowNameLabel(build.name || build.workflow)}` : build.targets?.length ? build.targets.join('、') : workflowNameLabel(build.name || build.workflow)}</small></span>
            <span className="release-run-actor"><strong>{build.requestedBy || build.workflowRun?.actor || '--'}</strong><small>构建发起人</small></span>
            <span className="release-run-date"><strong>{formatDateTime(releaseIsActive(build.status) ? build.startedAt || build.createdAt : build.completedAt || build.updatedAt || build.createdAt)}</strong><small>{releaseIsActive(build.status) ? '开始时间' : '完成时间'}</small></span>
            <span className="release-run-duration">
              <strong className={releaseIsActive(build.status) ? 'live' : ''}>{releaseIsActive(build.status) ? `${releaseTimingVerb(build.status)} ${releaseDuration(build.startedAt || build.createdAt, null, clockNow)}` : releaseDuration(build.startedAt || build.createdAt, build.completedAt || build.updatedAt)}</strong>
              <small>{releaseIsActive(build.status) ? `同步 ${releaseDuration(data?.refreshedAt || build.updatedAt, null, clockNow)}前` : '总耗时'}</small>
            </span>
            <span className={`release-status status-${releaseStateClass(build.status)}`}>{releaseStatusLabel(build.status)}</span>
            <span className="release-row-actions">
              {build.workflowRun?.url && <a href={build.workflowRun.url} target="_blank" rel="noreferrer" aria-label="打开 GitHub 运行记录"><ExternalLink size={15} /></a>}
              {build.observedOnly && <span className="release-observed-badge">未同步</span>}
              {!build.observedOnly && build.status === 'succeeded' && !build.artifacts?.length && <span className="release-observed-badge" title="缺少镜像 digest，等待 GitHub 回调或产物恢复">产物未同步</span>}
            </span>
          </div>
        )) : <div className="ops-empty">暂无构建记录</div>}
        {hiddenHistoryCount > 0 && (
          <div className="release-history-more">
            <button type="button" onClick={() => setHistoryExpanded((current) => !current)}>
              {historyExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              {historyExpanded ? '收起历史记录' : `展开 ${hiddenHistoryCount} 条历史记录`}
            </button>
            <span>显示 {historyExpanded ? buildRows.length : Math.min(RELEASE_HISTORY_COLLAPSED_LIMIT, buildRows.length)} / {buildRows.length}</span>
          </div>
        )}
        </div>
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

    </section>
  );
}

export function SecurityAuditView({ session, onLogout }) {
  const [tab, setTab] = useState('audit');
  const [events, setEvents] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState({ password: '', totp: '' });
  const [enrollment, setEnrollment] = useState(null);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [passkeyName, setPasskeyName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [auditResult, sessionsResult, passkeyResult] = await Promise.all([
        requestJson('/api/audit?limit=200'),
        requestJson('/api/security/sessions'),
        requestJson('/api/security/passkeys'),
      ]);
      setEvents(auditResult.events || []);
      setSessionData(sessionsResult);
      setPasskeys(passkeyResult.passkeys || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
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
        body: JSON.stringify({ challengeId: generated.challengeId, response, name: passkeyName || '快捷登录' }),
      });
      setPasskeyName('');
      setMessage('快捷登录已添加');
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
  const failures = events.filter((event) => event.outcome === 'failure').length;
  return (
    <section className="page-view ops-page" aria-label="账号与安全">
      <div className="ops-toolbar"><SegmentedTabs ariaLabel="安全设置" idPrefix="security-view-tab" panelId="security-view-panel" items={[{ id: 'audit', label: '操作记录' }, { id: 'sessions', label: '登录设备' }, { id: 'authenticators', label: '登录保护' }]} value={tab} onChange={setTab} /><button className="secondary-action" type="button" onClick={load}><RefreshCw size={17} />刷新</button></div>
      <Feedback error={error} message={message} />
      <div className="ops-kpis">
        <article><ShieldCheck size={20} /><div><span>当前账号</span><strong>{session.user?.username || 'admin'}</strong><small>个人管理员</small></div></article>
        <article><KeyRound size={20} /><div><span>登录保护</span><strong>{totpEnabled ? '已开启' : '未开启'}</strong><small>{totpEnabled ? `剩余 ${sessionData?.security?.recoveryCodesRemaining || 0} 个恢复码` : '建议开启'}</small></div></article>
        <article><UserRoundCheck size={20} /><div><span>登录设备</span><strong>{sessionData?.sessions?.length || 0}</strong><small>可让陌生设备退出</small></div></article>
        <article><XCircle size={20} /><div><span>失败操作</span><strong>{failures}</strong><small>最近 200 条记录</small></div></article>
      </div>
      <div id="security-view-panel" role="tabpanel" aria-labelledby={`security-view-tab-${tab}`} aria-busy={loading}>
      {loading && !sessionData ? <LoadingBlock /> : tab === 'audit' ? (
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
            {!enrollment && <div className="ops-inline-form"><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>当前动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={beginTotpEnrollment}><KeyRound size={17} />{totpEnabled ? '重新绑定' : '绑定动态验证码'}</button></div>}
            {enrollment && <div className="totp-enrollment"><img src={enrollment.qrDataUrl} alt="TOTP 二维码" /><code>{enrollment.secret}</code><div className="ops-inline-form"><label>动态验证码<input inputMode="numeric" maxLength={6} value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value.replace(/\D/g, ''))} /></label><button className="primary-button" type="button" disabled={submitting || enrollmentCode.length !== 6} onClick={confirmTotpEnrollment}><Check size={17} />确认绑定</button></div></div>}
            {recoveryCodes.length > 0 && <div className="recovery-code-grid">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>}
            {totpEnabled && !enrollment && <div className="security-auth-actions">
              <button className="secondary-action" type="button" disabled={submitting || !credentials.password || credentials.totp.length !== 6} onClick={regenerateRecoveryCodes}><RefreshCw size={16} />重置恢复码</button>
              <button className="danger-action" type="button" disabled={submitting || !credentials.password || credentials.totp.length !== 6 || session.mfaRequired} onClick={disableTotp}><XCircle size={16} />停用动态验证码</button>
            </div>}
          </section>
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><Fingerprint size={18} /></span><div><strong>设备快捷登录</strong><small>已添加 {passkeys.length} 个设备</small></div></div>
            <div className="ops-inline-form"><label>设备名称<input value={passkeyName} maxLength={64} onChange={(event) => setPasskeyName(event.target.value)} /></label><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={registerPasskey}><Fingerprint size={17} />添加快捷登录</button></div>
            <div className="passkey-list">{passkeys.map((item) => <div className="session-row" key={item.id}><span><Fingerprint size={18} /></span><span><strong>{item.name || '快捷登录'}</strong><small>{item.deviceType || '登录设备'} · {formatDateTime(item.createdAt)}</small></span><button type="button" onClick={() => runSensitive(async () => { await requestJson(`/api/security/passkeys/${encodeURIComponent(item.id)}`, { method: 'DELETE', body: sensitiveBody() }); setMessage('快捷登录已删除'); })}><XCircle size={16} />删除</button></div>)}</div>
          </section>
          <section className="ops-panel security-auth-panel">
            <div className="ops-section-heading"><span><LockKeyhole size={18} /></span><div><strong>登录密码</strong><small>修改后所有会话下线</small></div></div>
            <div className="ops-inline-form"><label>新密码<input type="password" minLength={15} maxLength={256} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>当前密码<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>{totpEnabled && <label>动态验证码<input inputMode="numeric" maxLength={6} value={credentials.totp} onChange={(event) => setCredentials({ ...credentials, totp: event.target.value.replace(/\D/g, '') })} /></label>}<button className="primary-button" type="button" disabled={submitting || newPassword.length < 15 || !credentials.password || (totpEnabled && credentials.totp.length !== 6)} onClick={changePassword}><Save size={17} />修改密码</button></div>
          </section>
        </div>
      ) : null}
      </div>
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
  const canSave = roleAtLeast(session.user?.role, 'operator');
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
      const result = await requestJson('/api/operations/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: draft, summary: '更新监控、告警与灾备运行参数' }),
      });
      setMessage(`变更提案已提交（${result.change.id}），审批通过后生效`);
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

  if (loading && !draft) return <section className="page-view ops-page"><LoadingBlock label="正在读取运行设置" /></section>;
  return (
    <section className="page-view ops-page" aria-label="系统设置与诊断">
      <div className="ops-toolbar"><span className="integration-state ready"><i />配置不包含任何敏感值，修改需经过审批</span>{canSave && <button className="primary-button compact" type="button" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}提交变更审批</button>}</div>
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

export function BackupOffsitePanel({ session, localBackups = [], backupJob = null, canExecuteBackup = false, onExecuteBackup, onImported }) {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(EMPTY_BACKUP_STORAGE);
  const [schedule, setSchedule] = useState({ enabled: false, time: '02:30' });
  const [remoteBackups, setRemoteBackups] = useState([]);
  const [secrets, setSecrets] = useState({ accessKeyId: '', secretAccessKey: '', password: '', totp: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [executedJobId, setExecutedJobId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const backupOffsiteConfigRef = useRef(null);
  const backupOffsiteListRef = useRef(null);
  const canOperate = roleAtLeast(session.user?.role, 'operator');
  const canManage = roleAtLeast(session.user?.role, 'super_admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const loadErrors = [];
    const [configResult, remoteResult, settingsResult] = await Promise.allSettled([
      requestJson('/api/backups/offsite/config'),
      requestJson('/api/backups/offsite'),
      requestJson('/api/operations/settings'),
    ]);
    let next = null;
    if (configResult.status === 'fulfilled') {
      next = configResult.value.config || EMPTY_BACKUP_STORAGE;
      setConfig(next);
      setDraft({ ...EMPTY_BACKUP_STORAGE, ...next, accessKeyId: '', secretAccessKey: '' });
    } else {
      loadErrors.push(configResult.reason.message);
    }
    setRemoteBackups(remoteResult.status === 'fulfilled' ? remoteResult.value.backups || [] : []);
    if (remoteResult.status === 'rejected' && next?.enabled) loadErrors.push(remoteResult.reason.message);
    if (settingsResult.status === 'fulfilled') {
      setSchedule(settingsResult.value.settings?.backupSchedule || { enabled: false, time: '02:30' });
    } else {
      loadErrors.push(settingsResult.reason.message);
    }
    setError(loadErrors.join('；'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const configPanel = backupOffsiteConfigRef.current;
    const remoteList = backupOffsiteListRef.current;
    if (!configPanel || !remoteList) return undefined;

    const syncRemoteListHeight = () => {
      const configHeight = configPanel.offsetHeight;
      const remoteHeader = remoteList.previousElementSibling;
      const headerHeight = remoteHeader?.offsetHeight || 34;
      remoteList.style.maxHeight = configHeight
        ? `${Math.max(180, configHeight - headerHeight - 10)}px`
        : '';
    };

    syncRemoteListHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncRemoteListHeight) : null;
    observer?.observe(configPanel);
    window.addEventListener('resize', syncRemoteListHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncRemoteListHeight);
    };
  }, []);

  useEffect(() => {
    if (!executedJobId || backupJob?.id !== executedJobId || backupJob.status === 'running') return;
    const completedJob = backupJob;
    void load().then(() => {
      setBusy((current) => current === 'execute' ? '' : current);
      setExecutedJobId('');
      if (completedJob.status === 'failed') {
        setMessage('');
        setError(completedJob.error || '备份任务执行失败。');
      } else if (completedJob.result?.offsite?.status === 'failed') {
        setMessage('');
        setError(`本地备份已完成，但远端同步失败：${completedJob.result.offsite.error || '未知错误'}`);
      } else if (completedJob.result?.offsite?.status === 'succeeded') {
        setError('');
        setMessage('备份已完成并保存到远端。');
      } else {
        setMessage('');
        setError('本地备份已完成，但没有收到远端同步成功结果。');
      }
    });
  }, [backupJob, executedJobId, load]);

  function credentialsReady() {
    if (session.authDisabled) return true;
    return Boolean(secrets.password) && (!session.user?.totpEnabled || secrets.totp.length === 6);
  }

  async function saveConfig() {
    if (!credentialsReady()) {
      setError(session.user?.totpEnabled ? '请输入管理员密码和六位动态验证码。' : '请输入管理员密码。');
      return;
    }
    setBusy('save');
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/backups/offsite/config', {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          accessKeyId: secrets.accessKeyId,
          secretAccessKey: secrets.secretAccessKey,
          password: secrets.password,
          totp: secrets.totp,
        }),
      });
      const next = result.config;
      setConfig(next);
      setDraft({ ...EMPTY_BACKUP_STORAGE, ...next, accessKeyId: '', secretAccessKey: '' });
      setSecrets({ accessKeyId: '', secretAccessKey: '', password: '', totp: '' });
      setMessage('外部存储配置已保存。');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function testConnection() {
    if (!credentialsReady()) {
      setError(session.user?.totpEnabled ? '请输入管理员密码和六位动态验证码。' : '请输入管理员密码。');
      return;
    }
    setBusy('test');
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/backups/offsite/test', {
        method: 'POST',
        body: JSON.stringify({ password: secrets.password, totp: secrets.totp }),
      });
      setConfig(result.config);
      setSecrets((current) => ({ ...current, password: '', totp: '' }));
      setMessage('对象存储连接正常。');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function saveSchedule() {
    setBusy('schedule');
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/backups/schedule', {
        method: 'PUT',
        body: JSON.stringify(schedule),
      });
      setSchedule(result.schedule);
      setMessage('自动备份计划已保存并生效。');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function executeBackupNow() {
    if (!onExecuteBackup) return;
    setBusy('execute');
    setError('');
    setMessage('');
    try {
      const result = await onExecuteBackup();
      if (!result?.job?.id) {
        setBusy('');
        setError(result?.error || '备份任务启动失败。');
        return;
      }
      setExecutedJobId(result.job.id);
      setMessage('备份任务已提交，完成后将自动同步到远端。');
    } catch (requestError) {
      setBusy('');
      setError(requestError.message);
    }
  }

  async function importRemote(backup) {
    setBusy(`import:${backup.key}`);
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/backups/offsite/import', {
        method: 'POST',
        body: JSON.stringify({ key: backup.key }),
        timeoutMs: 10 * 60 * 1000,
      });
      setMessage('远端备份已拉回本地。');
      onImported?.(result.backup);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  const localNames = new Set(localBackups.map((backup) => backup.name));
  const encryptionReady = config?.encryptionReady !== false;
  const providerNeedsEndpoint = draft.provider !== 'r2' && draft.provider !== 'aws-s3';
  const providerNeedsAccount = draft.provider === 'r2';

  return (
    <section className="view-card backup-offsite-panel" aria-label="自动备份与外部存储">
      <header className="section-bar">
        <div><h3>自动备份与外部存储</h3><span>{config?.configured ? `${config.provider} · ${config.bucket}` : '尚未配置存储目标'}</span></div>
        <span className={`offsite-health ${config?.healthy === true ? 'healthy' : config?.configured ? 'warning' : 'unknown'}`}>
          <Cloud size={18} />{config?.healthy === true ? '同步正常' : config?.configured ? '等待检查' : '未配置'}
        </span>
      </header>
      <Feedback error={error} message={message} />
      {!encryptionReady && <div className="ops-feedback error"><CircleAlert size={17} />备份存储加密密钥未配置</div>}
      <div className="backup-offsite-layout">
        <div className="backup-offsite-config" ref={backupOffsiteConfigRef}>
          <div className="offsite-subsection-head"><span>每日计划</span><FileClock size={18} /></div>
          <div className="offsite-schedule-controls">
            <label className="toggle-field"><span><strong>自动备份</strong><small>每日执行</small></span><input type="checkbox" checked={schedule.enabled} disabled={!canOperate || loading} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} /></label>
            <label><span>执行时间</span><input type="time" value={schedule.time} disabled={!canOperate || loading} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} /></label>
            <div className="offsite-schedule-actions">
              <button className="secondary-action" type="button" disabled={!canOperate || loading || busy === 'schedule'} onClick={saveSchedule}>{busy === 'schedule' ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}保存计划</button>
              <button className="primary-button" type="button" disabled={!canOperate || !canExecuteBackup || !config?.configured || !config?.enabled || loading || busy === 'execute'} onClick={executeBackupNow}>{busy === 'execute' || backupJob?.status === 'running' ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{busy === 'execute' || backupJob?.status === 'running' ? '正在执行' : '立即执行'}</button>
            </div>
          </div>

          <div className="offsite-subsection-head"><span>S3 兼容目标</span><DatabaseBackup size={18} /></div>
          <div className="offsite-config-grid">
            <label className="toggle-field"><span><strong>启用异地同步</strong><small>单一目标</small></span><input type="checkbox" checked={draft.enabled} disabled={!canManage || loading} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label>
            <div className="settings-control-field"><span>存储类型</span><SelectControl ariaLabel="外部存储类型" disabled={!canManage || loading} value={draft.provider} options={BACKUP_STORAGE_PROVIDERS} onChange={(provider) => setDraft({ ...draft, provider, accountId: '', endpoint: '', region: provider === 'r2' ? 'auto' : 'us-east-1', bucket: '', forcePathStyle: provider === 'minio' })} /></div>
            {providerNeedsAccount && <label><span>Cloudflare Account ID</span><input value={draft.accountId} disabled={!canManage} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} /></label>}
            {providerNeedsEndpoint && <label><span>Endpoint</span><input type="url" value={draft.endpoint} disabled={!canManage} placeholder="https://s3.example.com" onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} /></label>}
            <label><span>Region</span><input value={draft.region} disabled={!canManage || draft.provider === 'r2'} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
            <label><span>Bucket</span><input value={draft.bucket} disabled={!canManage} onChange={(event) => setDraft({ ...draft, bucket: event.target.value })} /></label>
            <label><span>对象前缀</span><input value={draft.prefix} disabled={!canManage} onChange={(event) => setDraft({ ...draft, prefix: event.target.value })} /></label>
            <label><span>本地保留天数</span><input type="number" min="1" max="14" value={draft.localRetentionDays} disabled={!canManage} onChange={(event) => setDraft({ ...draft, localRetentionDays: Number(event.target.value) })} /></label>
            <label><span>远端保留天数</span><input type="number" min="1" max="14" value={draft.remoteRetentionDays} disabled={!canManage} onChange={(event) => setDraft({ ...draft, remoteRetentionDays: Number(event.target.value) })} /></label>
            <label className="toggle-field"><span><strong>Path Style</strong><small>MinIO 常用</small></span><input type="checkbox" checked={draft.forcePathStyle} disabled={!canManage} onChange={(event) => setDraft({ ...draft, forcePathStyle: event.target.checked })} /></label>
            <label><span>Access Key ID</span><input type="password" autoComplete="new-password" value={secrets.accessKeyId} disabled={!canManage} placeholder={config?.accessKeyIdMasked || 'Access Key ID'} onChange={(event) => setSecrets({ ...secrets, accessKeyId: event.target.value })} /></label>
            <label><span>Secret Access Key</span><input type="password" autoComplete="new-password" value={secrets.secretAccessKey} disabled={!canManage} placeholder={config?.secretConfigured ? '已保存，留空则不修改' : 'Secret Access Key'} onChange={(event) => setSecrets({ ...secrets, secretAccessKey: event.target.value })} /></label>
            {!session.authDisabled && <label><span>管理员密码</span><input type="password" autoComplete="current-password" value={secrets.password} disabled={!canManage} onChange={(event) => setSecrets({ ...secrets, password: event.target.value })} /></label>}
            {!session.authDisabled && session.user?.totpEnabled && <label><span>动态验证码</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={secrets.totp} disabled={!canManage} onChange={(event) => setSecrets({ ...secrets, totp: event.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>}
          </div>
          {canManage && <div className="offsite-config-actions"><button className="secondary-action" type="button" disabled={!config?.configured || !config?.enabled || loading || busy === 'test' || !encryptionReady} onClick={testConnection}>{busy === 'test' ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}测试已保存配置</button><button className="primary-button" type="button" disabled={loading || busy === 'save' || !encryptionReady} onClick={saveConfig}>{busy === 'save' ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}保存存储配置</button></div>}
        </div>

        <div className="backup-offsite-remote">
          <div className="offsite-subsection-head"><span>远端备份</span><button className="backup-row-action" type="button" title="刷新远端清单" aria-label="刷新远端清单" onClick={load} disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}</button></div>
          <div className="offsite-backup-list" ref={backupOffsiteListRef}>
            {loading ? <LoadingBlock label="正在读取远端备份" /> : remoteBackups.length > 0 ? remoteBackups.map((backup) => {
              const existsLocally = localNames.has(backup.name);
              const importing = busy === `import:${backup.key}`;
              return <div className="offsite-backup-row" key={backup.key}><span><strong>{backup.name}</strong><small>{formatDateTime(backup.createdAt)}</small></span><span>{formatBackupBytes(backup.sizeBytes)}</span><span className={existsLocally ? 'healthy' : 'unknown'}>{existsLocally ? '本地已有' : '仅远端'}</span><button className="backup-row-action" type="button" title="拉回本地" aria-label={`拉回远端备份 ${backup.name}`} disabled={!canOperate || existsLocally || importing} onClick={() => importRemote(backup)}>{importing ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}</button></div>;
            }) : <div className="ops-empty compact">暂无远端备份</div>}
          </div>
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
      <div className={`quality-item ${quality.restoreDrillState === 'verified' ? 'healthy' : 'warning'}`}><DatabaseBackup size={18} /><span><strong>{quality.lastRestoreDrillAt ? formatDateTime(quality.lastRestoreDrillAt) : '尚未演练'}</strong><small>{quality.nextRestoreDrillAt ? `下次应在 ${formatDateTime(quality.nextRestoreDrillAt)} 前完成` : '需要完成首次恢复演练'}</small></span></div>
      <div className={`quality-item ${quality.restoreRtoState === 'met' ? 'healthy' : quality.restoreRtoState === 'breached' ? 'warning' : 'unknown'}`}><Gauge size={18} /><span><strong>{quality.restoreDurationMinutes === null ? '暂无耗时' : `${quality.restoreDurationMinutes} 分钟`}</strong><small>最近恢复耗时 · RTO {quality.restoreRtoMinutes} 分钟</small></span></div>
      <div className={`quality-item ${quality.offsite.healthy === true ? 'healthy' : quality.offsite.configured ? 'warning' : 'unknown'}`}><Cloud size={18} /><span><strong>{quality.offsite.healthy === true ? '同步正常' : quality.offsite.configured ? '同步异常' : '未配置'}</strong><small>异地备份状态</small></span></div>
      <div className={`quality-item ${quality.schedule.enabled ? 'healthy' : 'unknown'}`}><FileClock size={18} /><span><strong>{quality.schedule.enabled ? `每日 ${quality.schedule.time}` : '手动执行'}</strong><small>自动备份计划</small></span></div>
      {(quality.restoreDrills || []).length > 0 && (
        <details className="backup-drill-evidence">
          <summary>最近恢复演练证据（{quality.restoreDrills.length}）</summary>
          <div>{quality.restoreDrills.slice(0, 5).map((drill) => <span key={drill.id}><strong>{formatDateTime(drill.occurredAt)}</strong><small>{drill.durationMinutes === null ? '耗时未记录' : `${drill.durationMinutes} 分钟`} · {drill.actor || 'system'} · {drill.backupName || '备份归档'}</small></span>)}</div>
        </details>
      )}
    </section>
  );
}
