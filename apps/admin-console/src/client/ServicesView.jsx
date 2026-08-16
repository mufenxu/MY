import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Network,
  Server,
} from 'lucide-react';
import { useEffect } from 'react';
import { isPlainInternalNavigation } from './navigation.js';
import { ServiceStatus, formatCheckedAt, SERVICE_ICONS } from './shared.jsx';

export function ServiceTableRow({ service, onLaunch, targeted = false }) {
  const Icon = SERVICE_ICONS[service.id] || Server;

  function handleOpen(event) {
    if (!service.adminUrl || !isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <div className={`service-table-row ${targeted ? 'targeted-entity' : ''}`} data-service-entity-id={service.id}>
      <div className="service-table-name">
        <span><Icon size={19} /></span>
        <div><strong>{service.shortName || service.name}</strong><small>{service.repositoryPath}</small></div>
      </div>
      <ServiceStatus state={service.state} />
      <span className="table-value">{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</span>
      <span className="table-value">{service.httpStatus ?? '--'}</span>
      <span className="table-value">{formatCheckedAt(service.checkedAt)}</span>
      {service.adminUrl ? (
        <a
          className="table-entry"
          href={service.adminUrl}
          target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
          rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
          onClick={handleOpen}
          aria-label={`进入${service.name}`}
        ><ArrowUpRight size={17} /></a>
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

  useEffect(() => {
    if (!targetEntityId || loading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-service-entity-id]')]
        .find((element) => element.dataset.serviceEntityId === targetEntityId);
      target?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, targetEntityId]);

  return (
    <section className="page-view services-view" aria-label="服务运维">
      <div className="operations-kpis">
        <article><span className="kpi-icon blue"><Server size={20} /></span><div><span>基础服务</span><strong>{infrastructure.length}</strong><small>已接入运维</small></div></article>
        <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>运行正常</span><strong>{healthy}</strong><small>当前在线</small></div></article>
        <article><span className="kpi-icon orange"><CircleAlert size={20} /></span><div><span>需要处理</span><strong>{attention}</strong><small>异常或离线</small></div></article>
        <article><span className="kpi-icon purple"><Activity size={20} /></span><div><span>在线平均</span><strong>{averageLatency === null ? '--' : averageLatency}</strong><small>{averageLatency === null ? '暂无数据' : '响应毫秒'}</small></div></article>
      </div>

      <div className="services-layout">
        <section className="view-card service-table-card" aria-label="基础服务清单">
          <div className="service-table-head">
            <span>服务</span><span>状态</span><span>响应</span><span>状态码</span><span>检查时间</span><span />
          </div>
          <div className="service-table-body">
            {loading ? (
              <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载服务</div>
            ) : infrastructure.map((service) => (
              <ServiceTableRow key={service.id} service={service} onLaunch={onLaunch} targeted={service.id === targetEntityId} />
            ))}
          </div>
        </section>

        <aside className="view-card distribution-panel">
          <header><div><span className="view-eyebrow">健康</span><h3>状态分布</h3></div><Network size={21} /></header>
          <div className="distribution-score">
            <strong>{infrastructure.length > 0 ? Math.round((healthy / infrastructure.length) * 100) : 0}%</strong>
            <span>基础服务可用率</span>
          </div>
          <div className="distribution-list">
            <div><span><i className="healthy" />运行正常</span><strong>{healthy}</strong></div>
            <div><span><i className="degraded" />需要处理</span><strong>{attention}</strong></div>
            <div><span><i className="unmonitored" />未接监测</span><strong>{unmonitored}</strong></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
