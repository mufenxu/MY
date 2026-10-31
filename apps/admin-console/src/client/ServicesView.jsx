import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Server,
} from 'lucide-react';
import { useEffect } from 'react';
import { isPlainInternalNavigation } from './navigation.js';
import { StatusTag } from './Pearl.jsx';
import { formatCheckedAt, SERVICE_ICONS, STATE_META } from './shared.jsx';

export function ServiceTableRow({ service, onLaunch, targeted = false }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  const meta = STATE_META[service.state] || STATE_META.unmonitored;
  const latency = Number.isFinite(service.latencyMs) ? service.latencyMs : null;

  function handleOpen(event) {
    if (!service.adminUrl || !isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <div className={`service-row ${targeted ? 'is-targeted' : ''}`} data-service-entity-id={service.id}>
      <span className="service-cell-main">
        <span className="cell-icon" aria-hidden="true"><Icon size={16} /></span>
        <span>
          <strong>{service.shortName || service.name}</strong>
          <small>{service.repositoryPath || service.name}</small>
        </span>
      </span>
      <StatusTag state={service.state} label={meta.shortLabel} />
      <span className={`latency-cell ${latency !== null && latency > 1200 ? 'is-slow' : ''}`}>
        {latency === null ? '--' : `${latency} ms`}
      </span>
      <span className="code-chip">{service.httpStatus ?? '--'}</span>
      <span className="service-cell-time">{formatCheckedAt(service.checkedAt)}</span>
      {service.adminUrl ? (
        <a
          className="table-entry"
          href={service.adminUrl}
          target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
          rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
          onClick={handleOpen}
          aria-label={`进入${service.name}`}
        ><ArrowUpRight size={16} /></a>
      ) : <span className="table-entry disabled">--</span>}
    </div>
  );
}

export function ServicesView({ services, loading, onLaunch, targetEntityId = '' }) {
  const infrastructure = services.filter((service) => service.category === 'service');
  const healthy = infrastructure.filter((service) => service.state === 'healthy').length;
  const attention = infrastructure.filter((service) => ['offline', 'degraded'].includes(service.state)).length;
  const unmonitored = infrastructure.filter((service) => service.state === 'unmonitored').length;
  const latencies = infrastructure
    .filter((service) => !['offline', 'unmonitored'].includes(service.state))
    .map((service) => service.latencyMs)
    .filter(Number.isFinite);
  const averageLatency = latencies.length > 0
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;
  const availability = infrastructure.length > 0 ? Math.round((healthy / infrastructure.length) * 100) : 0;

  useEffect(() => {
    if (!targetEntityId || loading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-service-entity-id]')]
        .find((element) => element.dataset.serviceEntityId === targetEntityId);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, targetEntityId]);

  return (
    <section className="page-view services-view" aria-label="服务运维">
      <div className="stat-strip">
        <article className="stat-card">
          <span className="stat-icon tone-info"><Server size={16} /></span>
          <div>
            <span className="stat-label">基础服务</span>
            <strong className="stat-value">{infrastructure.length}</strong>
            <small className="stat-foot">已接入运维</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-ok"><CheckCircle2 size={16} /></span>
          <div>
            <span className="stat-label">运行正常</span>
            <strong className="stat-value">{healthy}</strong>
            <small className="stat-foot">当前在线</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-warn"><CircleAlert size={16} /></span>
          <div>
            <span className="stat-label">需要处理</span>
            <strong className="stat-value">{attention}</strong>
            <small className="stat-foot">异常或离线</small>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-violet"><Activity size={16} /></span>
          <div>
            <span className="stat-label">在线平均</span>
            <strong className="stat-value">{averageLatency === null ? '--' : averageLatency}</strong>
            <small className="stat-foot">{averageLatency === null ? '暂无数据' : '响应毫秒'}</small>
          </div>
        </article>
      </div>

      <div className="services-layout">
        <div className="services-main">
          <article className="panel panel-flush" aria-label="基础服务清单">
            <div className="panel-head">
              <div className="panel-title">
                <Server size={15} aria-hidden="true" />
                基础服务
                <span className="panel-meta">{infrastructure.length} 项</span>
              </div>
              <span className="panel-meta">每 30 秒同步</span>
            </div>
            <div className="service-table-head" aria-hidden="true">
              <span>服务</span><span>状态</span><span>响应</span><span>状态码</span><span>检查</span><span />
            </div>
            <div className="service-table-body">
              {loading ? (
                <div className="view-loading"><LoaderCircle className="spin" size={18} /> 正在加载服务</div>
              ) : infrastructure.length === 0 ? (
                <div className="view-empty">暂无已接入的基础服务</div>
              ) : infrastructure.map((service) => (
                <ServiceTableRow key={service.id} service={service} onLaunch={onLaunch} targeted={service.id === targetEntityId} />
              ))}
            </div>
          </article>
        </div>

        <aside className="services-side">
          <article className="panel gauge-panel">
            <div className="panel-head">
              <div className="panel-title">可用率</div>
              <span className={`tag ${availability === 100 ? 'tone-ok' : availability >= 60 ? 'tone-warn' : 'tone-danger'}`}>
                {healthy}/{infrastructure.length}
              </span>
            </div>
            <div className="gauge-body">
              <div className="gauge-figure">
                <strong>{availability}%</strong>
                <span>基础服务可用</span>
              </div>
              <div className="distribution-bar"><i style={{ width: `${availability}%` }} /></div>
              <div className="mini-list">
                <div><span><i className="dot-ok" />运行正常</span><strong>{healthy}</strong></div>
                <div><span><i className="dot-warn" />需要处理</span><strong>{attention}</strong></div>
                <div><span><i className="dot-idle" />未接监测</span><strong>{unmonitored}</strong></div>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div className="panel-title">最近同步</div>
            </div>
            <div className="gauge-body">
              <div className="mini-list">
                {infrastructure.map((service) => (
                  <div key={service.id}>
                    <span><i className={`dot-${service.state === 'healthy' ? 'ok' : service.state === 'degraded' ? 'warn' : 'idle'}`} />{service.shortName || service.name}</span>
                    <strong className="mono-cell">{formatCheckedAt(service.checkedAt)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div className="panel-title">在线平均</div>
            </div>
            <div className="gauge-body">
              <div className="metric metric-l">
                <span className="metric-figure">
                  {averageLatency === null ? '--' : averageLatency}
                  {averageLatency !== null && <span className="metric-unit">ms</span>}
                </span>
                <span className="metric-foot">
                  {latencies.length > 0 ? `基于 ${latencies.length} 个在线服务` : '暂无响应数据'}
                </span>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
