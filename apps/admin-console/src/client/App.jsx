import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Radar,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  Wifi,
  X,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';

const FILTERS = [
  { id: 'all', label: '总览', icon: LayoutDashboard },
  { id: 'miniapp', label: '小程序', icon: AppWindow },
  { id: 'service', label: '基础服务', icon: Server },
  { id: 'automation', label: '自动化', icon: Bot },
];

const STATUS_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'healthy', label: '正常' },
  { id: 'attention', label: '需处理' },
  { id: 'unmonitored', label: '未监测' },
];

const CATEGORY_LABELS = {
  miniapp: '应用',
  service: '服务',
  automation: '自动化',
};

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

const STATE_PRIORITY = {
  offline: 0,
  degraded: 1,
  unmonitored: 2,
  healthy: 3,
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
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
            <small>统一服务控制台</small>
          </span>
        </div>
        <div className="login-heading">
          <span className="login-icon"><LockKeyhole size={20} /></span>
          <div>
            <h1 id="login-title">管理员登录</h1>
            <p>登录后进入统一服务控制台</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>管理员账号</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入管理员账号"
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
              placeholder="请输入密码"
              required
            />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button login-button" disabled={submitting} type="submit">
            {submitting ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            {submitting ? '正在登录' : '登录'}
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
      <div>
        <strong>管理中心</strong>
        <span><LoaderCircle className="spin" size={15} /> 正在连接服务</span>
      </div>
    </main>
  );
}

function StatusBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = meta.icon;
  return (
    <span className={`status-badge ${meta.className}`}>
      <Icon size={13} />
      {meta.label}
    </span>
  );
}

