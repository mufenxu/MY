import {
  AppWindow,
  ArrowUpRight,
  ChevronRight,
  LoaderCircle,
  Timer,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';
import { ServiceStatus, formatCheckedAt, CATEGORY_LABELS, SERVICE_ICONS, STATE_META } from './shared.jsx';

export function ApplicationTile({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || AppWindow;
  const managementAreas = Array.isArray(service.managementAreas) ? service.managementAreas : [];

  function handleOpen(event, href = service.adminUrl, label = service.shortName || service.name) {
    if (!href || !isPlainInternalNavigation(event, href)) return;
    event.preventDefault();
    onLaunch({ ...service, adminUrl: href, shortName: label });
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
      {managementAreas.length > 0 && (
        <section className="application-management" aria-label={`${service.name}管理功能`}>
          <div className="application-management-heading">
            <strong>管理功能</strong>
            <span>{managementAreas.length} 项</span>
          </div>
          <div className="management-link-grid">
            {managementAreas.map((area) => (
              <a
                className="management-link"
                href={area.url}
                key={area.id}
                onClick={(event) => handleOpen(event, area.url, `${service.shortName || service.name} · ${area.label}`)}
              >
                <span><strong>{area.label}</strong><small>{area.description}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      )}
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
            onClick={(event) => handleOpen(event)}
          >
            打开完整后台 <ArrowUpRight size={16} />
          </a>
        ) : <span className="entry-unavailable">未配置入口</span>}
      </footer>
    </article>
  );
}

export function ApplicationsView({ services, loading, onLaunch }) {
  const applications = services.filter((service) => Array.isArray(service.managementAreas) && service.managementAreas.length > 0);
  const healthyApplications = applications.filter((service) => service.state === 'healthy').length;
  const availability = applications.length > 0 ? Math.round((healthyApplications / applications.length) * 100) : 0;
  const managementAreaCount = applications.reduce((total, service) => total + service.managementAreas.length, 0);

  return (
    <section className="page-view applications-view" aria-label="业务管理">
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
            <span>业务后台可用率</span>
            <strong>{availability}%</strong>
            <div className="availability-bar"><i style={{ width: `${availability}%` }} /></div>
            <p>{healthyApplications} 个后台运行正常，共接入 {applications.length} 个业务服务。</p>
          </section>
          <section className="view-card check-panel">
            <header><h3>统一入口</h3><Timer size={18} /></header>
            <div className="management-summary"><strong>{managementAreaCount}</strong><span>项业务管理功能已接入</span></div>
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
