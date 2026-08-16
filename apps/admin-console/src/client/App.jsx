import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { requestJson } from './api.js';
import {
  LoadingScreen,
  SessionUnavailableScreen,
  ViewLoadingFallback,
  ViewModuleBoundary,
} from './shared.jsx';
import { LoginScreen } from './Login.jsx';
import { Dashboard } from './Dashboard.jsx';

const PublicStatusView = lazy(() => import('./PlatformControlViews.jsx').then((module) => ({ default: module.PublicStatusView })));

function AuthenticatedApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  const finishAuthentication = useCallback((nextSession) => {
    setSession(nextSession);
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '';
    if (nextSession?.authenticated && /^(?:\/apps\/(?:core|exam|campus|iot)(?:\/|$)|\/oauth\/(?:authorize|external-launch)(?:\/|\?|$))/.test(returnTo)) {
      window.location.replace(returnTo);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    setSessionError(null);
    try {
      finishAuthentication(await requestJson('/api/auth/status'));
    } catch (error) {
      if (error.status === 401) {
        setSession({ authenticated: false, authDisabled: false, user: null });
      } else {
        setSessionError(error);
      }
    } finally {
      setCheckingSession(false);
    }
  }, [finishAuthentication]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (checkingSession) return <LoadingScreen />;
  if (sessionError) return <SessionUnavailableScreen error={sessionError} onRetry={checkSession} retrying={checkingSession} />;
  if (!session?.authenticated) return <LoginScreen onAuthenticated={finishAuthentication} totpRequired={session?.totpRequired} />;
  return <Dashboard session={session} onLogout={() => setSession({ authenticated: false, authDisabled: false, totpRequired: Boolean(session.user?.totpEnabled), user: null })} />;
}

export default function App() {
  if (window.location.pathname === '/status') {
    return <ViewModuleBoundary><Suspense fallback={<ViewLoadingFallback />}><PublicStatusView /></Suspense></ViewModuleBoundary>;
  }
  return <AuthenticatedApp />;
}