function SummaryMetric({ label, value, tone, icon: Icon, note }) {
  return (
    <div className={`summary-metric ${tone}`}>
      <span className="metric-icon"><Icon size={19} /></span>
      <span className="metric-copy">
        <span className="metric-label">{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </span>
    </div>
  );
}

function ResponseChart({ services }) {
  const measuredServices = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .slice(0, 6);
  const measuredValues = measuredServices.map((service) => service.latencyMs);
  const fastestLatency = measuredValues.length > 0 ? Math.min(...measuredValues) : null;
  const averageLatency = measuredValues.length > 0
    ? Math.round(measuredValues.reduce((sum, value) => sum + value, 0) / measuredValues.length)
    : null;
  const peakLatency = measuredValues.length > 0 ? Math.max(...measuredValues) : null;
  const chartServices = measuredServices.length > 0 ? measuredServices : services.slice(0, 6);
  const values = chartServices.map((service) => service.latencyMs || 0);
  const maximum = Math.max(...values, 1);
  const minimumPositive = Math.min(...values.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaledMaximum = useLogScale ? Math.log10(maximum + 1) : maximum;
  const chartWidth = 420;
  const chartHeight = 160;
  const horizontalPadding = 18;
  const topPadding = 16;
  const baseline = 132;
  const availableHeight = baseline - topPadding;
  const points = values.map((value, index) => {
    const x = chartServices.length === 1
      ? chartWidth / 2
      : horizontalPadding + (index * (chartWidth - horizontalPadding * 2)) / (chartServices.length - 1);
    const scaledValue = useLogScale ? Math.log10(value + 1) : value;
    const y = baseline - (scaledValue / scaledMaximum) * availableHeight;
    return { x, y, value, service: chartServices[index] };
  });
  const pointString = points.map(({ x, y }) => `${x},${y}`).join(' ');
  const areaString = points.length > 0
    ? `${horizontalPadding},${baseline} ${pointString} ${chartWidth - horizontalPadding},${baseline}`
    : '';

  return (
    <div className="response-chart">
      <div className="chart-heading">
        <span>服务响应分布</span>
        <span className="chart-legend"><i /> {useLogScale ? '对数刻度 · 越低越好' : '越低越好'}</span>
      </div>
      {points.length > 0 ? (
        <>
          <div className="chart-highlights" aria-label="响应时间摘要">
            <span className="fast"><i />最快 {fastestLatency ?? '--'} ms</span>
            <span className="average"><i />平均 {averageLatency ?? '--'} ms</span>
            <span className="peak"><i />峰值 {peakLatency ?? '--'} ms</span>
          </div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="各服务响应时间折线图">
            <defs>
              <linearGradient id="response-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8b7cf6" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#22c7d6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="response-line" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="#ff46b9" />
                <stop offset="52%" stopColor="#8b7cf6" />
                <stop offset="100%" stopColor="#22c7d6" />
              </linearGradient>
            </defs>
            {[44, 88, 132].map((y) => (
              <line className="chart-grid-line" key={y} x1="18" x2="402" y1={y} y2={y} />
            ))}
            <polygon fill="url(#response-area)" points={areaString} />
            <polyline className="chart-line" points={pointString} />
            {points.map(({ x, y, value, service }, index) => (
              <g key={service.id || index}>
                <circle className="chart-point-halo" cx={x} cy={y} r="7" />
                <circle className="chart-point" cx={x} cy={y} r="3.5" />
                <text className="chart-value" x={x} y={Math.max(y - 11, 12)} textAnchor="middle">{value} ms</text>
              </g>
            ))}
          </svg>
          <div className="chart-labels" style={{ '--chart-columns': chartServices.length }}>
            {chartServices.map((service) => (
              <span key={service.id} title={service.name}>{service.shortName || service.name}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-empty">等待服务响应数据</div>
      )}
    </div>
  );
}

function LiveServiceRow({ service, maximumLatency }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  const stateMeta = STATE_META[service.state] || STATE_META.unmonitored;
  const latencyPercent = service.latencyMs === null
    ? 0
    : Math.max(8, Math.round((service.latencyMs / maximumLatency) * 100));

  return (
    <div className={`live-service-row state-${stateMeta.className}`}>
      <span className={`live-service-icon service-${service.category}`}><Icon size={17} /></span>
      <span className="live-service-copy">
        <strong title={service.name}>{service.shortName || service.name}</strong>
        <span><i /> {stateMeta.label}</span>
      </span>
      <span className="live-latency">
        <strong>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</strong>
        <span className="latency-track"><i style={{ width: `${latencyPercent}%` }} /></span>
      </span>
    </div>
  );
}

function ServiceCard({ service, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || Server;

  function handleOpen(event) {
    if (!isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  return (
    <article className={`service-card state-${service.state}`}>
      <header className="service-card-header">
        <div className="service-identity">
          <span className={`service-icon service-${service.category}`}><Icon size={20} /></span>
          <div>
            <span className="service-category">{CATEGORY_LABELS[service.category] || '项目'}</span>
            <h3>{service.name}</h3>
          </div>
        </div>
        <StatusBadge state={service.state} />
      </header>
      <p className="service-description">{service.description}</p>
      <div className="capability-list" aria-label="服务能力">
        {service.capabilities.slice(0, 3).map((capability) => <span key={capability}>{capability}</span>)}
        {service.capabilities.length > 3 && <span>+{service.capabilities.length - 3}</span>}
      </div>
      <dl className="service-meta">
        <div>
          <dt>响应时间</dt>
          <dd>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</dd>
        </div>
        <div>
          <dt>HTTP 状态</dt>
          <dd>{service.httpStatus ?? '--'}</dd>
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
            onClick={handleOpen}
            aria-label={`进入${service.name}后台`}
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [launchingService, setLaunchingService] = useState(null);
  const mobileMenuButtonRef = useRef(null);
  const sidebarRef = useRef(null);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    if (window.matchMedia('(max-width: 980px)').matches) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

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

  useEffect(() => {
    function clearLaunchState() {
      setLaunchingService(null);
    }

    window.addEventListener('pageshow', clearLaunchState);
    window.addEventListener('focus', clearLaunchState);

    return () => {
      window.removeEventListener('pageshow', clearLaunchState);
      window.removeEventListener('focus', clearLaunchState);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen || !window.matchMedia('(max-width: 980px)').matches) return undefined;

    const sidebar = sidebarRef.current;
    const focusable = Array.from(sidebar?.querySelectorAll('button:not(:disabled), a[href]') || []);
    if (focusable.length === 0) return undefined;

    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];
    firstFocusable.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNav();
        return;
      }
      if (event.key !== 'Tab') return;

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeMobileNav, mobileNavOpen]);

  const services = data?.services || [];
  const counts = data?.counts || {};
  const total = services.length;
  const attentionCount = (counts.degraded || 0) + (counts.offline || 0);
  const healthyRate = total > 0 ? Math.round(((counts.healthy || 0) / total) * 100) : 0;
  const environmentLabel = session.authDisabled ? '开发环境' : '生产环境';
  const measuredLatencies = services
    .map((service) => service.latencyMs)
    .filter((latency) => Number.isFinite(latency));
  const averageLatency = measuredLatencies.length > 0
    ? Math.round(measuredLatencies.reduce((sum, latency) => sum + latency, 0) / measuredLatencies.length)
    : null;
  const maximumLatency = Math.max(...measuredLatencies, 1);
  const username = session.user?.username || 'admin';
  const userInitial = username.slice(0, 1).toUpperCase();
  const greeting = getGreeting();

  const categoryCounts = useMemo(() => ({
    all: services.length,
    miniapp: services.filter((service) => service.category === 'miniapp').length,
    service: services.filter((service) => service.category === 'service').length,
    automation: services.filter((service) => service.category === 'automation').length,
  }), [services]);

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return services.filter((service) => {
      const categoryMatches = activeFilter === 'all' || service.category === activeFilter;
      const statusMatches = statusFilter === 'all'
        || service.state === statusFilter
        || (statusFilter === 'attention' && ['degraded', 'offline'].includes(service.state));
      const queryMatches = !normalizedQuery || [
        service.name,
        service.shortName,
        service.description,
        service.repositoryPath,
        ...service.capabilities,
      ].join(' ').toLowerCase().includes(normalizedQuery);
      return categoryMatches && statusMatches && queryMatches;
    }).sort((left, right) => (
      (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
      || left.name.localeCompare(right.name, 'zh-CN')
    ));
  }, [activeFilter, query, services, statusFilter]);

  async function handleLogout() {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
    }
  }

  const launchService = useCallback((service) => {
    if (!service?.adminUrl || launchingService) return;
    setLaunchingService(service);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.location.assign(service.adminUrl));
    });
  }, [launchingService]);

  function clearFilters() {
    setActiveFilter('all');
    setStatusFilter('all');
    setQuery('');
  }

  return (
    <div className="app-shell">
      {launchingService && (
        <div className="navigation-transition" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={24} />
          <strong>正在进入{launchingService.shortName || launchingService.name}</strong>
        </div>
      )}

      <aside ref={sidebarRef} id="management-sidebar" className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup sidebar-brand">
          <span className="brand-mark" aria-hidden="true">MY</span>
          <span>
            <strong>管理中心</strong>
            <small>统一服务控制台</small>
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
                closeMobileNav();
              }}
              title={label}
              aria-label={`${label}，${categoryCounts[id] || 0} 项`}
              aria-pressed={activeFilter === id}
              type="button"
            >
              <Icon size={20} />
              <span>{label}</span>
              <span className="nav-count">{categoryCounts[id] || 0}</span>
              <ChevronRight className="nav-chevron" size={14} />
            </button>
          ))}
        </nav>

        <div className="sidebar-environment" title={`当前环境：${environmentLabel}`}>
          <span className="environment-dot" />
          <span>
            <small>当前环境</small>
            <strong>{environmentLabel}</strong>
          </span>
        </div>

        <div className="sidebar-footer">
          <div className="admin-identity">
            <span className="admin-avatar">{userInitial}</span>
            <span>
              <strong>{username}</strong>
              <small>{session.authDisabled ? '本地开发' : '平台管理员'}</small>
            </span>
          </div>
          <button className="icon-button sidebar-button" onClick={handleLogout} type="button" title="退出登录" aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭导航" onClick={closeMobileNav} />}

      <main className="workspace" aria-hidden={mobileNavOpen || undefined} inert={mobileNavOpen || undefined}>
        <header className="topbar">
          <div className="topbar-leading">
            <button
              ref={mobileMenuButtonRef}
              className="icon-button mobile-menu-button"
              type="button"
              onClick={() => (mobileNavOpen ? closeMobileNav() : setMobileNavOpen(true))}
              aria-label={mobileNavOpen ? '关闭导航' : '打开导航'}
              aria-expanded={mobileNavOpen}
              aria-controls="management-sidebar"
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="welcome-avatar" aria-hidden="true">{userInitial}</span>
            <div className="welcome-copy">
              <h1>{greeting}，<strong>{username}</strong></h1>
              <span>欢迎回到 MY 管理中心</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="environment-pill"><span className="live-dot" /> {environmentLabel}</span>
            <div className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务、能力或仓库路径" aria-label="搜索服务" />
              {query && (
                <button type="button" onClick={() => setQuery('')} title="清除搜索" aria-label="清除搜索">
                  <X size={15} />
                </button>
              )}
            </div>
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
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => loadServices(true)}>重新加载</button>
            </div>
          )}

          <section className="dashboard-grid" aria-label="系统运行总览">
            <article className="bento-card health-overview-card">
              <header className="card-heading">
                <div>
                  <span className="panel-kicker"><TrendingUp size={14} /> 运行表现</span>
                  <h2>整体健康度</h2>
                </div>
                <span className="soft-status"><span className="live-dot" /> 实时</span>
              </header>

              <div className="health-score-row">
                <span className="health-card-mark" aria-hidden="true"><Activity size={18} /></span>
                <div className="health-score">
                  <span>服务可用率</span>
                  <strong>{loading ? '--' : healthyRate}<small>{loading ? '' : '%'}</small></strong>
                  <p>{attentionCount > 0 ? `${attentionCount} 项服务需要处理` : '当前服务运行平稳'}</p>
                </div>
                <div className="health-facts" aria-label="响应概览">
                  <div>
                    <span>平均响应</span>
                    <strong>{averageLatency === null ? '--' : `${averageLatency} ms`}</strong>
                  </div>
                  <div>
                    <span>正常服务</span>
                    <strong>{counts.healthy || 0} / {total}</strong>
                  </div>
                </div>
              </div>

              <div className="availability-progress" aria-label={`服务可用率 ${healthyRate}%`}>
                <span style={{ width: `${healthyRate}%` }} />
              </div>
              <ResponseChart services={services} />
            </article>

            <article className="bento-card summary-card">
              <header className="card-heading compact">
                <div>
                  <span className="panel-kicker"><Gauge size={14} /> 状态快照</span>
                  <h2>系统概览</h2>
                </div>
                <span className="result-count">{total}</span>
              </header>
              <div className="summary-metrics" aria-label="状态摘要">
                <SummaryMetric label="全部服务" value={total} tone="neutral" icon={Gauge} note="已接入管理中心" />
                <SummaryMetric label="运行正常" value={counts.healthy || 0} tone="positive" icon={CheckCircle2} note={`可用率 ${healthyRate}%`} />
                <SummaryMetric label="需要处理" value={attentionCount} tone="warning" icon={CircleAlert} note="异常或离线" />
                <SummaryMetric label="未接监测" value={counts.unmonitored || 0} tone="muted" icon={Clock3} note="等待配置" />
              </div>
            </article>

            <article className={`bento-card focus-card ${attentionCount > 0 ? 'attention' : 'all-clear'}`}>
              <div className="focus-copy">
                <span className="panel-kicker"><Radar size={14} /> 实时监测</span>
                <h2>{attentionCount > 0 ? '发现需要处理的服务' : '服务监测运行平稳'}</h2>
                <p>
                  {attentionCount > 0
                    ? `当前有 ${attentionCount} 项异常或离线，建议优先查看实时服务状态。`
                    : '所有已监测服务均保持在线，可继续通过管理中心统一访问。'}
                </p>
                <button className="refresh-action" type="button" onClick={() => loadServices(true)} disabled={refreshing}>
                  {refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
                  {refreshing ? '正在刷新' : '立即刷新'}
                </button>
              </div>
              <div className="health-ring" style={{ '--health-rate': `${healthyRate}%` }} aria-label={`健康度 ${healthyRate}%`}>
                <span>{loading ? '--' : `${healthyRate}%`}</span>
                <small>健康度</small>
              </div>
            </article>

            <article className="bento-card live-services-card">
              <header className="card-heading compact">
                <div>
                  <span className="panel-kicker"><Wifi size={14} /> 服务状态</span>
                  <h2>实时服务</h2>
                </div>
                <span className="soft-status"><span className="live-dot" /> 在线</span>
              </header>
              <div className="live-services-list">
                {services.length > 0 ? services.slice(0, 6).map((service) => (
                  <LiveServiceRow key={service.id} service={service} maximumLatency={maximumLatency} />
                )) : (
                  <div className="live-services-empty">{loading ? '正在同步服务状态' : '暂无服务数据'}</div>
                )}
              </div>
              <footer className="live-services-footer">
                <span>{total} 项服务已接入</span>
                <span>更新时间 {formatCheckedAt(data?.refreshedAt)}</span>
              </footer>
            </article>
          </section>

          <section className="services-section" aria-labelledby="services-title">
            <div className="section-heading">
              <div>
                <div className="section-title-row">
                  <h2 id="services-title">项目与服务</h2>
                  <span className="result-count">{filteredServices.length}</span>
                </div>
              </div>
              <div className="status-tabs" role="group" aria-label="按运行状态筛选">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={statusFilter === filter.id ? 'active' : ''}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    aria-pressed={statusFilter === filter.id}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="service-grid" aria-label="正在加载">
                {[1, 2, 3, 4, 5, 6].map((item) => <div className="service-card skeleton-card" key={item} />)}
              </div>
            ) : filteredServices.length > 0 ? (
              <div className="service-grid">
                {filteredServices.map((service) => (
                  <ServiceCard key={service.id} service={service} onLaunch={launchService} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon"><Search size={22} /></span>
                <strong>没有匹配的服务</strong>
                <p>请调整搜索词或筛选条件</p>
                <button type="button" onClick={clearFilters}>清除筛选</button>
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
