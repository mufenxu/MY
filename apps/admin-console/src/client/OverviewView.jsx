import {
  Activity,
  AppWindow,
  Archive,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Settings,
  Zap,
} from 'lucide-react';
import { HolographicTopology } from './HolographicTopology.jsx';
import { Metric, Ruler, StatusTag } from './Pearl.jsx';
import { formatCheckedAt, SERVICE_ICONS, STATE_META, STATE_PRIORITY } from './shared.jsx';

const CHART_WIDTH = 760;
const CHART_HEIGHT = 196;
const CHART_PAD = { top: 14, right: 14, bottom: 24, left: 40 };

function formatClock(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

/**
 * 把各服务的历史采样按时间等分成桶，算出每个桶的全网平均响应。
 * 没有足够历史时退化为“各服务响应对比”，避免画一条假曲线。
 */
function buildLatencySeries(services, history) {
  const all = [];
  for (const service of services) {
    const samples = history?.[service.id]?.samples || [];
    for (const sample of samples) {
      const recordedAt = Date.parse(sample.recordedAt);
      if (Number.isFinite(recordedAt) && Number.isFinite(sample.latencyMs)) {
        all.push({ recordedAt, latencyMs: sample.latencyMs });
      }
    }
  }

  if (all.length >= 4) {
    const times = all.map((sample) => sample.recordedAt);
    const startTime = Math.min(...times);
    const endTime = Math.max(...times);
    const span = Math.max(endTime - startTime, 60_000);
    const bucketCount = 26;
    const buckets = Array.from({ length: bucketCount }, () => []);
    for (const sample of all) {
      const index = Math.min(bucketCount - 1, Math.floor(((sample.recordedAt - startTime) / span) * bucketCount));
      buckets[index].push(sample.latencyMs);
    }
    const points = buckets
      .map((values, index) => (values.length ? {
        time: startTime + ((index + 0.5) / bucketCount) * span,
        value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      } : null))
      .filter(Boolean);

    if (points.length >= 3) {
      const values = points.map((point) => point.value);
      return {
        mode: 'trend',
        points,
        startTime,
        endTime,
        average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
        peak: Math.max(...values),
        lowest: Math.min(...values),
      };
    }
  }

  const compare = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .map((service) => ({ id: service.id, name: service.shortName || service.name, latencyMs: service.latencyMs }))
    .sort((left, right) => right.latencyMs - left.latencyMs);

  return compare.length ? { mode: 'compare', items: compare } : { mode: 'empty' };
}

export function OperationsChart({ services = [], history = {} }) {
  const series = buildLatencySeries(services, history);

  if (series.mode === 'empty') {
    return <div className="trend-empty"><LoaderCircle className="spin" size={17} /> 正在同步服务响应数据</div>;
  }

  if (series.mode === 'compare') {
    const maximum = Math.max(...series.items.map((item) => item.latencyMs), 1);
    return (
      <div className="compare-chart">
        {series.items.map((item) => (
          <div className="compare-row" key={item.id}>
            <span className="compare-name">{item.name}</span>
            <span className="compare-track">
              <i style={{ width: `${Math.max(4, Math.round((item.latencyMs / maximum) * 100))}%` }} />
            </span>
            <span className="compare-value">{item.latencyMs} ms</span>
          </div>
        ))}
      </div>
    );
  }

  const plotWidth = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const plotHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const ceiling = Math.max(series.peak * 1.18, 10);
  const xFor = (index) => CHART_PAD.left + (series.points.length > 1 ? (index / (series.points.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (value) => CHART_PAD.top + plotHeight - (value / ceiling) * plotHeight;
  const line = series.points.map((point, index) => `${xFor(index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(' ');
  const area = `${CHART_PAD.left},${CHART_PAD.top + plotHeight} ${line} ${CHART_PAD.left + plotWidth},${CHART_PAD.top + plotHeight}`;
  const lastIndex = series.points.length - 1;

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`全网平均响应趋势，平均 ${series.average} 毫秒，峰值 ${series.peak} 毫秒`}
    >
      <defs>
        <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((ratio) => {
        const y = CHART_PAD.top + plotHeight * ratio;
        const value = Math.round(ceiling * (1 - ratio));
        return (
          <g key={ratio}>
            <line className="grid-line" x1={CHART_PAD.left} x2={CHART_PAD.left + plotWidth} y1={y} y2={y} />
            <text className="axis-label" x={CHART_PAD.left - 8} y={y + 3} textAnchor="end">{value}</text>
          </g>
        );
      })}

      <polygon className="series-area" points={area} />
      <polyline className="series-line" points={line} />
      <line className="now-line" x1={xFor(lastIndex)} x2={xFor(lastIndex)} y1={CHART_PAD.top} y2={CHART_PAD.top + plotHeight} />
      <circle className="series-dot" cx={xFor(lastIndex)} cy={yFor(series.points[lastIndex].value)} r="3.4" />
      <text className="now-label" x={xFor(lastIndex) - 6} y={CHART_PAD.top + 9} textAnchor="end">现在</text>
      <text className="axis-label" x={CHART_PAD.left} y={CHART_HEIGHT - 6}>{formatClock(series.points[0].time)}</text>
      <text className="axis-label" x={CHART_PAD.left + plotWidth} y={CHART_HEIGHT - 6} textAnchor="end">{formatClock(series.points[lastIndex].time)}</text>
    </svg>
  );
}

function ServiceRow({ service, onOpen }) {
  const Icon = SERVICE_ICONS[service.id] || AppWindow;
  const meta = STATE_META[service.state] || STATE_META.unmonitored;
  const latency = Number.isFinite(service.latencyMs) ? service.latencyMs : null;

  return (
    <tr>
      <td>
        <span className="service-name-cell">
          <span className="cell-icon" aria-hidden="true"><Icon size={15} /></span>
          <span>
            <strong>{service.shortName || service.name}</strong>
            <small>{service.repositoryPath || service.name}</small>
          </span>
        </span>
      </td>
      <td><StatusTag state={service.state} label={meta.shortLabel} /></td>
      <td className="col-num">
        <span className={`latency-cell ${latency !== null && latency > 1200 ? 'is-slow' : ''}`}>
          {latency === null ? '--' : `${latency} ms`}
        </span>
      </td>
      <td className="col-num"><span className="code-chip">{service.httpStatus ?? '--'}</span></td>
      <td><span className="cell-sub">{formatCheckedAt(service.checkedAt)}</span></td>
      <td className="col-actions">
        {service.adminUrl ? (
          <button className="icon-action" type="button" onClick={() => onOpen(service)} aria-label={`进入${service.name}`}>
            <ArrowUpRight size={15} />
          </button>
        ) : <span className="cell-sub">--</span>}
      </td>
    </tr>
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
  onOpenConfiguration = () => {},
}) {
  const sortedServices = [...services].sort((left, right) => (
    (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
    || left.name.localeCompare(right.name, 'zh-CN')
  ));

  const latencies = services.map((service) => service.latencyMs).filter(Number.isFinite);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const serviceTotal = total || services.length;
  const healthyCount = counts.healthy ?? 0;
  const incidents = operationsSummary?.incidents || [];
  const incidentCount = operationsSummary?.incidents?.length ?? attentionCount;
  const lastRefreshLabel = refreshedAt ? formatCheckedAt(refreshedAt) : '等待首次同步';
  const history = operationsSummary?.history || {};
  const overviewState = loading
    ? '正在同步全网状态'
    : incidentCount > 0
      ? '有服务需要看看'
      : '服务运行正常';
  const openService = (service) => (service.adminUrl ? launchService(service) : onOpenService?.(service));

  return (
    <>
      <section className="hero-grid" aria-label="全网运行摘要">
        <article className="panel hero-card">
          <div className="hero-top">
            <div>
              <span className="page-eyebrow">全网运行摘要</span>
              <h2 className="hero-title">{overviewState}</h2>
              <p className="hero-sub">{environmentLabel} · 更新于 {lastRefreshLabel}</p>
            </div>
            <div className="hero-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={refreshing ? 'spin' : ''} size={13} aria-hidden="true" />
                <span>{refreshing ? '正在刷新' : '立即刷新'}</span>
              </button>
            </div>
          </div>

          <div className="hero-readout">
            <div className="metric metric-xl">
              <span className="metric-label">服务可用</span>
              <span className="metric-figure">
                {healthyCount}
                <span className="metric-unit">/ {serviceTotal}</span>
              </span>
            </div>
            <div className="hero-readout-meta">
              <StatusTag
                state={incidentCount > 0 ? 'degraded' : 'healthy'}
                label={incidentCount > 0 ? `${incidentCount} 项待处理` : '全部服务在线'}
              />
              <p>{healthyRate}% 的服务当前正常响应，最近一次同步在 {lastRefreshLabel}。</p>
            </div>
          </div>

          <div className="hero-ruler">
            <Ruler
              value={healthyRate}
              labels={[
                { text: '0%', at: 0 },
                { text: `${healthyRate}% 可用`, at: healthyRate },
                { text: '100%', at: 100 },
              ]}
            />
          </div>

          <div className="hero-status" aria-label="服务状态分布">
            <span><i className="status-indicator" />正常<b>{healthyCount}</b></span>
            <span><i className="status-indicator state-degraded" />响应异常<b>{counts.degraded ?? 0}</b></span>
            <span><i className="status-indicator state-offline" />不可用<b>{counts.offline ?? 0}</b></span>
            <span><i className="status-indicator state-unmonitored" />未监测<b>{counts.unmonitored ?? 0}</b></span>
          </div>

          <div className="hero-foot">
            <Metric
              size="s"
              label="平均响应"
              value={avgLatency === null ? '--' : avgLatency}
              unit={avgLatency === null ? null : 'ms'}
              foot={latencies.length > 0 ? `已检查 ${latencies.length} 个服务` : '暂无响应数据'}
            />
            <Metric
              size="s"
              label="需要处理"
              value={incidentCount}
              tone={incidentCount > 0 ? 'attention' : ''}
              foot={incidentCount > 0 ? '有问题需要处理' : '当前没有待处理'}
            />
            <Metric
              size="s"
              label="最近检查"
              value={lastRefreshLabel}
              foot="所有服务的同步时间"
            />
          </div>
        </article>

        <aside className="hero-side">
          <div className="spec-plate">
            <div className="spec-title">Platform Spec</div>
            <dl className="spec-list">
              <div className="spec-row"><dt>环境</dt><dd className="is-lime">{environmentLabel}</dd></div>
              <div className="spec-row"><dt>服务</dt><dd>{serviceTotal} 个已接入</dd></div>
              <div className="spec-row"><dt>可用率</dt><dd>{healthyRate}%</dd></div>
              <div className="spec-row"><dt>轮询</dt><dd>{monitoringEnabled ? '自动 · 30 秒' : '已暂停'}</dd></div>
              <div className="spec-row"><dt>待处理</dt><dd className={incidentCount > 0 ? 'is-red' : ''}>{incidentCount} 项</dd></div>
            </dl>
          </div>

          <div className="panel quick-panel">
            <div className="panel-title"><Zap size={15} aria-hidden="true" />常用操作</div>
            <div className="quick-list">
              <button className="quick-item" type="button" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={refreshing ? 'spin' : ''} size={14} aria-hidden="true" />
                <span>{refreshing ? '正在刷新服务' : '刷新服务状态'}</span>
                <ArrowRight className="quick-go" size={13} aria-hidden="true" />
              </button>
              <button className="quick-item" type="button" onClick={onOpenServices}>
                <AppWindow size={14} aria-hidden="true" />
                <span>打开业务入口</span>
                <ArrowRight className="quick-go" size={13} aria-hidden="true" />
              </button>
              <button className="quick-item" type="button" onClick={onOpenIncidents}>
                <CircleAlert size={14} aria-hidden="true" />
                <span>{incidentCount > 0 ? `处理问题（${incidentCount}）` : '查看服务状态'}</span>
                <ArrowRight className="quick-go" size={13} aria-hidden="true" />
              </button>
              <button className="quick-item" type="button" onClick={onOpenBackup}>
                <Archive size={14} aria-hidden="true" />
                <span>备份重要数据</span>
                <ArrowRight className="quick-go" size={13} aria-hidden="true" />
              </button>
              <button className="quick-item" type="button" onClick={onOpenConfiguration}>
                <Settings size={14} aria-hidden="true" />
                <span>运行参数配置</span>
                <ArrowRight className="quick-go" size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="home-grid">
        <article className="panel panel-flush">
          <div className="panel-head">
            <div className="panel-title">
              <Boxes size={15} aria-hidden="true" />
              服务状态
              <span className="panel-meta">{serviceTotal} 项</span>
            </div>
            <button className="btn btn-text btn-sm" type="button" onClick={onOpenServices}>
              全部服务 <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
          {loading && sortedServices.length === 0 ? (
            <div className="view-loading"><LoaderCircle className="spin" size={18} /> 正在读取服务状态</div>
          ) : (
            <div className="table-wrap">
              <table className="table service-table">
                <thead>
                  <tr>
                    <th>服务</th>
                    <th>状态</th>
                    <th className="col-num">响应</th>
                    <th className="col-num">HTTP</th>
                    <th>检查</th>
                    <th className="col-actions"><span className="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedServices.slice(0, 6).map((service) => (
                    <ServiceRow key={service.id} service={service} onOpen={openService} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel panel-flush incident-panel">
          <div className="panel-head">
            <div className="panel-title"><CircleAlert size={15} aria-hidden="true" />需要处理</div>
            <span className={`tag ${incidentCount > 0 ? 'tone-danger' : 'tone-ok'}`}>
              {incidentCount > 0 ? `${incidentCount} 项` : '正常'}
            </span>
          </div>
          <div className="incident-list">
            {incidents.slice(0, 3).map((incident) => {
              const severity = ['critical', 'high', 'warning'].includes(incident.severity);
              return (
                <button className="incident-row" type="button" key={incident.id} onClick={onOpenIncidents}>
                  <span className="incident-time">{formatClock(incident.lastSeenAt || incident.updatedAt || incident.openedAt)}</span>
                  <span className="incident-main">
                    <strong className="incident-title">{incident.title || '运行事件待处理'}</strong>
                    <span className="incident-meta">
                      {incident.serviceId || '平台'} · {incident.status === 'acknowledged' ? '已确认' : '待处理'}
                    </span>
                  </span>
                  <i className={`incident-dot ${severity ? 'is-warn' : 'is-ok'}`} aria-hidden="true" />
                </button>
              );
            })}
            {incidents.length === 0 && (
              <div className="incident-empty">
                <CircleAlert size={20} aria-hidden="true" />
                {incidentCount > 0 ? '有服务状态异常，请打开服务状态查看' : '当前没有需要处理的问题'}
              </div>
            )}
          </div>
          <div className="panel-foot">
            <button className="btn btn-secondary btn-sm" type="button" onClick={onOpenIncidents}>
              打开问题处理
            </button>
          </div>
        </article>
      </section>

      <section className="panel trend-panel" aria-label="响应趋势">
        <div className="trend-head">
          <div className="panel-title"><Activity size={15} aria-hidden="true" />响应趋势</div>
          <div className="trend-summary">
            <span>平均 <b>{avgLatency === null ? '--' : `${avgLatency} ms`}</b></span>
            <span>峰值 <b>{latencies.length ? `${Math.max(...latencies)} ms` : '--'}</b></span>
            <span>检查 <b>{latencies.length} 项</b></span>
          </div>
        </div>
        <div className="trend-body">
          <OperationsChart services={services} history={history} />
        </div>
        <div className="trend-legend">
          <span className="lg"><i aria-hidden="true" />全网平均响应</span>
          <span className="lg is-now"><i aria-hidden="true" />当前时刻</span>
          <span className="muted">按最近采样等分聚合，单位为毫秒</span>
        </div>
      </section>

      <section className="panel topology-panel" aria-label="全网服务链路">
        <HolographicTopology
          services={services}
          monitoringEnabled={monitoringEnabled}
          onToggleMonitoring={() => setMonitoringEnabled((enabled) => !enabled)}
          onSelectService={launchService}
        />
      </section>
    </>
  );
}
