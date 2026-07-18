import React, { Suspense, useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import api from '../utils/api';
import { Layout, Menu, Button, Drawer, Dropdown, Breadcrumb, Tooltip, Spin } from 'antd';
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
    CloudOutlined,
    FireOutlined,
    GlobalOutlined,
    DatabaseOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    CloseOutlined,
    ReloadOutlined,
    HomeOutlined,
    SunOutlined,
    MoonOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { IS_PLATFORM_SSO, logoutPlatformSession } from '../utils/runtime';

const { Sider, Content } = Layout;

const InlineRouteFallback = () => (
    <div className="route-inline-loading">
        <Spin size="small" />
        <span>加载中...</span>
    </div>
);

const TAB_CONFIG = {
    '/dashboard': { label: '数据仪表盘', icon: <DashboardOutlined />, closable: false },
    '/iot-monitor': { label: 'IoT监控', icon: <CloudOutlined /> },
    '/ct8-monitor': { label: 'CT8节点', icon: <GlobalOutlined /> },
    '/air-energy': { label: '空气能监控', icon: <FireOutlined /> },
    '/users': { label: '用户与权限', icon: <UserOutlined /> },
    '/notifications': { label: '通知管理', icon: <BellOutlined /> },
    '/audit-logs': { label: '审计日志', icon: <FileTextOutlined /> },
    '/scan-management': { label: '扫码管理', icon: <AppstoreOutlined /> },
    '/resources': { label: '全局配置', icon: <DatabaseOutlined /> },
    '/course-orders': { label: '网课订单处理', icon: <FileTextOutlined /> },
    '/settings': { label: '系统设置', icon: <SettingOutlined /> },
};

const MENU_ITEMS = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '数据仪表盘' },
    {
        key: 'group-monitor',
        icon: <CloudOutlined />,
        label: '设备与监控',
        children: [
            { key: '/iot-monitor', label: 'IoT监控' },
            { key: '/ct8-monitor', label: 'CT8节点' },
            { key: '/air-energy', label: '空气能监控' },
        ]
    },
    {
        key: 'group-ops',
        icon: <AppstoreOutlined />,
        label: '业务与运营',
        children: [
            { key: '/scan-management', label: '扫码管理' },
            { key: '/course-orders', label: '网课订单处理' },
            { key: '/query', label: '记录查询入口' },
            { key: '/notifications', label: '通知管理' },
        ]
    },
    {
        key: 'group-sys',
        icon: <SettingOutlined />,
        label: '系统与架构',
        children: [
            { key: '/users', label: '用户与权限' },
            { key: '/resources', label: '全局配置' },
            { key: '/audit-logs', label: '审计日志' },
            { key: '/settings', label: '系统设置' },
        ]
    },
];

const TABLE_HEAVY_ROUTES = new Set([
    '/dashboard',
    '/iot-monitor',
    '/air-energy',
    '/users',
    '/notifications',
    '/audit-logs',
    '/scan-management',
    '/resources',
    '/course-orders',
    '/ct8-monitor',
]);

