import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AppWindow,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleOff,
  Clock3,
  CloudCog,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { isPlainInternalNavigation } from './navigation.js';

const FILTERS = [
  { id: 'all', label: '全部服务', icon: LayoutDashboard },
  { id: 'miniapp', label: '应用', icon: AppWindow },
  { id: 'service', label: '基础服务', icon: Server },
  { id: 'automation', label: '自动化', icon: Bot },
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
  notify: Bell,
  'ct8-automation': Bot,
};

const STATE_META = {
  healthy: { label: '运行正常', shortLabel: '在线', className: 'healthy', icon: CheckCircle2 },
  degraded: { label: '响应异常', shortLabel: '异常', className: 'degraded', icon: CircleAlert },
  offline: { label: '暂不可用', shortLabel: '离线', className: 'offline', icon: CircleOff },
  unmonitored: { label: '未接入监测', shortLabel: '未监测', className: 'unmonitored', icon: Clock3 },
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
        <div className="login-brand">
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
      <span className="brand-mark">MY</span>
      <div>
        <strong>管理中心</strong>
        <span><LoaderCircle className="spin" size={15} /> 正在连接服务</span>
      </div>
    </main>
  );
}

function OperationsChart({ services }) {
  const chartServices = services
    .filter((service) => Number.isFinite(service.latencyMs))
    .slice(0, 6);
  const items = chartServices.length > 0 ? chartServices : services.slice(0, 6);
  const values = items.map((service) => service.latencyMs || 0);
  const fastest = values.length > 0 ? Math.min(...values) : null;
  const average = values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
  const peak = values.length > 0 ? Math.max(...values) : null;
  const maximum = Math.max(...values, 1);
  const minimumPositive = Math.min(...values.filter((value) => value > 0), maximum);
  const useLogScale = maximum / Math.max(minimumPositive, 1) >= 10;
  const scaleValue = (value) => (useLogScale ? Math.log10(value + 1) : value);
  const scaledMaximum = scaleValue(maximum);
  const width = 620;
  const height = 220;
  const xStart = 28;
  const xEnd = 592;
  const xFor = (index) => (items.length === 1
    ? width / 2
    : xStart + ((xEnd - xStart) * index) / Math.max(items.length - 1, 1));
  const latencyPoints = items.map((service, index) => ({
    x: xFor(index),
    y: 178 - (scaleValue(service.latencyMs || 0) / scaledMaximum) * 116,
  }));
  const healthPoints = items.map((service, index) => {
    const base = { healthy: 76, degraded: 122, offline: 166, unmonitored: 144 }[service.state] || 144;
    return { x: xFor(index), y: base + ((index % 3) - 1) * 9 };
  });
  const loadPoints = items.map((service, index) => ({
    x: xFor(index),
    y: 118 + Math.sin((index + 1) * 1.7) * 34 - (scaleValue(service.latencyMs || 0) / scaledMaximum) * 12,
  }));
  const pointString = (points) => points.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="operations-chart">
      <div className="chart-summary" aria-label="响应时间摘要">
        <span className="fast"><i /> 最快 {fastest === null ? '--' : `${fastest} ms`}</span>
        <span className="average"><i /> 平均 {average === null ? '--' : `${average} ms`}</span>
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
            <polygon className="chart-area" points={`${xStart},188 ${pointString(latencyPoints)} ${xEnd},188`} />
            <polyline className="chart-line chart-line-pink" points={pointString(healthPoints)} />
            <polyline className="chart-line chart-line-orange" points={pointString(loadPoints)} />
            <polyline className="chart-line chart-line-cyan" points={pointString(latencyPoints)} />
            {latencyPoints.map(({ x, y }, index) => (
              <g key={items[index].id || index}>
                <circle className="chart-dot-halo" cx={x} cy={y} r="5" />
                <circle className="chart-dot" cx={x} cy={y} r="2.5" />
              </g>
            ))}
          </svg>
          <div className="chart-labels" style={{ '--chart-columns': items.length }}>
            {items.map((service) => <span key={service.id}>{service.shortName || service.name}</span>)}
          </div>
        </>
      ) : (
        <div className="chart-empty"><LoaderCircle className="spin" size={18} /> 正在同步服务趋势</div>
      )}
    </div>
  );
}

