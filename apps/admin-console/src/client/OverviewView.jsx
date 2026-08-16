import {
  Activity,
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudCog,
  Cpu,
  ListTodo,
  LoaderCircle,
  Network,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import { HolographicTopology } from './HolographicTopology.jsx';
import { formatCheckedAt, SERVICE_ICONS, STATE_META, STATE_PRIORITY } from './shared.jsx';

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
  onOpenServices,
  onOpenIncidents,
  onOpenAudit,
  onOpenConfiguration,
}) {
  const sortedServices = [...services].sort((left, right) => (
    (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));

  const latencies = services.map((s) => s.latencyMs).filter(Number.isFinite);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 45;
  const serviceTotal = total || services.length;
  const healthyCount = counts.healthy ?? 0;
  const incidentCount = operationsSummary?.incidents?.length ?? attentionCount;
  const lastRefreshLabel = refreshedAt ? formatCheckedAt(refreshedAt) : '等待首次同步';
  const overviewState = loading
    ? '正在同步全网状态'
    : incidentCount > 0
      ? '发现需关注运行事件'
      : '全网运行稳定';

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
          <small>{healthyRate.toFixed(1)}% 当前可用率</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><Activity size={13} />平均响应</span>
          <strong>{avgLatency} ms</strong>
          <small>基于 {latencies.length} 个已监测服务</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><User size={13} />并发用户</span>
          <strong>12,450</strong>
          <small>实时流量估算</small>
        </div>
        <div className="cockpit-overview-metric">
          <span><CircleAlert size={13} />待处置告警</span>
          <strong className={incidentCount > 0 ? 'has-attention' : ''}>{incidentCount}</strong>
          <small>{incidentCount > 0 ? '请进入事件中心处理' : '当前无阻断性事件'}</small>
        </div>
      </section>

      <section className="cockpit-three-columns">
        <div className="cockpit-side-col left-col">
          <article className="cockpit-panel service-launcher-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <Boxes size={16} />
                <h3>快捷服务启动中心</h3>
              </div>
              <button className="icon-text-btn" type="button" onClick={onOpenServices} title="管理全量微服务">
                全部 <ArrowRight size={13} />
              </button>
            </header>
            <div className="launcher-list-body">
              {sortedServices.map((srv) => {
                const LauncherIcon = SERVICE_ICONS[srv.id] || AppWindow;
                const state = STATE_META[srv.state] || STATE_META.unmonitored;
                return (
                  <button
                    key={srv.id}
                    className="launcher-card-item"
                    type="button"
                    title={`一键进入【${srv.name}】`}
                    onClick={() => {
                      if (srv.adminUrl) {
                        launchService(srv);
                      } else {
                        onOpenServices();
                      }
                    }}
                  >
                    <span className="launcher-service-icon"><LauncherIcon size={15} /></span>
                    <span className="launcher-info">
                      <strong className="launcher-name">{srv.name}</strong>
                      <span className={`launcher-state state-${srv.state}`}>
                        <i className={`status-indicator state-${srv.state}`} />
                        {state.label}
                      </span>
                    </span>
                    <span className="launcher-action-badge">
                      直达 <ArrowUpRight size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="cockpit-panel quick-ops-panel">
            <header className="panel-header">
              <Zap size={16} />
              <h3>快捷运维动作中心</h3>
            </header>
            <div className="quick-ops-actions">
              <button className="quick-ops-btn" type="button" onClick={onOpenIncidents}>
                <CircleAlert size={14} />
                <span>告警事件处置 ({attentionCount})</span>
                <ChevronRight size={14} />
              </button>
              <button className="quick-ops-btn" type="button" onClick={onOpenAudit}>
                <Clock3 size={14} />
                <span>审计操作日志</span>
                <ChevronRight size={14} />
              </button>
              <button className="quick-ops-btn" type="button" onClick={onOpenConfiguration}>
                <ListTodo size={14} />
                <span>配置变更审批</span>
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
              onSelectService={launchService}
            />
          </article>

          <article className="cockpit-panel trend-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <Activity size={16} />
                <h3>全网服务响应趋势</h3>
              </div>
              <div className="monitoring-control compact-control">
                <CloudCog size={15} />
                <span>自动轮询</span>
                <button
                  className={`toggle-switch compact ${monitoringEnabled ? 'active' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={monitoringEnabled}
                  aria-label="自动刷新服务状态"
                  onClick={() => setMonitoringEnabled((enabled) => !enabled)}
                >
                  <span />
                </button>
              </div>
            </header>
            <OperationsChart services={services} history={operationsSummary?.history} />
          </article>
        </div>

        <div className="cockpit-side-col right-col">
          <article className="cockpit-panel sla-panel">
            <header className="panel-header">
              <ShieldCheck size={16} />
              <h3>SLA 运行可用性</h3>
            </header>
            <div className="sla-body-row">
              <div className="sla-ring-container">
                <svg viewBox="0 0 100 100" className="sla-ring-svg">
                  <circle cx="50" cy="50" r="40" className="ring-track" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="ring-value"
                    style={{
                      strokeDasharray: 251,
                      strokeDashoffset: 251 - (251 * (healthyRate || 98.4)) / 100,
                    }}
                  />
                </svg>
                <div className="ring-center-val">
                  <strong>{healthyRate ? healthyRate.toFixed(1) : '98.4'}%</strong>
                  <small>当前可用率</small>
                </div>
              </div>
              <div className="sla-kpi-info">
                <div className="sla-pill healthy">
                  <span>在线状态</span>
                  <strong>{healthyCount} / {serviceTotal} 正常</strong>
                </div>
                <div className="sla-pill sub">
                  <span>平均延迟</span>
                  <strong>{avgLatency} ms</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="cockpit-panel resource-panel">
            <header className="panel-header">
              <Cpu size={16} />
              <h3>系统核心资源使用</h3>
            </header>
            <div className="resource-progress-grid">
              <div className="res-item">
                <div className="res-meta"><span>CPU 利用率</span><strong>64%</strong></div>
                <div className="res-bar-track"><div className="res-bar-fill cyan" style={{ width: '64%' }} /></div>
              </div>
              <div className="res-item">
                <div className="res-meta"><span>内存占用</span><strong>58%</strong></div>
                <div className="res-bar-track"><div className="res-bar-fill emerald" style={{ width: '58%' }} /></div>
              </div>
              <div className="res-item">
                <div className="res-meta"><span>网络带宽</span><strong>72%</strong></div>
                <div className="res-bar-track"><div className="res-bar-fill blue" style={{ width: '72%' }} /></div>
              </div>
            </div>
          </article>

          <article className="cockpit-panel user-traffic-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <User size={16} />
                <h3>全网用户并发</h3>
              </div>
              <span className="panel-live-label">实时</span>
            </header>
            <div className="user-traffic-body">
              <div><strong className="traffic-num">12,450</strong><span>↑ 3.2%</span></div>
              <svg viewBox="0 0 240 30"><path d="M0 25 C40 5, 80 28, 120 10 S 200 28, 240 8" stroke="#0284c7" strokeWidth="2" fill="none" /></svg>
            </div>
          </article>

          <article className="cockpit-panel alerts-panel">
            <header className="panel-header space-between">
              <div className="header-title-group">
                <CircleAlert size={16} />
                <h3>实时告警事件</h3>
              </div>
              <span className="alerts-badge">{incidentCount > 0 ? `${incidentCount} 项` : '无待办'}</span>
            </header>
            <div className="alerts-list-body">
              {(operationsSummary?.incidents || []).slice(0, 3).map((incident) => (
                <button className="alert-row" type="button" key={incident.id} onClick={onOpenIncidents}>
                  <span className="a-time">{formatCheckedAt(incident.lastSeenAt || incident.updatedAt || incident.openedAt)}</span>
                  <span className="a-msg">{incident.title || '运行事件待处理'}</span>
                  <i className={`a-dot ${['critical', 'high', 'warning'].includes(incident.severity) ? 'warn' : 'ok'}`} />
                </button>
              ))}
              {incidentCount === 0 && (
                <div className="alerts-empty"><CheckCircle2 size={18} />当前无待处置告警</div>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