const SidebarContent = ({
    collapsed,
    currentUser,
    openKeys,
    onOpenChange,
    selectedPath,
    menuItems,
    onMenuClick,
    onClose,
    onLogout,
    isMobile = false
}) => {
    const avatarSeed = currentUser.userId || currentUser._id || currentUser.nickName || 'admin';
    const displayName = currentUser.nickName || 'Mufenxu';
    const userMeta = currentUser.userId ? `ID · ${currentUser.userId}` : (currentUser.role || currentUser._id || '');

    if (isMobile) {
        return (
            <div
                className="main-sidebar-content main-sidebar-content-mobile"
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 0 0'
                }}
            >
                <div className="main-sidebar-mobile-top">
                    <div className="main-sidebar-user main-sidebar-user-mobile-card">
                        <div className="main-sidebar-user-main">
                            <UserAvatar
                                seed={avatarSeed}
                                label={displayName}
                                shape="square"
                                size={42}
                                style={{
                                    borderRadius: 14,
                                    boxShadow: '0 10px 20px rgba(67, 24, 255, 0.14)',
                                    border: '1px solid var(--border-color)',
                                }}
                            />
                            <div className="main-sidebar-user-copy">
                                <span className="main-sidebar-user-name">{displayName}</span>
                                {userMeta && <span className="main-sidebar-user-meta">{userMeta}</span>}
                            </div>
                        </div>
                        <Button
                            type="text"
                            icon={<CloseOutlined />}
                            onClick={onClose}
                            className="main-sidebar-mobile-close"
                            aria-label="关闭侧边栏"
                        />
                    </div>
                </div>

                <div className="main-sidebar-mobile-menu-wrap">
                    <div className="main-sidebar-mobile-section-label">导航菜单</div>
                    <Menu
                        className="main-sidebar-menu-mobile"
                        mode="inline"
                        openKeys={openKeys}
                        onOpenChange={onOpenChange}
                        selectedKeys={[selectedPath]}
                        items={menuItems}
                        onClick={onMenuClick}
                        inlineIndent={20}
                        style={{
                            borderRight: 0,
                            background: 'transparent'
                        }}
                        theme="light"
                    />
                </div>

                <div className="main-sidebar-mobile-footer">
                    <Button
                        block
                        danger
                        type="primary"
                        icon={<LogoutOutlined />}
                        onClick={onLogout}
                        className="main-sidebar-mobile-logout"
                    >
                        退出登录
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="main-sidebar-content"
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '20px 0'
            }}
        >
            <div className="main-sidebar-user" style={{
                padding: '0 24px 30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 12
            }}>
                <UserAvatar
                    seed={avatarSeed}
                    label={displayName}
                    shape="square"
                    size={40}
                    style={{
                        borderRadius: 12,
                        boxShadow: '0 10px 20px rgba(67, 24, 255, 0.15)',
                        border: '1px solid var(--border-color)',
                    }}
                />
                {!collapsed && (
                    <span style={{
                        color: 'var(--text-primary)',
                        fontSize: 22,
                        fontWeight: 700,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 160
                    }}>
                        {displayName}
                    </span>
                )}
            </div>

            <Menu
                className="main-sidebar-menu"
                mode="inline"
                openKeys={openKeys}
                onOpenChange={onOpenChange}
                selectedKeys={[selectedPath]}
                items={menuItems}
                onClick={onMenuClick}
                inlineIndent={24}
                style={{
                    borderRight: 0,
                    background: 'transparent',
                    padding: '0 12px'
                }}
                theme="light"
            />
        </div>
    );
};

const MainLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem('theme') === 'dark';
    });
    const [openTabs, setOpenTabs] = useState(['/dashboard']);
    const [refreshKey, setRefreshKey] = useState(0);
    const [manualOpenKeys, setManualOpenKeys] = useState([]);
    const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 375 : window.innerWidth));
    const [isPending, startTransition] = useTransition();
    
    // 浠庢湰鍦板瓨鍌ㄨ鍙栧綋鍓嶇櫥褰曠敤鎴蜂俊鎭?
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
    const isTableHeavyRoute = useMemo(() => TABLE_HEAVY_ROUTES.has(currentPath), [currentPath]);
    const currentTabConfig = TAB_CONFIG[currentPath] || { label: '未知页面', icon: <HomeOutlined /> };
    const pageTitle = currentTabConfig.label;
    const visibleTabs = useMemo(() => {
        if (TAB_CONFIG[currentPath] && !openTabs.includes(currentPath)) {
            return [...openTabs, currentPath];
        }
        return openTabs;
    }, [openTabs, currentPath]);
    const mobileDrawerWidth = useMemo(() => {
        return Math.min(200, viewportWidth * 0.68);
    }, [viewportWidth]);

    const breadcrumbItems = [
        { title: '管理面板' },
        { title: pageTitle }
    ];

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setViewportWidth(width);
            if (width <= 768) {
                // 鎵嬫満绔細闅愯棌渚ф爮锛屽惎鐢ㄦ娊灞?
                setIsMobile(true);
                setIsTablet(false);
                setCollapsed(false); 
            } else if (width <= 1024) {
                // 骞虫澘绔細鏄剧ず鏀剁缉渚ф爮
                setIsMobile(false);
                setIsTablet(true);
                setDrawerVisible(false);
                setCollapsed(true);
            } else {
                // 妗岄潰绔細鏄剧ず瀹屾暣渚ф爮
                setIsMobile(false);
                setIsTablet(false);
                setDrawerVisible(false);
                setCollapsed(false);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 鐩戝惉鍏ㄥ睆鍙樺寲
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // 鐩戝惉鍜屽簲鐢ㄦ殫榛戞ā寮?
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            // 鍙互閽堝鎬у湴鏇挎崲鏌愪簺妗嗘灦鐨勪富棰樺彉閲忥紝鐩墠宸插湪 CSS 涓€氳繃 .dark 瑕嗙洊
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
        window.dispatchEvent(new Event('themeChanged'));
    }, [isDarkMode]);

    const toggleTheme = useCallback(() => {
        setIsDarkMode(prev => !prev);
    }, []);

    const handleLogout = useCallback(async () => {
        if (IS_PLATFORM_SSO) {
            localStorage.removeItem('user');
            await logoutPlatformSession();
            return;
        }
        try {
            await api.post('/auth/logout', {});
        } catch {
            // 即使后端调用失败也继续清理本地状态
        }
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        navigate('/login');
    }, [navigate]);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }, []);

    const navigateSoftly = useCallback((path) => {
        startTransition(() => {
            navigate(path);
        });
    }, [navigate]);

    const handleTabClick = (path) => {
        if (TAB_CONFIG[path] && !openTabs.includes(path)) {
            setOpenTabs(prev => [...prev, path]);
        }
        navigateSoftly(path);
    };

    const handleTabClose = (e, path) => {
        e.stopPropagation();
        if (path === '/dashboard') return;
        const newTabs = visibleTabs.filter(t => t !== path);
        setOpenTabs(newTabs);
        if (currentPath === path) {
            navigateSoftly(newTabs[newTabs.length - 1] || '/dashboard');
        }
    };
    const routeOpenKeys = useMemo(() => {
        const keysToOpen = [];
        MENU_ITEMS.forEach(item => {
            if (item.children?.some(child => child.key === location.pathname)) {
                keysToOpen.push(item.key);
            }
        });
        return keysToOpen;
    }, [location.pathname]);
    const mergedOpenKeys = Array.from(new Set([...manualOpenKeys, ...routeOpenKeys]));

    const handleOpenChange = (keys) => {
        setManualOpenKeys(keys);
    };

    const handleMenuClick = ({ key }) => {
        if (TAB_CONFIG[key] && !openTabs.includes(key)) {
            setOpenTabs(prev => [...prev, key]);
        }
        navigateSoftly(key);
        if (isMobile) {
            setDrawerVisible(false);
        }
    };

    const userMenuItems = [
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            danger: true,
            onClick: handleLogout
        }
    ];

    return (
        <Layout
            className={isTableHeavyRoute ? 'main-admin-shell main-admin-shell-perf' : 'main-admin-shell'}
            style={{ minHeight: '100vh', background: 'var(--bg-color)' }}
        >
            {!isMobile && (
                <Sider
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    width={240}
                    theme="light"
                    style={{
                        overflow: 'auto',
                        height: '100vh',
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        zIndex: 1001,
                        borderRadius: '0 0 24px 0', 
                        borderRight: 'none',
                        boxShadow: '10px 0 35px rgba(112, 144, 176, 0.12), inset -2px 0 5px rgba(112, 144, 176, 0.05)', 
                        background: 'var(--component-bg)',
                        transform: 'translateZ(0)'
                    }}
                >
                    <SidebarContent
                        collapsed={collapsed}
                        currentUser={currentUser}
                        openKeys={mergedOpenKeys}
                        onOpenChange={handleOpenChange}
                        selectedPath={location.pathname}
                        menuItems={MENU_ITEMS}
                        onMenuClick={handleMenuClick}
                        onClose={() => setDrawerVisible(false)}
                        onLogout={handleLogout}
                        isMobile={false}
                    />
                </Sider>
            )}

            <Drawer
                className="main-mobile-drawer"
                placement="left"
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                bodyStyle={{ padding: 0, background: 'var(--component-bg)' }}
                width={mobileDrawerWidth}
                closable={false}
                style={{ zIndex: 1100 }}
            >
                <SidebarContent
                    collapsed={collapsed}
                    currentUser={currentUser}
                    openKeys={mergedOpenKeys}
                    onOpenChange={handleOpenChange}
                    selectedPath={location.pathname}
                    menuItems={MENU_ITEMS}
                    onMenuClick={handleMenuClick}
                    onClose={() => setDrawerVisible(false)}
                    onLogout={handleLogout}
                    isMobile
                />
            </Drawer>

            <Layout style={{
                marginLeft: isMobile ? 0 : (collapsed ? 80 : 240),
                transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                background: 'var(--bg-color)',
            }}>
                {/* ===== SoybeanAdmin 椋庢牸椤舵爮 ===== */}
                <div className="soybean-header-wrapper" style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1000,
                    overflow: 'hidden',
                    background: 'var(--component-bg)',
                    borderRadius: '0 0 28px 28px', 
                    borderBottom: 'none', 
                    boxShadow: '0 15px 35px rgba(112, 144, 176, 0.1), inset 0 -3px 6px rgba(112, 144, 176, 0.05)',
                    transform: 'translateZ(0)'
                }}>
                    {/* 绗竴灞傦細闈㈠寘灞?+ 宸ュ叿鏍?*/}
                    <div className="soybean-header-bar" style={{
                        height: isMobile ? 48 : (isTablet ? 52 : 56),
                        padding: isMobile ? '0 10px' : '0 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
                    }}>
                        {/* 宸︿晶锛氭姌鍙犳寜閽?+ 闈㈠寘灞?*/}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isMobile ? (
                                <Button
                                    type="text"
                                    icon={<MenuUnfoldOutlined />}
                                    onClick={() => setDrawerVisible(true)}
                                    className="soybean-header-icon-btn"
                                />
                            ) : (
                                <Button
                                    type="text"
                                    icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                                    onClick={() => setCollapsed(!collapsed)}
                                    className="soybean-header-icon-btn"
                                />
                            )}
                            {/* 鎵嬫満绔樉绀虹畝娲侀〉闈㈡爣棰橈紝骞虫澘/妗岄潰鏄剧ず闈㈠寘灞?*/}
                            {isMobile ? (
                                <span style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: Math.max(112, viewportWidth - 230)
                                }}>
                                    {pageTitle}
                                </span>
                            ) : (
                                <Breadcrumb
                                    items={breadcrumbItems}
                                    className="soybean-breadcrumb"
                                />
                            )}
                        </div>

                        {/* 鍙充晶锛氬伐鍏峰浘鏍?+ 澶村儚 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Tooltip title={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}>
                                <Button
                                    type="text"
                                    icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                                    onClick={toggleTheme}
                                    className="soybean-header-icon-btn"
                                />
                            </Tooltip>
                            {!isMobile && (
                                <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
                                    <Button
                                        type="text"
                                        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                        onClick={toggleFullscreen}
                                        className="soybean-header-icon-btn"
                                    />
                                </Tooltip>
                            )}
                            {!isMobile && (
                                <Tooltip title="通知">
                                    <Button
                                        type="text"
                                        icon={<BellOutlined />}
                                        className="soybean-header-icon-btn"
                                    />
                                </Tooltip>
                            )}
                            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                                <UserAvatar
                                    seed={currentUser.userId || currentUser._id || currentUser.nickName || 'admin'}
                                    label={currentUser.nickName || currentUser.userId || 'admin'}
                                    className="soybean-header-avatar"
                                    style={{
                                        cursor: 'pointer',
                                        marginLeft: 8,
                                        border: '1px solid var(--border-color)',
                                    }}
                                    size={isMobile ? 30 : 34}
                                />
                            </Dropdown>
                        </div>
                    </div>

                    {/* 绗簩灞傦細澶氭爣绛鹃〉 */}
                    <div className="soybean-tabs-bar" style={{
                        height: isMobile ? 36 : (isTablet ? 44 : 54),
                        padding: isMobile ? '0 8px' : '0 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        backgroundColor: 'var(--component-bg)', // 纭繚鑳屾櫙鑹?
                    }}>
                        {visibleTabs.map((path, index) => {
                            const config = TAB_CONFIG[path];
                            if (!config) return null;
                            const isActive = path === currentPath;
                            const isClosable = config.closable !== false;
                            
                            const nextPath = visibleTabs[index + 1];
                            const isNextActive = nextPath === currentPath;
                            const showDivider = !isActive && !isNextActive && index !== visibleTabs.length - 1;

                            return (
                                <React.Fragment key={path}>
                                    <div
                                        className={`soybean-tab-item ${isActive ? 'soybean-tab-active' : ''}`}
                                        onClick={() => handleTabClick(path)}
                                    >
                                        <span className="soybean-tab-icon">{config.icon}</span>
                                        <span className="soybean-tab-label">{config.label}</span>
                                        {isClosable && (
                                            <span
                                                className="soybean-tab-close"
                                                onClick={(e) => handleTabClose(e, path)}
                                            >
                                                <CloseOutlined />
                                            </span>
                                        )}
                                    </div>
                                    {showDivider && (
                                        <div style={{ width: 1, height: 16, backgroundColor: '#e5e7eb', flexShrink: 0 }}></div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {/* 鍙充晶鍒锋柊鎸夐挳 */}
                        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <Tooltip title="刷新当前页">
                                <Button
                                    type="text"
                                    icon={<ReloadOutlined />}
                                    size="small"
                                    className="soybean-header-icon-btn"
                                    onClick={() => {
                                        setRefreshKey(prev => prev + 1);
                                    }}
                                    style={{ fontSize: 13 }}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </div>



                <Content style={{
                    minHeight: 280,
                    overflow: 'initial',
                    padding: isMobile
                        ? '6px 8px calc(14px + env(safe-area-inset-bottom))'
                        : (isTablet ? '8px 12px 16px' : '12px 16px 16px'),
                }}>
                    <div
                        className={`route-content-shell ${isPending ? 'route-content-shell-pending' : ''}`}
                        aria-busy={isPending}
                    >
                        {isPending && (
                            <div className="route-pending-indicator">
                                <Spin size="small" />
                            </div>
                        )}
                        <div className="fade-in" key={`${location.pathname}-${refreshKey}`}>
                            <Suspense fallback={<InlineRouteFallback />}>
                                <Outlet />
                            </Suspense>
                        </div>
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
};

export default MainLayout;