function makeSparkline(service, index) {
  const seed = [...String(service.id || index)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const base = Math.max(service.latencyMs || 26, 8);
  return Array.from({ length: 5 }, (_, pointIndex) => (
    Math.max(8, base + (((seed + pointIndex * 17) % 23) - 11) * 0.9)
  ));
}

function ServicePortfolioRow({ service, index, onLaunch }) {
  const Icon = SERVICE_ICONS[service.id] || Server;
  const meta = STATE_META[service.state] || STATE_META.unmonitored;
  const values = makeSparkline(service, index);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, pointIndex) => {
    const x = 4 + pointIndex * 22;
    const y = 36 - ((value - min) / Math.max(max - min, 1)) * 26;
    return `${x},${y}`;
  }).join(' ');

  function handleOpen(event) {
    if (!service.adminUrl) return;
    if (!isPlainInternalNavigation(event, service.adminUrl)) return;
    event.preventDefault();
    onLaunch(service);
  }

  const content = (
    <>
      <span className={`portfolio-icon service-${service.category}`}><Icon size={16} /></span>
      <span className="portfolio-copy">
        <strong>{service.shortName || service.name}</strong>
        <span className={meta.className}><i /> {meta.label}</span>
      </span>
      <span className="portfolio-value">
        <strong>{service.latencyMs === null ? '--' : `${service.latencyMs} ms`}</strong>
        <small>{service.httpStatus ? `HTTP ${service.httpStatus}` : meta.shortLabel}</small>
      </span>
      <svg className={`sparkline ${meta.className}`} viewBox="0 0 96 42" aria-hidden="true">
        <polyline points={points} />
        {points.split(' ').map((point, pointIndex) => {
          const [cx, cy] = point.split(',');
          return <circle key={pointIndex} cx={cx} cy={cy} r="2.2" />;
        })}
      </svg>
      {service.adminUrl && <ChevronRight className="portfolio-chevron" size={15} />}
    </>
  );

  return service.adminUrl ? (
    <a
      className="portfolio-row"
      href={service.adminUrl}
      target={service.adminUrl.startsWith('/') ? undefined : '_blank'}
      rel={service.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
      onClick={handleOpen}
      aria-label={`进入${service.name}后台`}
    >
      {content}
    </a>
  ) : <div className="portfolio-row disabled">{content}</div>;
}

