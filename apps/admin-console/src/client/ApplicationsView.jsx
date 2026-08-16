import {
  AppWindow,
  ArrowUpRight,
  LoaderCircle,
  Timer,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';
import { ServiceStatus, formatCheckedAt, CATEGORY_LABELS, SERVICE_ICONS, STATE_META } from './shared.jsx';

export function ApplicationTile({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || AppWindow;

  function handleOpen(event) {
    if (!service.adminUrl || !isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <article className="application-tile">
      <header>
        <span className="application-tile-icon"><Icon size={23} /></span>
        <div>
          <span>{CATEGORY_LABELS[service.category]}</span>
          <h3>{service.name}</h3>
        </div>
        <ServiceStatus state={service.state} />
      </header>
      <p>{service.description}</p>
      <div className="application-capabilities">
        {service.capabilities.slice(0, 4).map((capability) => <span key={capability}>{capability}</span>)}
      </div>
      <footer>
        <dl>
          <div><dt>响应时间</dt><dd>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</dd></div>
          <div><dt>检查时间</dt><dd>{formatCheckedAt(service.checkedAt)}</dd></div>
        </dl>
        {service.adminUrl ? (
          <a
            href={service.adminUrl}
            target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
            rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
            onClick={handleOpen}
          >
            打开应用 <ArrowUpRight size={16} />
          </a>
        ) : <span className="entry-unavailable">未配置入口</span>}
      </footer>
    </article>
  );
}

export function ApplicationsView({ services, loading, onLaunch }) {
  const applications = services.filter((service) => service.category === 'miniapp');
  const healthyApplications = applications.filter((service) => service.state === 'healthy').length;
  const availability = applications.length > 0 ? Math.round((healthyApplications / applications.length) * 100) : 0;

  return (
    <section className="page-view applications-view" aria-label="应用中心">
      <div className="applications-layout">
        <div className="application-catalog">
          {loading ? (
            <div className="view-loading"><LoaderCircle className="spin" size={20} /> 正在加载应用</div>
          ) : applications.length > 0 ? applications.map((service) => (
            <ApplicationTile key={service.id} service={service} onLaunch={onLaunch} />
          )) : <div className="view-empty">暂无已接入应用</div>}
        </div>

        <aside className="application-insights">
          <section className="view-card availability-panel">
            <span className="view-card-icon"><AppWindow size={21} /></span>
            <span>应用可用率</span>
            <strong>{availability}%</strong>
            <div className="availability-bar"><i style={{ width: `${availability}%` }} /></div>
            <p>{healthyApplications} 个应用运行正常，共接入 {applications.length} 个应用。</p>
          </section>
          <section className="view-card check-panel">
            <header><h3>最近检查</h3><Timer size={18} /></header>
            {applications.map((service) => (
              <div className="check-row" key={service.id}>
                <span><i className={STATE_META[service.state]?.className} />{service.shortName || service.name}</span>
                <strong>{formatCheckedAt(service.checkedAt)}</strong>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}
