import { createPlatformBrowserRuntime } from '@my-platform/platform-browser-runtime';

const runtime = createPlatformBrowserRuntime({ appName: 'exam' });

export const {
    API_BASE_PATH,
    APP_BASE_PATH,
    IS_PLATFORM_SSO,
    fetchWithTimeout,
    installExperienceMonitoring,
    logoutPlatformSession,
    reportExperience,
    redirectToPlatformLogin,
    resolveAppUrl,
    stripAppBase,
} = runtime;
