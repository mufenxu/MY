import {
  AlignJustify,
  Bell,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getNavigationGroup, NAV_GROUPS, resolveConsoleView } from './navigation.js';
import { requestJson } from './api.js';
import { ViewLoadingFallback, ViewModuleBoundary, getGreeting, NAVIGATION_ICONS, VIEW_ICONS } from './shared.jsx';
import { OverviewView } from './OverviewView.jsx';
import { ApplicationsView } from './ApplicationsView.jsx';
import { ServicesView } from './ServicesView.jsx';
import { BackupRecoveryView } from './BackupRecoveryView.jsx';
import { CommandPalette } from './CommandPalette.jsx';

const loadAutomationView = () => import('./AutomationView.jsx');
const loadNotificationView = () => import('./NotificationServiceView.jsx');
const loadPlatformViews = () => import('./PlatformControlViews.jsx');
const loadOperationsViews = () => import('./OperationsViews.jsx');
const loadExternalApplicationsView = () => import('./ExternalApplicationsView.jsx');
const lazyNamed = (loader, exportName) => lazy(() => loader().then((module) => ({ default: module[exportName] })));

const AutomationView = lazy(loadAutomationView);
const NotificationServiceView = lazy(loadNotificationView);
const ExternalApplicationsView = lazy(loadExternalApplicationsView);
const ConfigurationView = lazyNamed(loadPlatformViews, 'ConfigurationView');
const DiagnosticsView = lazyNamed(loadPlatformViews, 'DiagnosticsView');
const TaskCenterView = lazyNamed(loadPlatformViews, 'TaskCenterView');
const BackupOffsitePanel = lazyNamed(loadOperationsViews, 'BackupOffsitePanel');
const BackupQualityStrip = lazyNamed(loadOperationsViews, 'BackupQualityStrip');
const IncidentsView = lazyNamed(loadOperationsViews, 'IncidentsView');
const MonitoringView = lazyNamed(loadOperationsViews, 'MonitoringView');
const ReleasesView = lazyNamed(loadOperationsViews, 'ReleasesView');
const SecurityAuditView = lazyNamed(loadOperationsViews, 'SecurityAuditView');

const VIEW_MODULE_LOADERS = {
  notification: loadNotificationView,
  automation: loadAutomationView,
  monitoring: loadOperationsViews,
  incidents: loadOperationsViews,
  releases: loadOperationsViews,
  security: loadOperationsViews,
  tasks: loadPlatformViews,
  configuration: loadPlatformViews,
  diagnostics: loadPlatformViews,
  'external-apps': loadExternalApplicationsView,
};

const VIEW_LABELS = new Map(NAV_GROUPS.flatMap((group) => group.views.map((view) => [view.id, view.label])));

const VIEW_META = {
  all: { title: '运行总览', subtitle: '全部服务的状态、响应与待处理事项' },
  miniapp: { title: '业务入口', subtitle: '打开综合、考试、校园与设备服务' },
  service: { title: '服务状态', subtitle: '逐个检查基础服务的响应与可用性' },
  'external-apps': { title: '外部应用', subtitle: '其他项目的登录方式与直达设置' },
  notification: { title: '消息通知', subtitle: '企业微信与 App 消息的发送情况' },
  monitoring: { title: '运行趋势', subtitle: '查看服务最近一段时间的状态变化' },
  incidents: { title: '问题处理', subtitle: '发现、跟踪并关掉运行异常' },
  automation: { title: '自动任务', subtitle: '查看自动任务是否按计划完成' },
  backup: { title: '备份恢复', subtitle: '保存、归档并恢复重要数据' },
  releases: { title: '更新记录', subtitle: '查看各服务版本更新与发布结果' },
  tasks: { title: '待办任务', subtitle: '查看需要处理的任务与审批' },
  configuration: { title: '运行设置', subtitle: '调整运行参数、维护窗口与版本审批' },
  diagnostics: { title: '连接检查', subtitle: '检查服务连接、密钥与依赖' },
  security: { title: '安全设置', subtitle: '登录方式、二次验证与操作记录' },
};

const DENSITY_ORDER = ['standard', 'compact', 'comfy'];
const DENSITY_LABEL = { standard: '标准', compact: '紧凑', comfy: '宽松' };

