import React, { Suspense, lazy, memo, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin, theme, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const IotMonitor = lazy(() => import('./pages/IotMonitor'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const ScanManagement = lazy(() => import('./pages/ScanManagement'));
const AirEnergyMonitor = lazy(() => import('./pages/AirEnergyMonitor'));
const Ct8Dashboard = lazy(() => import('./pages/ct8/Ct8Dashboard'));
const Resources = lazy(() => import('./pages/Resources'));
const CourseOrders = lazy(() => import('./pages/CourseOrders'));
const PublicQuery = lazy(() => import('./pages/PublicQuery'));
const NotFound = lazy(() => import('./pages/NotFound'));
const MainLayout = lazy(() => import('./components/MainLayout'));

const ADMIN_ROUTE_PRELOADERS = [
  () => import('./components/MainLayout'),
  () => import('./pages/Dashboard'),
  () => import('./pages/Users'),
  () => import('./pages/Notifications'),
  () => import('./pages/CourseOrders'),
  () => import('./pages/AuditLogs'),
  () => import('./pages/Resources'),
  () => import('./pages/ScanManagement'),
  () => import('./pages/IotMonitor'),
  () => import('./pages/AirEnergyMonitor'),
  () => import('./pages/ct8/Ct8Dashboard'),
  () => import('./pages/Settings'),
];

const RouteFallback = memo(() => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-color, #F5F7FB)'
    }}
  >
    <Spin size="large" />
  </div>
));

const isAdminRoleToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // 安全解码 base64（兼容非 ASCII 字符）
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    ));
    // 必须显式包含 admin 或 super_admin 角色，缺少 role 字段一律拒绝
    return ['admin', 'super_admin'].includes(payload.role);
  } catch {
    return false;
  }
};

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;

  if (!isAdminRoleToken(token)) {
    localStorage.removeItem('token');
    return <Navigate to="/login" />;
  }

  return children;
};

function App() {
  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem('theme') === 'dark' || document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const handleThemeChange = () => {
      setIsDarkMode(localStorage.getItem('theme') === 'dark' || document.documentElement.classList.contains('dark'));
    };
    window.addEventListener('themeChanged', handleThemeChange);

    // 网络断线检测
    const handleOnline = () => message.success('网络已恢复连接');
    const handleOffline = () => message.error('网络连接已断开，请检查您的网络', 0);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('themeChanged', handleThemeChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    let cancelled = false;
    const runPreloadQueue = (index = 0) => {
      if (cancelled || index >= ADMIN_ROUTE_PRELOADERS.length) return;
      ADMIN_ROUTE_PRELOADERS[index]().catch(() => {});

      const scheduleNext = () => runPreloadQueue(index + 1);
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(scheduleNext, { timeout: 2500 });
      } else {
        window.setTimeout(scheduleNext, 350);
      }
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(() => runPreloadQueue(), { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const fallbackTimer = window.setTimeout(() => runPreloadQueue(), 500);
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4A7CF7',
          colorSuccess: '#38B2AC',
          colorWarning: '#F6AD55',
          colorError: '#F56565',
          colorInfo: '#4A7CF7',
          borderRadius: 12,
          fontFamily: "'Plus Jakarta Sans', sans-serif"
        },
        components: {
          Button: {
            controlHeight: 42,
            borderRadius: 16,
          },
          Input: {
            controlHeight: 42,
          }
        }
      }}
    >
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/query" element={<PublicQuery />} />
              <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="iot-monitor" element={<IotMonitor />} />
                <Route path="air-energy" element={<AirEnergyMonitor />} />
                <Route path="users" element={<Users />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="scan-management" element={<ScanManagement />} />
                <Route path="ct8-monitor" element={<Ct8Dashboard />} />
                <Route path="resources" element={<Resources />} />
                <Route path="course-orders" element={<CourseOrders />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </Suspense>
      </ErrorBoundary>
    </ConfigProvider>
  );
}

export default App;

