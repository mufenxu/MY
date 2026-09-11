import {
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
import { SegmentedTabs } from './UiControls.jsx';
import { ViewLoadingFallback, ViewModuleBoundary, getGreeting, NAVIGATION_ICONS } from './shared.jsx';
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
const SettingsDiagnosticsView = lazyNamed(loadOperationsViews, 'SettingsDiagnosticsView');

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
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('my-console-theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const mobileMenuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const notificationRef = useRef(null);
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
    if (window.matchMedia('(max-width: 980px)').matches) {
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
    try {
      window.localStorage.setItem('my-console-theme', theme);
    } catch {
      // Theme still applies for the current page when storage is unavailable.
    }
  }, [theme]);

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
  const activeNavigationViews = activeNavigationGroup.visible === false
    ? activeNavigationGroup.views.filter((view) => view.id === activeFilter)
    : activeNavigationGroup.views;
  const viewMeta = {
    miniapp: { title: '业务入口', subtitle: '打开综合、考试、校园与设备服务' },
    service: { title: '服务状态', subtitle: '查看各服务是否正常' },
    'external-apps': { title: '外部应用', subtitle: '其他项目的登录与直达设置' },
    notification: { title: '消息通知', subtitle: '企业微信消息发送情况' },
    monitoring: { title: '运行趋势', subtitle: '查看服务最近的状态' },
    incidents: { title: '问题处理', subtitle: '发现并处理运行异常' },
    automation: { title: '自动任务', subtitle: '查看自动任务是否完成' },
    backup: { title: '备份恢复', subtitle: '保存和恢复重要数据' },
    releases: { title: '更新记录', subtitle: '查看版本更新情况' },
    tasks: { title: '待办任务', subtitle: '查看需要处理的任务' },
    configuration: { title: '运行设置', subtitle: '调整运行参数和版本' },
    diagnostics: { title: '连接检查', subtitle: '检查服务连接是否正常' },
    security: { title: '安全设置', subtitle: '登录方式和操作记录' },
  }[activeFilter];

  return (
    <div className="app-shell">
      <div className="glass-ambient-canvas" aria-hidden="true">
        <div className="glass-ambient-orb orb-primary" />
        <div className="glass-ambient-orb orb-secondary" />
        <div className="glass-ambient-orb orb-tertiary" />
      </div>
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

      <aside ref={sidebarRef} id="management-sidebar" className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`} aria-hidden={commandOpen || undefined} inert={commandOpen || undefined}>
        <div className="sidebar-brand" aria-hidden="true">
          <span className="sidebar-brand-mark"><img src="/assets/console-avatar.jpg" alt="" /></span>
          <span className="sidebar-brand-copy"><strong>MY 平台</strong><small>统一服务控制台</small></span>
        </div>
        <nav className="main-nav" aria-label="管理模块">
          {NAV_GROUPS.filter((group) => group.visible !== false).map((group) => {
            const Icon = NAVIGATION_ICONS[group.id];
            const active = activeNavigationGroup.id === group.id;
            return (
            <button
              key={group.id}
              className={active ? 'active' : ''}
              onClick={() => {
                navigateToView(group.defaultView);
                closeMobileNav();
              }}
              title={group.label}
              aria-label={group.label}
              aria-pressed={active}
              type="button"
            >
              <Icon size={19} />
              <span>{group.label}</span>
            </button>
            );
          })}
          <button type="button" onClick={() => loadServices(true)} disabled={refreshing} title="刷新服务状态">
            <RefreshCw className={refreshing ? 'spin' : ''} size={19} />
            <span>刷新状态</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="environment-indicator" title={`当前环境：${environmentLabel}`}><i /><span>{environmentLabel}</span></span>
          <button type="button" onClick={handleLogout} title="退出登录" aria-label="退出登录">
            <LogOut size={18} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" type="button" aria-label="关闭导航" onClick={closeMobileNav} />}

      <main className="workspace" aria-hidden={mobileNavOpen || commandOpen || undefined} inert={mobileNavOpen || commandOpen || undefined}>
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
            <div className="welcome-copy">
              {activeFilter === 'all' ? (
                <h1>{greeting}，<strong>{username}</strong></h1>
              ) : <h1><strong>{activeNavigationGroup.label}</strong></h1>}
              {activeFilter !== 'all' && <span>{viewMeta.subtitle}</span>}
            </div>
          </div>

          <div className="topbar-actions">
            <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)} aria-label="打开功能搜索">
              <Search size={17} />
              <span>搜索功能</span>
            </button>
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
            <div ref={notificationRef} className="notification-wrap">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="查看系统通知"
                aria-expanded={notificationOpen}
                onClick={() => setNotificationOpen((open) => !open)}
              >
                <Bell size={19} />
                <i className={(operationsSummary?.incidents?.length || attentionCount) > 0 ? 'attention' : ''} />
              </button>
              {notificationOpen && (
                <div className="notification-popover" role="status">
                  <strong>{operationsSummary?.incidents?.length > 0 ? `${operationsSummary.incidents.length} 项事件需要处理` : '系统运行平稳'}</strong>
                  {(operationsSummary?.incidents || []).slice(0, 3).map((incident) => <span key={incident.id}>{incident.title}</span>)}
                  <button type="button" onClick={() => { setNotificationOpen(false); navigateToView('incidents'); }}>查看问题</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="workspace-content">
          {activeNavigationViews.length > 1 && (
            <div className="workspace-section-nav">
              <SegmentedTabs
                className="workspace-tabs"
                ariaLabel={`${activeNavigationGroup.label}功能`}
                idPrefix="console-workspace-tab"
                panelId="console-workspace-panel"
                items={activeNavigationViews.map((view) => ({ id: view.id, label: view.label }))}
                value={activeFilter}
                onChange={navigateToView}
              />
              {activeNavigationGroup.externalAction && (
                <a href={activeNavigationGroup.externalAction.href} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  <span>{activeNavigationGroup.externalAction.label}</span>
                </a>
              )}
            </div>
          )}
          <div
            id="console-workspace-panel"
            role="tabpanel"
            aria-labelledby={activeNavigationViews.length > 1 ? `console-workspace-tab-${activeFilter}` : undefined}
            aria-label={activeNavigationViews.length === 1 ? activeNavigationGroup.label : undefined}
            aria-busy={loading || refreshing}
          >
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button type="button" onClick={() => loadServices(true)}>重新加载</button>
            </div>
          )}

          <ViewModuleBoundary key={activeFilter}>
          <Suspense fallback={<ViewLoadingFallback />}>
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
          {activeFilter === 'configuration' && <><ConfigurationView session={session} targetEntityId={activeEntity} /><SettingsDiagnosticsView session={session} /></>}
          {activeFilter === 'diagnostics' && <DiagnosticsView services={services} session={session} targetEntityId={activeEntity} />}
          {activeFilter === 'security' && <SecurityAuditView session={session} onLogout={onLogout} />}
          </Suspense>
          </ViewModuleBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}