export function Dashboard({ session, onLogout }) {
  const [activeFilter, setActiveFilter] = useState(() => {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    return resolveConsoleView(requestedView);
  });
  const [activeEntity, setActiveEntity] = useState(() => new URLSearchParams(window.location.search).get('entity') || '');
  const [commandOpen, setCommandOpen] = useState(false);
  const [data, setData] = useState(null);
  const [operationsSummary, setOperationsSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [launchingService, setLaunchingService] = useState(null);
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('my-console-theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const [density, setDensity] = useState(() => {
    try {
      return window.localStorage.getItem('my-console-density') || 'standard';
    } catch {
      return 'standard';
    }
  });
  const mobileMenuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const notificationRef = useRef(null);
  const contentRef = useRef(null);
  const loadRequestRef = useRef(null);

  const navigateToView = useCallback((viewId, { replace = false, entity = null } = {}) => {
    const nextView = resolveConsoleView(viewId);
    const url = new URL(window.location.href);
    if (nextView === 'all') url.searchParams.delete('view');
    else url.searchParams.set('view', nextView);
    if (entity) url.searchParams.set('entity', String(entity));
    else url.searchParams.delete('entity');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setActiveFilter(nextView);
    setActiveEntity(entity ? String(entity) : '');
    if (nextUrl === currentUrl) return;
    window.history[replace ? 'replaceState' : 'pushState']({ view: nextView, entity: entity || null }, '', nextUrl);
  }, []);

  useEffect(() => {
    const initialSearch = new URLSearchParams(window.location.search);
    const requestedView = initialSearch.get('view');
    navigateToView(resolveConsoleView(requestedView), { replace: true, entity: initialSearch.get('entity') });
    const handlePopState = () => {
      const search = new URLSearchParams(window.location.search);
      const nextView = search.get('view');
      setActiveFilter(resolveConsoleView(nextView));
      setActiveEntity(search.get('entity') || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigateToView]);

  useEffect(() => {
    function handleCommandShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
      } else if (event.key === 'Escape') {
        setCommandOpen(false);
      }
    }
    window.addEventListener('keydown', handleCommandShortcut);
    return () => window.removeEventListener('keydown', handleCommandShortcut);
  }, []);

  useEffect(() => {
    const activeLoader = VIEW_MODULE_LOADERS[activeFilter];
    activeLoader?.();
    const relatedViews = getNavigationGroup(activeFilter).views.map((view) => view.id);
    const preloadTargets = activeFilter === 'all'
      ? ['monitoring', 'incidents', 'tasks']
      : relatedViews.filter((viewId) => viewId !== activeFilter);
    const preload = () => preloadTargets.forEach((viewId) => VIEW_MODULE_LOADERS[viewId]?.());
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(preload, { timeout: 1800 })
      : window.setTimeout(preload, 600);
    return () => {
      if (window.cancelIdleCallback && typeof idleId === 'number') window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [activeFilter]);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    if (window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  }, []);

  const loadServices = useCallback((force = false) => {
    if (loadRequestRef.current) return loadRequestRef.current;
    force ? setRefreshing(true) : setLoading(true);
    setError('');
    const request = (async () => {
      try {
        const overview = await requestJson(`/api/operations/overview${force ? '?refresh=1' : ''}`);
        setOperationsSummary(overview);
        setData({
          platformName: overview.platformName,
          services: overview.services,
          counts: overview.counts,
          refreshedAt: overview.refreshedAt,
        });
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
    })();
    loadRequestRef.current = request;
    request.finally(() => {
      if (loadRequestRef.current === request) loadRequestRef.current = null;
    });
    return request;
  }, [onLogout]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // 移动端浏览器地址栏 / 状态栏底色跟随主题，避免深色页面顶出浅色条
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#0f1319' : '#f1f3f2');
    try {
      window.localStorage.setItem('my-console-theme', theme);
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      window.localStorage.setItem('my-console-density', density);
    } catch {
      // Density still applies for the current page when storage is unavailable.
    }
  }, [density]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;
    const handleScroll = () => setIsScrolled(node.scrollTop > 4);
    node.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => node.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (activeEntity) return;
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeFilter, activeEntity]);

  useEffect(() => {
    if (!monitoringEnabled) return undefined;
    let disposed = false;
    let timer = null;
    const canPoll = () => document.visibilityState === 'visible' && navigator.onLine !== false;
    const clearTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      if (!disposed && canPoll()) timer = window.setTimeout(run, 30000);
    };
    const run = async () => {
      if (canPoll()) await loadServices(true);
      schedule();
    };
    const resume = () => {
      clearTimer();
      if (!disposed && canPoll()) loadServices(true).finally(schedule);
    };
    const handleVisibility = () => (canPoll() ? resume() : clearTimer());

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', resume);
    window.addEventListener('offline', clearTimer);
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', clearTimer);
    };
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
    if (!mobileNavOpen || !window.matchMedia('(max-width: 900px)').matches) return undefined;
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

  useEffect(() => {
    if (!notificationOpen) return undefined;
    function closeNotification(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && notificationRef.current?.contains(event.target)) return;
      setNotificationOpen(false);
    }
    document.addEventListener('pointerdown', closeNotification);
    document.addEventListener('keydown', closeNotification);
    return () => {
      document.removeEventListener('pointerdown', closeNotification);
      document.removeEventListener('keydown', closeNotification);
    };
  }, [notificationOpen]);

  const allServices = data?.services || [];
  const services = useMemo(() => allServices.filter((service) => service.id !== 'platform'), [allServices]);
  const counts = useMemo(() => ({
    healthy: services.filter((s) => s.state === 'healthy').length,
    degraded: services.filter((s) => s.state === 'degraded').length,
    offline: services.filter((s) => s.state === 'offline').length,
    unmonitored: services.filter((s) => s.state === 'unmonitored').length,
  }), [services]);
  const total = services.length;
  const attentionCount = (counts.degraded || 0) + (counts.offline || 0);
  const healthyRate = total > 0 ? Math.round(((counts.healthy || 0) / total) * 100) : 0;
  const environmentLabel = session.authDisabled ? '开发环境' : '生产环境';
  const username = session.user?.username || 'admin';
  const greeting = getGreeting();
  const incidentCount = operationsSummary?.incidents?.length || 0;

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

  const activeNavigationGroup = getNavigationGroup(activeFilter);
  const viewMeta = VIEW_META[activeFilter] || { title: VIEW_LABELS.get(activeFilter) || '控制台', subtitle: '' };
  const pageEyebrow = activeFilter === 'all' ? '实时概览' : activeNavigationGroup.label;
  const pageDesc = activeFilter === 'all'
    ? `${greeting}，${username} · ${environmentLabel} · ${total > 0 ? `${total} 个服务中 ${counts.healthy || 0} 个在线` : '正在读取服务状态'}`
    : viewMeta.subtitle;
  const nextDensity = DENSITY_ORDER[(DENSITY_ORDER.indexOf(density) + 1) % DENSITY_ORDER.length];

  return (
    <div className="app-shell">
      {launchingService && (
        <div className="navigation-transition" role="status" aria-live="polite">
          <div className="navigation-transition-panel">
            <span><LoaderCircle className="spin" size={23} /></span>
            <div><strong>正在进入{launchingService.shortName || launchingService.name}</strong><small>正在建立安全连接，请稍候</small></div>
          </div>
        </div>
      )}

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={(view, entity) => {
          navigateToView(view, { entity });
          setCommandOpen(false);
        }}
      />

      <div className={`app-frame ${mobileNavOpen ? 'is-nav-open' : ''}`}>
        <aside
          ref={sidebarRef}
          id="management-sidebar"
          className="rail"
          aria-hidden={commandOpen || undefined}
          inert={commandOpen || undefined}
        >
          <div className="rail-brand">
            <span className="brand-mark" aria-hidden="true"><img src="/assets/console-avatar.jpg" alt="" /></span>
            <span className="brand-text">
              <strong className="brand-name">MY 平台</strong>
              <small className="brand-sub">统一服务控制台</small>
            </span>
          </div>

          <nav className="rail-nav" aria-label="管理模块">
            {NAV_GROUPS.filter((group) => group.visible !== false).map((group) => {
              const GroupIcon = NAVIGATION_ICONS[group.id] || CircleAlert;
              const singleView = group.views.length === 1 ? group.views[0] : null;
              return (
                <div className="nav-group" key={group.id}>
                  {singleView ? (
                    <div className="nav-list">
                      <button
                        type="button"
                        className={`nav-item ${activeFilter === singleView.id ? 'is-active' : ''}`}
                        onClick={() => { navigateToView(singleView.id); closeMobileNav(); }}
                        aria-current={activeFilter === singleView.id ? 'page' : undefined}
                        title={group.label}
                      >
                        <GroupIcon className="nav-ico" size={16} aria-hidden="true" />
                        <span className="nav-label">{group.label}</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="nav-group-title">{group.label}</div>
                      <div className="nav-list">
                        {group.views.map((view) => {
                          const ViewIcon = VIEW_ICONS[view.id] || GroupIcon;
                          const active = activeFilter === view.id;
                          return (
                            <button
                              key={view.id}
                              type="button"
                              className={`nav-item ${active ? 'is-active' : ''}`}
                              onClick={() => { navigateToView(view.id); closeMobileNav(); }}
                              aria-current={active ? 'page' : undefined}
                              title={view.label}
                            >
                              <ViewIcon className="nav-ico" size={16} aria-hidden="true" />
                              <span className="nav-label">{view.label}</span>
                              {view.id === 'incidents' && incidentCount > 0 && (
                                <span className="nav-tail">{incidentCount}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="rail-foot">
            <span className={`env-chip ${session.authDisabled ? 'is-dev' : ''}`} title={`当前环境：${environmentLabel}`}>
              <i aria-hidden="true" />
              <span>{environmentLabel}</span>
            </span>
            <button type="button" className="nav-item" onClick={() => loadServices(true)} disabled={refreshing} title="刷新服务状态">
              <RefreshCw className={`nav-ico ${refreshing ? 'spin' : ''}`} size={16} aria-hidden="true" />
              <span className="nav-label">刷新服务状态</span>
            </button>
            <button type="button" className="nav-item" onClick={handleLogout} title="退出登录">
              <LogOut className="nav-ico" size={16} aria-hidden="true" />
              <span className="nav-label">退出登录</span>
            </button>
          </div>
        </aside>

        {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭导航" onClick={closeMobileNav} />}

        <main
          className={`workspace ${isScrolled ? 'is-scrolled' : ''}`}
          aria-hidden={mobileNavOpen || commandOpen || undefined}
          inert={mobileNavOpen || commandOpen || undefined}
        >
          <header className="topbar">
            <button
              ref={mobileMenuButtonRef}
              className="icon-button mobile-menu-button"
              type="button"
              onClick={() => (mobileNavOpen ? closeMobileNav() : setMobileNavOpen(true))}
              aria-label={mobileNavOpen ? '关闭导航' : '打开导航'}
              aria-expanded={mobileNavOpen}
              aria-controls="management-sidebar"
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>

            <nav className="crumbs" aria-label="当前位置">
              <span>{pageEyebrow}</span>
              <span className="crumb-sep" aria-hidden="true">/</span>
              <span className="crumb-current">{viewMeta.title}</span>
            </nav>

            <span className="spacer" />

            <button className="cmd-trigger" type="button" onClick={() => setCommandOpen(true)} aria-label="打开功能搜索">
              <Search size={15} aria-hidden="true" />
              <span className="cmd-text">搜索功能</span>
              <span className="kbd" aria-hidden="true">Ctrl K</span>
            </button>

            <div className="topbar-tools">
              <button
                className="icon-button density-toggle"
                type="button"
                onClick={() => setDensity(nextDensity)}
                aria-label={`表格密度：${DENSITY_LABEL[density]}，点击切换为${DENSITY_LABEL[nextDensity]}`}
                title={`表格密度：${DENSITY_LABEL[density]}`}
              >
                <AlignJustify size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
                title={theme === 'light' ? '深色模式' : '浅色模式'}
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <div ref={notificationRef} className="notification-wrap">
                <button
                  className="icon-button notification-button"
                  type="button"
                  aria-label="查看系统通知"
                  aria-expanded={notificationOpen}
                  onClick={() => setNotificationOpen((open) => !open)}
                >
                  <Bell size={17} />
                  <i className={(operationsSummary?.incidents?.length || attentionCount) > 0 ? 'attention' : ''} />
                </button>
                {notificationOpen && (
                  <div className="notification-popover" role="status">
                    <strong>{incidentCount > 0 ? `${incidentCount} 项事件需要处理` : '系统运行平稳'}</strong>
                    {(operationsSummary?.incidents || []).slice(0, 3).map((incident) => <span key={incident.id}>{incident.title}</span>)}
                    <button type="button" onClick={() => { setNotificationOpen(false); navigateToView('incidents'); }}>查看问题</button>
                  </div>
                )}
              </div>
            </div>

            <div className="user-chip" title={`${username} · ${environmentLabel}`}>
              <span className="avatar" aria-hidden="true"><img src="/assets/console-avatar.jpg" alt="" /></span>
              <span className="user-meta">
                <span className="user-name">{username}</span>
                <span className="user-role">{session.authDisabled ? '本地调试' : '超级管理员'}</span>
              </span>
            </div>
          </header>

          <div className="content" ref={contentRef}>
            <div className="page">
              <div className="page-head">
                <div className="page-head-main">
                  <span className="page-eyebrow">{pageEyebrow}</span>
                  <h1 className="page-title">{viewMeta.title}</h1>
                  <p className="page-desc">{pageDesc}</p>
                </div>
                <div className="page-actions">
                  {activeNavigationGroup.externalAction && (
                    <a className="btn btn-secondary btn-sm" href={activeNavigationGroup.externalAction.href} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>{activeNavigationGroup.externalAction.label}</span>
                    </a>
                  )}
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => loadServices(true)} disabled={refreshing}>
                    <RefreshCw className={refreshing ? 'spin' : ''} size={14} aria-hidden="true" />
                    <span>{refreshing ? '正在刷新' : '刷新服务状态'}</span>
                  </button>
                </div>
              </div>

              <div
                id="console-workspace-panel"
                role="region"
                aria-label={viewMeta.title}
                aria-busy={loading || refreshing}
              >
                {error && (
                  <div className="error-banner" role="alert">
                    <CircleAlert size={17} />
                    <span>{error}</span>
                    <button type="button" onClick={() => loadServices(true)}>重新加载</button>
                  </div>
                )}

                <ViewModuleBoundary key={activeFilter}>
                  <Suspense fallback={<ViewLoadingFallback />}>
                    <div className="page-body">
                    {activeFilter === 'all' && (
                      <OverviewView
                        services={services}
                        counts={counts}
                        total={total}
                        healthyRate={healthyRate}
                        attentionCount={attentionCount}
                        loading={loading}
                        environmentLabel={environmentLabel}
                        monitoringEnabled={monitoringEnabled}
                        setMonitoringEnabled={setMonitoringEnabled}
                        launchService={launchService}
                        refreshedAt={data?.refreshedAt}
                        operationsSummary={operationsSummary}
                        refreshing={refreshing}
                        onRefresh={() => loadServices(true)}
                        onOpenServices={() => navigateToView('miniapp')}
                        onOpenService={(service) => navigateToView(
                          service?.id === 'notify' ? 'notification' : service?.id === 'ct8-automation' ? 'automation' : 'service',
                          { entity: service?.id },
                        )}
                        onOpenIncidents={() => navigateToView('incidents')}
                        onOpenBackup={() => navigateToView('backup')}
                        onOpenConfiguration={() => navigateToView('configuration')}
                      />
                    )}
                    {activeFilter === 'miniapp' && <ApplicationsView services={services} loading={loading} onLaunch={launchService} />}
                    {activeFilter === 'service' && <ServicesView services={services} loading={loading} onLaunch={launchService} targetEntityId={activeEntity} />}
                    {activeFilter === 'external-apps' && <ExternalApplicationsView session={session} />}
                    {activeFilter === 'notification' && <NotificationServiceView session={session} />}
                    {activeFilter === 'monitoring' && <MonitoringView services={services} />}
                    {activeFilter === 'incidents' && <IncidentsView session={session} targetEntityId={activeEntity} onNavigate={navigateToView} />}
                    {activeFilter === 'automation' && (
                      <AutomationView
                        services={services}
                        loading={loading}
                        refreshing={refreshing}
                        onRefresh={() => loadServices(true)}
                        onLaunch={launchService}
                        session={session}
                      />
                    )}
                    {activeFilter === 'backup' && (
                      <BackupRecoveryView
                        session={session}
                        BackupQualityStrip={BackupQualityStrip}
                        BackupOffsitePanel={BackupOffsitePanel}
                      />
                    )}
                    {activeFilter === 'releases' && <ReleasesView session={session} targetEntityId={activeEntity} />}
                    {activeFilter === 'tasks' && <TaskCenterView onNavigate={navigateToView} targetEntityId={activeEntity} />}
                    {activeFilter === 'configuration' && <ConfigurationView session={session} targetEntityId={activeEntity} services={services} />}
                    {activeFilter === 'diagnostics' && <DiagnosticsView services={services} session={session} targetEntityId={activeEntity} />}
                    {activeFilter === 'security' && <SecurityAuditView session={session} onLogout={onLogout} />}
                    </div>
                  </Suspense>
                </ViewModuleBoundary>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
