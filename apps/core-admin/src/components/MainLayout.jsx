import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import api from '../utils/api';
import { Dropdown, Spin, Tooltip } from 'antd';
import {
    UserOutlined,
    SettingOutlined,
    LogoutOutlined,
    MenuUnfoldOutlined,
    MenuFoldOutlined,
    BellOutlined,
    AppstoreOutlined,
    FileTextOutlined,
    DashboardOutlined,
    FireOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    CloseOutlined,
    ReloadOutlined,
    HomeOutlined,
    SunOutlined,
    MoonOutlined,
    ShoppingOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router';
import UserAvatar from './UserAvatar';
import { IS_PLATFORM_SSO, logoutPlatformSession } from '../utils/runtime';
import { message } from '../utils/feedback';

const InlineRouteFallback = () => (
    <div className="route-inline-loading">
        <Spin size="small" />
        <span>加载中…</span>
    </div>
);

const TAB_CONFIG = {
    '/dashboard': { label: '首页', icon: <DashboardOutlined />, closable: false },
    '/air-energy': { label: '空气能', icon: <FireOutlined /> },
    '/users': { label: '用户', icon: <UserOutlined /> },
    '/notifications': { label: '通知', icon: <BellOutlined /> },
    '/audit-logs': { label: '操作记录', icon: <FileTextOutlined /> },
    '/course-orders': { label: '订单', icon: <ShoppingOutlined /> },
    '/settings': { label: '设置', icon: <SettingOutlined /> },
};

const MENU_ITEMS = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
    { key: '/course-orders', icon: <ShoppingOutlined />, label: '订单' },
    { key: '/query', icon: <AppstoreOutlined />, label: '查询' },
    { key: '/air-energy', icon: <FireOutlined />, label: '空气能' },
    { key: '/users', icon: <UserOutlined />, label: '用户' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

/** 品牌标记：统一使用平台应用图标（透明底无限环） */
const BrandMark = () => (
    <span className="brand-mark" aria-hidden="true">
        <img src="/favicon.svg" alt="" />
    </span>
);

const RailNav = ({ selectedPath, onNavigate, collapsed }) => (
    <nav className="rail-nav" aria-label="管理模块">
        <div className="rail-group-label">工作台</div>
        {MENU_ITEMS.map((item) => (
            <button
                key={item.key}
                type="button"
                className={`rail-item ${selectedPath === item.key ? 'is-active' : ''}`}
                onClick={() => onNavigate(item.key)}
                aria-current={selectedPath === item.key ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
            >
                {item.icon}
                <span className="rail-item-label">{item.label}</span>
            </button>
        ))}
    </nav>
);

/** 侧栏内容：桌面侧栏与手机抽屉共用同一套结构 */
const RailContent = ({ collapsed, currentUser, selectedPath, onNavigate, onClose, onLogout, isMobile }) => {
    const avatarSeed = currentUser.userId || currentUser._id || currentUser.nickName || 'admin';
    const displayName = currentUser.nickName || '我的后台';

    return (
        <>
            <div className="rail-brand">
                <BrandMark />
                <span className="brand-copy">
                    <strong>星轨控制台</strong>
                    <small>综合业务管理</small>
                </span>
                {isMobile && (
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭导航菜单" style={{ marginLeft: 'auto' }}>
                        <CloseOutlined />
                    </button>
                )}
            </div>

            <RailNav selectedPath={selectedPath} onNavigate={onNavigate} collapsed={collapsed} />

            <div className="rail-foot">
                <button type="button" className="rail-user" onClick={() => onNavigate('/settings')} title="账号设置">
                    <UserAvatar
                        seed={avatarSeed}
                        label={displayName}
                        avatarUrl={currentUser.avatarUrl}
                        shape="square"
                        size={30}
                    />
                    <span className="rail-user-copy">
                        <strong>{displayName}</strong>
                        <small>综合管理</small>
                    </span>
                    {!collapsed && <RightOutlined style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-faint)' }} />}
                </button>
                <button type="button" className="rail-item" onClick={onLogout}>
                    <LogoutOutlined />
                    <span className="rail-item-label">退出登录</span>
                </button>
            </div>
        </>
    );
};

const MainLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
    const [openTabs, setOpenTabs] = useState(['/dashboard']);
    const [refreshKey, setRefreshKey] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 375 : window.innerWidth));
    const [isPending, startTransition] = useTransition();
    const tabRefs = useRef(new Map());

    // 当前登录用户来自本地缓存，登录态本身由 HttpOnly Cookie 承担
    const [currentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch {
            return {};
        }
    });

    const navigate = useNavigate();
    const location = useLocation();

    const currentPath = location.pathname;
    const currentTabConfig = TAB_CONFIG[currentPath] || { label: '页面', icon: <HomeOutlined /> };
    const pageTitle = currentTabConfig.label;
    const visibleTabs = useMemo(() => {
        if (TAB_CONFIG[currentPath] && !openTabs.includes(currentPath)) {
            return [...openTabs, currentPath];
        }
        return openTabs;
    }, [openTabs, currentPath]);

    useEffect(() => {
        let previousWidth = null;
        const handleResize = () => {
            const width = window.innerWidth;
            if (width === previousWidth) return;
            previousWidth = width;
            setViewportWidth(width);
            if (width <= 768) {
                // 手机：隐藏侧栏，改用抽屉
                setIsMobile(true);
                setCollapsed(false);
            } else if (width <= 1024) {
                // 平板：显示收缩后的图标栏
                setIsMobile(false);
                setDrawerVisible(false);
                setCollapsed(true);
            } else {
                setIsMobile(false);
                setDrawerVisible(false);
                setCollapsed(false);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // 深浅主题：同时驱动珍珠令牌（data-theme）与 antd（dark 类 + 上层 algorithm）
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        root.classList.toggle('dark', isDarkMode);
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        window.dispatchEvent(new Event('themeChanged'));
    }, [isDarkMode]);

    // 抽屉打开时允许 Esc 关闭
    useEffect(() => {
        if (!drawerVisible) return undefined;
        const handleKey = (event) => {
            if (event.key === 'Escape') setDrawerVisible(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [drawerVisible]);

    const toggleTheme = useCallback(() => setIsDarkMode((prev) => !prev), []);

    const handleLogout = useCallback(async () => {
        try {
            if (IS_PLATFORM_SSO) {
                await logoutPlatformSession();
                return;
            }
            await api.post('/auth/logout', {});
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.dispatchEvent(new Event('core-auth-expired'));
            navigate('/login');
        } catch (error) {
            message.error(error.response?.data?.message || error.message || '退出失败，请检查网络后重试');
        }
    }, [navigate]);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
    }, []);

    const returnToPlatformConsole = useCallback(() => {
        window.location.assign('/console');
    }, []);

    const openNotificationConsole = useCallback(() => {
        window.location.assign('/console?view=notification');
    }, []);

    const navigateSoftly = useCallback((path) => {
        startTransition(() => navigate(path));
    }, [navigate]);

    const handleTabClick = useCallback((path) => {
        setOpenTabs((prev) => (TAB_CONFIG[path] && !prev.includes(path) ? [...prev, path] : prev));
        navigateSoftly(path);
    }, [navigateSoftly]);

    const handleNavigate = useCallback((path) => {
        handleTabClick(path);
        setDrawerVisible(false);
    }, [handleTabClick]);

    const handleTabClose = (event, path) => {
        event.stopPropagation();
        if (path === '/dashboard') return;
        const newTabs = visibleTabs.filter((tab) => tab !== path);
        const closedIndex = visibleTabs.indexOf(path);
        const focusPath = newTabs[Math.min(closedIndex, newTabs.length - 1)] || '/dashboard';
        setOpenTabs(newTabs);
        if (currentPath === path) navigateSoftly(focusPath);
        window.requestAnimationFrame(() => tabRefs.current.get(focusPath)?.focus());
    };

    const handleTabKeyDown = (event, path, index) => {
        const lastIndex = visibleTabs.length - 1;
        let targetIndex = null;
        if (event.key === 'ArrowRight') targetIndex = index === lastIndex ? 0 : index + 1;
        else if (event.key === 'ArrowLeft') targetIndex = index === 0 ? lastIndex : index - 1;
        else if (event.key === 'Home') targetIndex = 0;
        else if (event.key === 'End') targetIndex = lastIndex;
        else if (event.key === 'Delete' && TAB_CONFIG[path]?.closable !== false) {
            event.preventDefault();
            handleTabClose(event, path);
            return;
        }

        if (targetIndex === null) return;
        event.preventDefault();
        const nextPath = visibleTabs[targetIndex];
        handleTabClick(nextPath);
        window.requestAnimationFrame(() => tabRefs.current.get(nextPath)?.focus());
    };

    const userMenuItems = [
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '账号设置',
            onClick: () => handleNavigate('/settings'),
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            danger: true,
            onClick: handleLogout,
        },
    ];

    const railCollapsed = !isMobile && collapsed;

    return (
        <div className="app-shell" data-collapsed={railCollapsed ? 'true' : 'false'}>
            {!isMobile && (
                <aside className="app-rail">
                    <RailContent
                        collapsed={railCollapsed}
                        currentUser={currentUser}
                        selectedPath={currentPath}
                        onNavigate={handleNavigate}
                        onClose={() => setDrawerVisible(false)}
                        onLogout={handleLogout}
                    />
                </aside>
            )}

            {isMobile && drawerVisible && (
                <>
                    <button
                        type="button"
                        className="app-drawer-backdrop"
                        onClick={() => setDrawerVisible(false)}
                        aria-label="关闭导航菜单"
                    />
                    <div className="app-drawer" role="dialog" aria-modal="true" aria-label="导航菜单">
                        <RailContent
                            collapsed={false}
                            currentUser={currentUser}
                            selectedPath={currentPath}
                            onNavigate={handleNavigate}
                            onClose={() => setDrawerVisible(false)}
                            onLogout={handleLogout}
                            isMobile
                        />
                    </div>
                </>
            )}

            <div className="app-main">
                <header className="app-topbar">
                    <div className="topbar-left">
                        {isMobile ? (
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setDrawerVisible(true)}
                                aria-label="打开导航菜单"
                            >
                                <MenuUnfoldOutlined />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setCollapsed((prev) => !prev)}
                                aria-label={collapsed ? '展开导航栏' : '收起导航栏'}
                            >
                                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            </button>
                        )}

                        {isMobile ? (
                            <span className="topbar-title" style={{ maxWidth: Math.max(120, viewportWidth - 220) }}>
                                {pageTitle}
                            </span>
                        ) : (
                            <div className="topbar-crumb">
                                <span>首页</span>
                                <span aria-hidden="true">/</span>
                                <b>{pageTitle}</b>
                            </div>
                        )}
                    </div>

                    <div className="topbar-right">
                        {IS_PLATFORM_SSO && (
                            <Tooltip title="返回统一服务控制台">
                                <button
                                    type="button"
                                    className={isMobile ? 'icon-btn' : 'icon-btn is-label'}
                                    onClick={returnToPlatformConsole}
                                    aria-label="返回统一服务控制台"
                                >
                                    <AppstoreOutlined />
                                    {!isMobile && <span>统一控制台</span>}
                                </button>
                            </Tooltip>
                        )}
                        <Tooltip title={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={toggleTheme}
                                aria-label={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
                            >
                                {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                            </button>
                        </Tooltip>
                        {!isMobile && (
                            <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={toggleFullscreen}
                                    aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                                >
                                    {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                </button>
                            </Tooltip>
                        )}
                        {!isMobile && (
                            <Tooltip title="打开统一通知控制中心">
                                <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={openNotificationConsole}
                                    aria-label="打开统一通知控制中心"
                                >
                                    <BellOutlined />
                                </button>
                            </Tooltip>
                        )}
                        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                            <button className="app-avatar-trigger" type="button" aria-label="打开用户菜单">
                                <UserAvatar
                                    seed={currentUser.userId || currentUser._id || currentUser.nickName || 'admin'}
                                    label={currentUser.nickName || currentUser.userId || 'admin'}
                                    avatarUrl={currentUser.avatarUrl}
                                    size={isMobile ? 29 : 31}
                                />
                            </button>
                        </Dropdown>
                    </div>
                </header>

                <div className="app-tabs" role="tablist" aria-label="已打开的管理页面">
                    {visibleTabs.map((path, index) => {
                        const config = TAB_CONFIG[path];
                        if (!config) return null;
                        const isActive = path === currentPath;
                        const isClosable = config.closable !== false;
                        const nextPath = visibleTabs[index + 1];
                        const showDivider = !isActive && nextPath !== currentPath && index !== visibleTabs.length - 1;

                        return (
                            <React.Fragment key={path}>
                                <button
                                    ref={(node) => {
                                        if (node) tabRefs.current.set(path, node);
                                        else tabRefs.current.delete(path);
                                    }}
                                    type="button"
                                    id={`core-admin-tab-${path.slice(1)}`}
                                    className={`app-tab ${isActive ? 'is-active' : ''}`}
                                    onClick={() => handleTabClick(path)}
                                    onKeyDown={(event) => handleTabKeyDown(event, path, index)}
                                    role="tab"
                                    tabIndex={isActive ? 0 : -1}
                                    aria-selected={isActive}
                                    aria-controls="core-admin-route-panel"
                                    aria-current={isActive ? 'page' : undefined}
                                    aria-label={isClosable ? `${config.label}，按 Delete 关闭页签` : config.label}
                                >
                                    {config.icon}
                                    <span>{config.label}</span>
                                    {isClosable && (
                                        <span
                                            className="app-tab-close"
                                            onClick={(event) => handleTabClose(event, path)}
                                            aria-hidden="true"
                                        >
                                            <CloseOutlined />
                                        </span>
                                    )}
                                </button>
                                {showDivider && <span className="app-tab-divider" aria-hidden="true" />}
                            </React.Fragment>
                        );
                    })}

                    <div className="app-tab-tools">
                        <Tooltip title="刷新当前页">
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setRefreshKey((prev) => prev + 1)}
                                aria-label="刷新当前页"
                                style={{ width: 28, height: 28 }}
                            >
                                <ReloadOutlined />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                <main className="app-content">
                    <div
                        id="core-admin-route-panel"
                        className={`route-content-shell ${isPending ? 'is-pending' : ''}`}
                        role="tabpanel"
                        aria-labelledby={`core-admin-tab-${currentPath.slice(1)}`}
                        aria-busy={isPending}
                    >
                        {isPending && (
                            <div className="route-pending">
                                <Spin size="small" />
                                <span>切换中</span>
                            </div>
                        )}
                        <div className="fade-in" key={`${location.pathname}-${refreshKey}`}>
                            <Suspense fallback={<InlineRouteFallback />}>
                                <Outlet />
                            </Suspense>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