function Dashboard({ session, onLogout }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [launchingService, setLaunchingService] = useState(null);
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('my-console-theme') || 'light';
    } catch {
      return 'light';
    }
  });
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
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('my-console-theme', theme);
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    if (!monitoringEnabled) return undefined;
    const interval = window.setInterval(() => loadServices(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadServices, monitoringEnabled]);

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
  const username = session.user?.username || 'admin';
  const greeting = getGreeting();

  const categoryCounts = useMemo(() => ({
    all: services.length,
    miniapp: services.filter((service) => service.category === 'miniapp').length,
    service: services.filter((service) => service.category === 'service').length,
    automation: services.filter((service) => service.category === 'automation').length,
  }), [services]);

  const visibleServices = useMemo(() => services
    .filter((service) => activeFilter === 'all' || service.category === activeFilter)
    .sort((left, right) => (
      (STATE_PRIORITY[left.state] ?? 4) - (STATE_PRIORITY[right.state] ?? 4)
      || left.name.localeCompare(right.name, 'zh-CN')
    )), [activeFilter, services]);

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

  const primaryService = services.find((service) => service.id === 'core' && service.adminUrl)
    || services.find((service) => service.adminUrl);

  return (
    <div className="app-shell">
      {launchingService && (
        <div className="navigation-transition" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={24} />
          <strong>正在进入{launchingService.shortName || launchingService.name}</strong>
        </div>
      )}

      <aside ref={sidebarRef} id="management-sidebar" className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <nav className="main-nav" aria-label="管理模块">
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
              <Icon size={19} />
              <span>{label}</span>
              <small>{categoryCounts[id] || 0}</small>
            </button>
          ))}
          <button type="button" onClick={() => loadServices(true)} disabled={refreshing} title="刷新服务状态">
            <RefreshCw className={refreshing ? 'spin' : ''} size={19} />
            <span>刷新状态</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="environment-indicator" title={`当前环境：${environmentLabel}`}><i /></span>
          <button type="button" onClick={handleLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={18} />
            <span>退出登录</span>
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
            <img className="welcome-avatar" src="/assets/console-avatar.jpg" alt="管理员头像" />
            <div className="welcome-copy">
              <h1>{greeting}，<strong>{username}</strong></h1>
              <span>MY 统一服务控制台</span>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="environment-label"><i /> {environmentLabel}</span>
            <button
              className="theme-switch"
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
              title={theme === 'light' ? '深色模式' : '浅色模式'}
            >
              <Moon size={14} />
              <span className={theme === 'dark' ? 'dark' : ''}><Sun size={14} /></span>
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="查看系统通知"
                aria-expanded={notificationOpen}
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <Bell size={19} />
                <i className={attentionCount > 0 ? 'attention' : ''} />
              </button>
              {notificationOpen && (
                <div className="notification-popover" role="status">
                  <strong>{attentionCount > 0 ? `${attentionCount} 项服务需要处理` : '系统运行平稳'}</strong>
                  <span>最近同步：{formatCheckedAt(data?.refreshedAt)}</span>
                </div>
              )}
            </div>
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
            <article className="dashboard-card performance-card">
              <div className="platform-pass">
                <div className="pass-topline">
                  <span>MY SERVICE CLOUD</span>
                  <span className="pass-layer"><Layers3 size={17} /></span>
                </div>
                <span className="pass-count">{counts.healthy || 0} / {total || '--'}</span>
                <div className="pass-bottomline">
                  <Activity size={25} />
                  <strong>{environmentLabel === '生产环境' ? 'ONLINE' : 'DEV'}</strong>
                </div>
                <svg className="pass-wave" viewBox="0 0 640 120" aria-hidden="true">
                  <path d="M0 95 C105 38 205 45 306 91 S522 115 640 38" />
                  <path d="M0 116 C136 65 236 76 352 111 S550 123 640 80" />
                </svg>
              </div>

              <div className="performance-heading">
                <div>
                  <span>服务可用率</span>
                  <strong>{loading ? '--' : `${healthyRate.toFixed(1)}%`}</strong>
                </div>
                <span className="performance-state">
                  <i /> {attentionCount > 0 ? `${attentionCount} 项待处理` : '运行平稳'}
                </span>
              </div>
              <OperationsChart services={services} />
            </article>

            <article className="dashboard-card monitoring-card">
              <div>
                <span className="card-eyebrow">实时监测</span>
                <h2>{monitoringEnabled ? '自动监测已开启' : '自动监测已暂停'}</h2>
                <p>{monitoringEnabled ? '每 30 秒自动同步服务状态' : '可随时重新开启状态同步'}</p>
              </div>
              <span className="monitoring-icon"><CloudCog size={24} /></span>
              <button
                className={`toggle-switch ${monitoringEnabled ? 'active' : ''}`}
                type="button"
                role="switch"
                aria-checked={monitoringEnabled}
                aria-label="自动监测"
                onClick={() => setMonitoringEnabled((enabled) => !enabled)}
              >
                <span />
              </button>
            </article>

            <article className="dashboard-card service-entry-card">
              <div className="service-entry-copy">
                <span className="entry-icon"><CloudCog size={19} /></span>
                <div>
                  <h2>统一服务中心</h2>
                  <p>统一访问核心平台、考试、校园与消息服务</p>
                </div>
                <button
                  className="entry-action"
                  type="button"
                  disabled={!primaryService}
                  onClick={() => launchService(primaryService)}
                  aria-label="进入统一服务中心"
                  title="进入统一服务中心"
                >
                  <ArrowRight size={21} />
                </button>
              </div>
              <div className="service-visual" aria-hidden="true">
                <span className="visual-card visual-card-one"><Server size={25} /></span>
                <span className="visual-card visual-card-two"><Boxes size={27} /></span>
                <span className="visual-card visual-card-three"><Zap size={24} /></span>
                <i className="visual-link link-one" />
                <i className="visual-link link-two" />
              </div>
            </article>

            <article className="dashboard-card portfolio-card">
              <header>
                <div>
                  <span className="card-eyebrow">SERVICES</span>
                  <h2>{activeFilter === 'all' ? '服务组合' : CATEGORY_LABELS[activeFilter]}</h2>
                </div>
                <span className="portfolio-count">{visibleServices.length}</span>
              </header>
              <div className="portfolio-list">
                {visibleServices.length > 0 ? visibleServices.map((service, index) => (
                  <ServicePortfolioRow key={service.id} service={service} index={index} onLaunch={launchService} />
                )) : (
                  <div className="portfolio-empty">此分类暂无服务</div>
                )}
              </div>
              <footer>
                <span><i /> {total} 项服务已接入</span>
                <span>更新于 {formatCheckedAt(data?.refreshedAt)}</span>
              </footer>
            </article>
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
