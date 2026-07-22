import React, { Suspense, lazy, memo, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, Button, ConfigProvider, Result, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ErrorBoundary from './components/ErrorBoundary';
import api from './utils/api';
import { APP_BASE_PATH, IS_PLATFORM_SSO, redirectToPlatformLogin } from './utils/runtime';
import { bindFeedbackApis, message } from './utils/feedback';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const AirEnergyMonitor = lazy(() => import('./pages/AirEnergyMonitor'));
const CourseOrders = lazy(() => import('./pages/CourseOrders'));
const PublicQuery = lazy(() => import('./pages/PublicQuery'));
const NotFound = lazy(() => import('./pages/NotFound'));
const MainLayout = lazy(() => import('./components/MainLayout'));

function FeedbackBinder() {
  bindFeedbackApis(AntApp.useApp());
  return null;
}

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

const PrivateRoute = ({ children, session }) => {
  if (!session.ready) return <RouteFallback />;
  return session.authenticated ? children : <Navigate to="/login" replace />;
};

const PlatformViewRedirect = ({ view }) => {
  useEffect(() => {
    window.location.replace(`/?view=${encodeURIComponent(view)}`);
  }, [view]);
  return <RouteFallback />;
};

const ExternalAppRedirect = ({ href }) => {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return <RouteFallback />;
};

function App() {
  const [session, setSession] = useState(() => ({
    ready: false,
    authenticated: false,
    error: null,
  }));
  const [sessionRetry, setSessionRetry] = useState(0);
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
    let cancelled = false;
    api.get('/users/me', { skipAuthRedirect: true })
      .then((response) => {
        if (cancelled) return;
        const user = response.data.user || {};
        const authenticated = ['admin', 'super_admin'].includes(user.role);
        if (authenticated) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
        setSession({ ready: true, authenticated, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        if (IS_PLATFORM_SSO && error.response?.status === 401) return redirectToPlatformLogin();
        if (!IS_PLATFORM_SSO && error.response?.status === 401) {
          setSession({ ready: true, authenticated: false, error: null });
          return;
        }
        setSession({ ready: false, authenticated: false, error });
      });
    return () => { cancelled = true; };
  }, [sessionRetry]);

  useEffect(() => {
    const refreshSession = () => {
      setSession({ ready: false, authenticated: false, error: null });
      setSessionRetry((value) => value + 1);
    };
    const expireSession = () => setSession({ ready: true, authenticated: false, error: null });
    window.addEventListener('core-auth-changed', refreshSession);
    window.addEventListener('core-auth-expired', expireSession);
    return () => {
      window.removeEventListener('core-auth-changed', refreshSession);
      window.removeEventListener('core-auth-expired', expireSession);
    };
  }, []);

  if (session.error) {
    const status = session.error.response?.status;
    const isMappingError = IS_PLATFORM_SSO && status === 403;
    const isPermissionError = !IS_PLATFORM_SSO && status === 403;
    const isRateLimited = status === 429;
    return (
      <Result
        status={isMappingError || isPermissionError ? '403' : isRateLimited ? 'warning' : '500'}
        title={isMappingError ? '统一账号尚未完成映射' : isPermissionError ? '当前账号无后台权限' : isRateLimited ? '请求过于频繁' : '综合管理服务暂时不可用'}
        subTitle={isMappingError
          ? (session.error.response?.data?.error || '请检查综合平台的统一登录账号映射配置。')
          : isPermissionError
            ? '请联系管理员确认账号状态和角色。'
          : isRateLimited
            ? '请稍后重试，当前会话不会因此退出。'
            : '无法确认当前账号状态，请检查网络或稍后重试。'}
        extra={[
          !isMappingError && <Button type="primary" key="retry" onClick={() => {
            setSession({ ready: false, authenticated: false, error: null });
            setSessionRetry((value) => value + 1);
          }}>重试</Button>,
          <Button key="home" onClick={() => { window.location.href = IS_PLATFORM_SSO ? '/console' : '/'; }}>返回管理中心</Button>,
        ].filter(Boolean)}
      />
    );
  }

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
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif"
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
      <AntApp component={false}>
        <FeedbackBinder />
        <ErrorBoundary homePath={IS_PLATFORM_SSO ? '/console' : '/'}>
          <Suspense fallback={<RouteFallback />}>
            <Router basename={APP_BASE_PATH || undefined}>
              <Routes>
                <Route path="/login" element={IS_PLATFORM_SSO || session.authenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
                <Route path="/query" element={<PublicQuery />} />
                <Route path="/" element={<PrivateRoute session={session}><MainLayout /></PrivateRoute>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="iot-monitor" element={<ExternalAppRedirect href="/apps/iot/" />} />
                  <Route path="air-energy" element={<AirEnergyMonitor />} />
                  <Route path="users" element={<Users />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="audit-logs" element={<AuditLogs />} />
                  <Route path="ct8-monitor" element={<PlatformViewRedirect view="automation" />} />
                  <Route path="course-orders" element={<CourseOrders />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
          </Suspense>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
