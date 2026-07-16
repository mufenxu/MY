import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AppWindow,
  BellRing,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  ExternalLink,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';

const FILTERS = [
  { id: 'all', label: '总览', icon: LayoutDashboard },
  { id: 'miniapp', label: '小程序', icon: AppWindow },
  { id: 'service', label: '基础服务', icon: Server },
  { id: 'automation', label: '自动化', icon: Bot },
];

const SERVICE_ICONS = {
  core: Boxes,
  exam: GraduationCap,
  campus: AppWindow,
  mqtt: Radio,
  notify: BellRing,
  'ct8-automation': Bot,
};

const STATE_META = {
  healthy: { label: '运行正常', className: 'healthy', icon: CheckCircle2 },
  degraded: { label: '响应异常', className: 'degraded', icon: CircleAlert },
  offline: { label: '暂不可用', className: 'offline', icon: CircleOff },
  unmonitored: { label: '未接入监测', className: 'unmonitored', icon: Clock3 },
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method && options.method !== 'GET' ? { 'X-Platform-Request': 'console' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function LoginScreen({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated(session);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup login-brand">
          <span className="brand-mark" aria-hidden="true">MY</span>
          <span>
            <strong>MY 管理中心</strong>
            <small>Platform Console</small>
          </span>
        </div>
        <div className="login-heading">
          <span className="login-icon"><LockKeyhole size={20} /></span>
          <div>
            <h1 id="login-title">管理员登录</h1>
            <p>进入统一服务控制台</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>管理员账号</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button login-button" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            登录
          </button>
        </form>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="brand-mark">MY</div>
      <LoaderCircle className="spin" size={24} />
      <span>正在连接管理中心</span>
    </main>
  );
}

function StatusBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = meta.icon;
  return (
    <span className={`status-badge ${meta.className}`}>
      <Icon size={14} />
      {meta.label}
    </span>
  );
}

function SummaryMetric({ label, value, tone, icon: Icon }) {
  return (
    <div className={`summary-metric ${tone}`}>
      <span className="metric-icon"><Icon size={18} /></span>
      <span className="metric-copy">
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function ServiceCard({ service }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  return (
    <article className="service-card">
      <div className="service-card-top">
        <span className={`service-icon service-${service.category}`}><Icon size={21} /></span>
        <StatusBadge state={service.state} />
      </div>
      <div className="service-copy">
        <h3>{service.name}</h3>
        <p>{service.description}</p>
      </div>
      <div className="capability-list" aria-label="服务能力">
        {service.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
      </div>
      <dl className="service-meta">
        <div>
          <dt>响应</dt>
          <dd>{service.latencyMs === null ? '-' : `${service.latencyMs} ms`}</dd>
        </div>
        <div>
          <dt>状态码</dt>
          <dd>{service.httpStatus ?? '-'}</dd>
        </div>
        <div>
          <dt>检查时间</dt>
          <dd>{formatCheckedAt(service.checkedAt)}</dd>
        </div>
      </dl>
      <footer className="service-card-footer">
        <span className="repository-path" title={service.repositoryPath}>{service.repositoryPath}</span>
        {service.adminUrl ? (
          <a
            className="open-link"
            href={service.adminUrl}
            target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
            rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
          >
            进入后台
            <ExternalLink size={15} />
          </a>
        ) : (
          <span className="no-console">无网页入口</span>
        )}
      </footer>
    </article>
  );
}

function Dashboard({ session, onLogout }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadServices = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setData(await requestJson(`/api/services/status${force ? '?refresh=1' : ''}`));
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onLogout]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.services || []).filter((service) => {
      const categoryMatches = activeFilter === 'all' || service.category === activeFilter;
      const queryMatches = !normalizedQuery || [
        service.name,
        service.shortName,
        service.description,
        service.repositoryPath,
        ...service.capabilities,
      ].join(' ').toLowerCase().includes(normalizedQuery);
      return categoryMatches && queryMatches;
    });
  }, [activeFilter, data, query]);

  async function handleLogout() {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
    }
  }

  const counts = data?.counts || {};
  const total = data?.services?.length || 0;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup sidebar-brand">
          <span className="brand-mark" aria-hidden="true">MY</span>
          <span>
            <strong>管理中心</strong>
            <small>Platform Console</small>
          </span>
        </div>
        <nav className="main-nav" aria-label="管理模块">
          <span className="nav-label">工作区</span>
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activeFilter === id ? 'active' : ''}
              onClick={() => {
                setActiveFilter(id);
                setMobileNavOpen(false);
              }}
              type="button"
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight className="nav-chevron" size={15} />
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="admin-identity">
            <span className="admin-avatar">管</span>
            <span>
              <strong>{session.user?.username || 'admin'}</strong>
              <small>{session.authDisabled ? '本地开发' : '平台管理员'}</small>
            </span>
          </div>
          <button className="icon-button subtle" onClick={handleLogout} type="button" title="退出登录" aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭导航" onClick={() => setMobileNavOpen(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu-button"
            type="button"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label={mobileNavOpen ? '关闭导航' : '打开导航'}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="page-title">
            <span>统一管理</span>
            <h1>{FILTERS.find((item) => item.id === activeFilter)?.label || '总览'}</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务" />
            </label>
            <button
              className="icon-button"
              type="button"
              onClick={() => loadServices(true)}
              disabled={refreshing}
              title="刷新服务状态"
              aria-label="刷新服务状态"
            >
              <RefreshCw className={refreshing ? 'spin' : ''} size={18} />
            </button>
          </div>
        </header>

        <div className="workspace-content">
          <section className="overview-heading">
            <div>
              <p className="eyebrow">SYSTEM OVERVIEW</p>
              <h2>服务运行概况</h2>
              <p>最后刷新：{formatCheckedAt(data?.refreshedAt)}</p>
            </div>
            <div className="environment-pill"><Activity size={15} /> Production</div>
          </section>

          <section className="summary-band" aria-label="状态摘要">
            <SummaryMetric label="全部项目" value={total} tone="neutral" icon={Gauge} />
            <SummaryMetric label="运行正常" value={counts.healthy || 0} tone="positive" icon={CheckCircle2} />
            <SummaryMetric label="需要关注" value={(counts.degraded || 0) + (counts.offline || 0)} tone="warning" icon={CircleAlert} />
            <SummaryMetric label="未接监测" value={counts.unmonitored || 0} tone="muted" icon={Clock3} />
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => loadServices(true)}>重试</button>
            </div>
          )}

          <section className="services-section" aria-labelledby="services-title">
            <div className="section-heading">
              <div>
                <h2 id="services-title">项目与服务</h2>
                <p>{filteredServices.length} 个结果</p>
              </div>
              <span className="section-state"><span className="live-dot" /> 实时状态</span>
            </div>

            {loading ? (
              <div className="service-grid" aria-label="正在加载">
                {[1, 2, 3, 4].map((item) => <div className="service-card skeleton-card" key={item} />)}
              </div>
            ) : filteredServices.length > 0 ? (
              <div className="service-grid">
                {filteredServices.map((service) => <ServiceCard key={service.id} service={service} />)}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={24} />
                <strong>没有匹配的服务</strong>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const finishAuthentication = useCallback((nextSession) => {
    setSession(nextSession);
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '';
    if (nextSession?.authenticated && /^\/apps\/(core|exam|campus|iot)(?:\/|$)/.test(returnTo)) {
      window.location.replace(returnTo);
    }
  }, []);

  useEffect(() => {
    requestJson('/api/auth/status')
      .then(finishAuthentication)
      .catch(() => setSession({ authenticated: false, authDisabled: false, user: null }))
      .finally(() => setCheckingSession(false));
  }, [finishAuthentication]);

  if (checkingSession) return <LoadingScreen />;
  if (!session?.authenticated) return <LoginScreen onAuthenticated={finishAuthentication} />;
  return <Dashboard session={session} onLogout={() => setSession({ authenticated: false, authDisabled: false, user: null })} />;
}
