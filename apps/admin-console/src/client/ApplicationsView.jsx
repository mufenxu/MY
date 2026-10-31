import {
  AppWindow,
  ArrowUpRight,
  ChevronRight,
  LoaderCircle,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';
import { StatusTag } from './Pearl.jsx';
import { formatCheckedAt, CATEGORY_LABELS, SERVICE_ICONS, STATE_META } from './shared.jsx';

export function ApplicationTile({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || AppWindow;
  const managementAreas = Array.isArray(service.managementAreas) ? service.managementAreas : [];

  function handleOpen(event, href = service.adminUrl, label = service.shortName || service.name) {
    if (!href || !isPlainInternalNavigation(event, href)) return;
    event.preventDefault();
    onLaunch({ ...service, adminUrl: href, shortName: label });
  }

  return (
    <article className="panel app-card">
      <header className="app-card-head">
        <span className="app-card-icon" aria-hidden="true"><Icon size={19} /></span>
        <div className="app-card-copy">
          <small>{CATEGORY_LABELS[service.category]}</small>
          <h3>{service.name}</h3>
        </div>
        <StatusTag state={service.state} />
      </header>

      <p className="app-card-desc">{service.description}</p>

      <div className="capability-row">
        {service.capabilities.slice(0, 4).map((capability) => <span className="tag" key={capability}>{capability}</span>)}
      </div>

      {managementAreas.length > 0 && (
        <section className="management-grid" aria-label={`${service.name}管理功能`}>
          {managementAreas.map((area) => (
            <a
              className="management-link"
              href={area.url}
              key={area.id}
              onClick={(event) => handleOpen(event, area.url, `${service.shortName || service.name} · ${area.label}`)}
            >
              <span>
                <strong>{area.label}</strong>
                <small>{area.description}</small>
              </span>
              <ChevronRight size={14} aria-hidden="true" />
            </a>
          ))}
        </section>
      )}

      <footer className="app-card-foot">
        <dl>
          <div><dt>响应</dt><dd>{Number.isFinite(service.latencyMs) ? `${service.latencyMs} ms` : '--'}</dd></div>
          <div><dt>检查</dt><dd>{formatCheckedAt(service.checkedAt)}</dd></div>
        </dl>
        {service.adminUrl ? (
          <a
            href={service.adminUrl}
            target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
            rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
            onClick={(event) => handleOpen(event)}
          >
            打开完整后台 <ArrowUpRight size={14} aria-hidden="true" />
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
  const managementAreaCount = applications.reduce((sum, service) => sum + service.managementAreas.length, 0);

  return (
    <section className="page-view applications-view" aria-label="业务管理">
      <div className="apps-layout">
        <div className="app-grid">
          {loading ? (
            <div className="view-loading"><LoaderCircle className="spin" size={18} /> 正在加载应用</div>
          ) : applications.length > 0 ? applications.map((service) => (
            <ApplicationTile key={service.id} service={service} onLaunch={onLaunch} />
          )) : <div className="view-empty">暂无已接入应用</div>}
        </div>

        <aside className="app-insights">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title"><AppWindow size={15} aria-hidden="true" />业务后台可用率</div>
              <span className={`tag ${availability === 100 ? 'tone-ok' : availability > 0 ? 'tone-warn' : 'tone-danger'}`}>
                {healthyApplications}/{applications.length}
              </span>
            </div>
            <div className="availability-body">
              <strong>{availability}%</strong>
              <div className="distribution-bar" style={{ marginTop: 12 }}>
                <i style={{ width: `${availability}%` }} />
              </div>
              <p>{healthyApplications} 个后台运行正常，共接入 {applications.length} 个业务服务。</p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title">统一入口</div>
              <span className="tag">{managementAreaCount} 项</span>
            </div>
            <div className="availability-body">
              <div className="check-list">
                {applications.map((service) => (
                  <div className="check-row" key={service.id}>
                    <span><i className={STATE_META[service.state]?.className} />{service.shortName || service.name}</span>
                    <strong>{formatCheckedAt(service.checkedAt)}</strong>
                  </div>
                ))}
                {applications.length === 0 && <div className="check-row"><span>暂无业务服务</span><strong>--</strong></div>}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
