import {
  Activity,
  Archive,
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Network,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { HolographicTopology } from './HolographicTopology.jsx';
import { formatCheckedAt, SERVICE_ICONS, STATE_META, STATE_PRIORITY } from './shared.jsx';

const LAUNCHER_TONES = {
  core: 'blue',
  exam: 'cyan',
  campus: 'amber',
  mqtt: 'purple',
  notify: 'green',
  'ct8-automation': 'slate',
  platform: 'blue',
};

export function OperationsChart({ services, history = {} }) {
  const chartServices = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .slice(0, 6);
  const items = chartServices.length > 0 ? chartServices : services.slice(0, 6);
  const values = items.map((service) => service.latencyMs || 0);
  const fastest = values.length > 0 ? Math.min(...values) : null;
  const onlineValues = items
    .filter((service) => !['offline', 'unmonitored'].includes(service.state) && Number.isFinite(service.latencyMs))
    .map((service) => service.latencyMs);
  const average = onlineValues.length > 0
    ? Math.round(onlineValues.reduce((sum, value) => sum + value, 0) / onlineValues.length)
    : null;
  const peak = values.length > 0 ? Math.max(...values) : null;
  const series = items.map((service) => {
    const persisted = history[service.id]?.samples || [];
    const samples = persisted.filter((sample) => Number.isFinite(sample.latencyMs));
    return {
      service,
      samples: samples.length ? samples : Number.isFinite(service.latencyMs)
        ? [{ recordedAt: service.checkedAt || new Date().toISOString(), latencyMs: service.latencyMs }]
        : [],
    };
  });
  const historyValues = series.flatMap((entry) => entry.samples.map((sample) => sample.latencyMs));
  const historyTimes = series.flatMap((entry) => entry.samples.map((sample) => Date.parse(sample.recordedAt))).filter(Number.isFinite);
  const maximum = Math.max(...historyValues, 1);
  const minimumPositive = Math.min(...historyValues.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaleLatency = (value) => useLogScale ? Math.log10(value + 1) : value;
  const scaledMaximum = scaleLatency(maximum);
  const startTime = Math.min(...historyTimes, Date.now());
  const endTime = Math.max(...historyTimes, startTime + 1);
  const width = 620;
  const height = 220;
  const xStart = 28;
  const xEnd = 592;
  const xFor = (recordedAt) => xStart + ((Date.parse(recordedAt) - startTime) / (endTime - startTime)) * (xEnd - xStart);
  const yFor = (latencyMs) => 178 - (scaleLatency(latencyMs) / scaledMaximum) * 116;
  const colors = ['#2877f7', '#11ad78', '#ff8a00', '#8a45ef', '#d75467', '#13bad6'];

  return (
    <div className="operations-chart">
      <div className="chart-summary" aria-label="响应时间摘要">
        <span className="fast"><i /> 最快 {fastest === null ? '--' : `${fastest} ms`}</span>
        <span className="average"><i /> 在线平均 {average === null ? '--' : `${average} ms`}</span>
        <span className="peak"><i /> 峰值 {peak === null ? '--' : `${peak} ms`}</span>
      </div>
      {items.length > 0 ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="服务响应与健康状态趋势图">
            <defs>
              <linearGradient id="chart-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#23c4df" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#23c4df" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[60, 118, 178].map((y) => <line className="chart-grid-line" key={y} x1="22" x2="598" y1={y} y2={y} />)}
            {series.map((entry, index) => {
              const points = entry.samples.map((sample) => `${xFor(sample.recordedAt)},${yFor(sample.latencyMs)}`).join(' ');
              return points ? <polyline className="chart-line" key={entry.service.id} points={points} style={{ stroke: colors[index] }} /> : null;
            })}
          </svg>
          <div className="chart-service-legend">
            {series.map((entry, index) => <span key={entry.service.id}><i style={{ background: colors[index] }} />{entry.service.shortName || entry.service.name}</span>)}
          </div>
        </>
      ) : (
        <div className="chart-empty"><LoaderCircle className="spin" size={18} /> 正在同步服务趋势</div>
      )}
    </div>
  );
}
export function OverviewView({
  services,
  counts,
  total,
  healthyRate,
  attentionCount,
  loading,
  environmentLabel,
  monitoringEnabled,
  setMonitoringEnabled,
  launchService,
  refreshedAt,
  operationsSummary,
  refreshing = false,
  onRefresh = () => {},
  onOpenServices,
  onOpenService = onOpenServices,
  onOpenIncidents,
  onOpenBackup = () => {},
}) {
  const sortedServices = [...services].sort((left, right) => (
    (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));

  const latencies = services.map((s) => s.latencyMs).filter(Number.isFinite);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const serviceTotal = total || services.length;
  const healthyCount = counts.healthy ?? 0;
  const incidentCount = operationsSummary?.incidents?.length ?? attentionCount;
  const lastRefreshLabel = refreshedAt ? formatCheckedAt(refreshedAt) : '等待首次同步';
  const overviewState = loading
    ? '正在同步全网状态'
    : incidentCount > 0
      ? '有服务需要看看'
      : '服务运行正常';

  return (
    <div className="overview-page modern-executive-cockpit">
      <section className="cockpit-overview-strip" aria-label="全网运行摘要">
        <div className="cockpit-overview-primary">
          <span className="cockpit-overview-icon"><Network size={21} /></span>
          <span>
            <strong>{overviewState}</strong>
            <small>{environmentLabel} · 更新于 {lastRefreshLabel}</small>
          </span>
        </div>
        <div className="cockpit-overview-metric">
          <span><i className="status-indicator" />服务可用</span>
          <strong>{healthyCount} / {serviceTotal}</strong>
          <small>{healthyRate.toFixed(1)}% 当前正常比例</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><Activity size={13} />平均响应</span>
          <strong>{avgLatency === null ? '--' : `${avgLatency} ms`}</strong>
          <small>{latencies.length > 0 ? `已检查 ${latencies.length} 个服务` : '暂无响应数据'}</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><CircleAlert size={13} />需要处理</span>
          <strong className={incidentCount > 0 ? 'has-attention' : ''}>{incidentCount}</strong>
          <small>{incidentCount > 0 ? '有问题需要处理' : '当前没有需要处理的问题'}</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><CheckCircle2 size={13} />最近检查</span>
          <strong className="overview-time-value">{lastRefreshLabel}</strong>
          <small>所有服务的同步时间</small>
        </div>
      </section>

      <section className="cockpit-three-columns">
        <div className="cockpit-side-col left-col">
          <article className="cockpit-panel service-launcher-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <Boxes size={16} />
                <h3>常用服务</h3>
              </div>
              <button className="icon-text-btn" type="button" onClick={onOpenServices} title="查看所有服务">
                查看全部 <ArrowRight size={13} />
              </button>
            </header>
            <div className="service-status-list combined-service-status-list">
              {sortedServices.length > 0 ? sortedServices.map((srv) => {
                const ServiceIcon = SERVICE_ICONS[srv.id] || AppWindow;
                const launcherTone = LAUNCHER_TONES[srv.id] || 'blue';
                const state = STATE_META[srv.state] || STATE_META.unmonitored;
                const stateLabel = srv.state === 'unmonitored' ? '未检查' : state.label;
                const open = () => (srv.adminUrl ? launchService(srv) : onOpenService?.(srv));
                return (
                  <button
                    key={srv.id}
                    className="launcher-card-item"
                    type="button"
                    title={`一键进入【${srv.name}】`}
                    onClick={open}
                  >
                    <span className={`service-status-row-icon launcher-service-icon tone-${launcherTone}`}><ServiceIcon size={15} /></span>
                    <span className="service-status-row-copy">
                      <strong>{srv.shortName || srv.name}</strong>
                      <small><i className={`status-indicator state-${srv.state}`} />{stateLabel} · {formatCheckedAt(srv.checkedAt)}</small>
                    </span>
                    <span className="service-status-row-latency">{Number.isFinite(srv.latencyMs) ? `${srv.latencyMs} ms` : '--'}</span>
                    <ArrowUpRight size={14} />
                  </button>
                );
              }) : (
                <div className="service-status-empty"><LoaderCircle className="spin" size={18} />正在读取服务状态</div>
              )}
            </div>
          </article>

          <article className="cockpit-panel quick-ops-panel">
            <header className="panel-header">
              <Zap size={16} />
              <h3>常用操作</h3>
            </header>
            <div className="quick-ops-actions">
              <button className="quick-ops-btn" type="button" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={refreshing ? 'spin' : ''} size={14} />
                <span>{refreshing ? '正在刷新服务' : '刷新服务状态'}</span>
                <ChevronRight size={14} />
              </button>
              <button className="quick-ops-btn" type="button" onClick={onOpenServices}>
                <AppWindow size={14} />
                <span>打开业务入口</span>
                <ChevronRight size={14} />
              </button>
              <button className="quick-ops-btn" type="button" onClick={onOpenIncidents}>
                <CircleAlert size={14} />
                <span>{incidentCount > 0 ? `处理问题 (${incidentCount})` : '查看服务状态'}</span>
                <ChevronRight size={14} />
              </button>
              <button className="quick-ops-btn" type="button" onClick={onOpenBackup}>
                <Archive size={14} />
                <span>备份重要数据</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </article>
        </div>

        <div className="cockpit-center-col">
          <article className="cockpit-panel topology-panel">
            <HolographicTopology
              services={services}
              monitoringEnabled={monitoringEnabled}
              onToggleMonitoring={() => setMonitoringEnabled((enabled) => !enabled)}
              onSelectService={launchService}
            />
          </article>
        </div>

        <div className="cockpit-side-col right-col">
          <article className="cockpit-panel service-summary-panel">
            <header className="panel-header">
              <CheckCircle2 size={16} />
              <h3>服务状态</h3>
            </header>
            <div className="service-summary-grid">
              <div className="service-summary-item healthy">
                <span><i className="status-indicator" />正常</span>
                <strong>{healthyCount}</strong>
              </div>
              <div className="service-summary-item degraded">
                <span><i className="status-indicator state-degraded" />响应慢</span>
                <strong>{counts.degraded ?? 0}</strong>
              </div>
              <div className="service-summary-item offline">
                <span><i className="status-indicator state-offline" />不可用</span>
                <strong>{counts.offline ?? 0}</strong>
              </div>
              <div className="service-summary-item unmonitored">
                <span><i className="status-indicator state-unmonitored" />待检查</span>
                <strong>{counts.unmonitored ?? 0}</strong>
              </div>
            </div>
          </article>

          <article className="cockpit-panel alerts-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <CircleAlert size={16} />
                <h3>需要处理</h3>
              </div>
              <span className="alerts-badge">{incidentCount > 0 ? `${incidentCount} 项` : '正常'}</span>
            </header>
            <div className="alerts-list-body">
              {(operationsSummary?.incidents || []).slice(0, 3).map((incident) => (
                <button className="alert-row" type="button" key={incident.id} onClick={onOpenIncidents}>
                  <span className="a-time">{formatCheckedAt(incident.lastSeenAt || incident.updatedAt || incident.openedAt)}</span>
                  <span className="a-msg">{incident.title || '运行事件待处理'}</span>
                  <i className={`a-dot ${['critical', 'high', 'warning'].includes(incident.severity) ? 'warn' : 'ok'}`} />
                </button>
              ))}
              {(operationsSummary?.incidents || []).length === 0 && (
                <div className="alerts-empty">
                  {incidentCount > 0 ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
                  {incidentCount > 0 ? '有服务状态异常，请打开服务状态查看' : '当前没有需要处理的问题'}
                </div>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
