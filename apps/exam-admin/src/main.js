import { createApp } from 'vue';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/loading/style/css';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ChatDotRound,
    Check,
    CircleCheck,
    CircleCheckFilled,
    Close,
    Collection,
    CopyDocument,
    DataAnalysis,
    DataLine,
    Delete,
    Document,
    DocumentAdd,
    Download,
    Edit,
    EditPen,
    Files,
    FullScreen,
    Folder,
    Grid,
    Key,
    Link,
    List,
    Loading,
    Location,
    Lock,
    MagicStick,
    Plus,
    Refresh,
    Search,
    Share,
    SuccessFilled,
    SwitchButton,
    TrendCharts,
    Trophy,
    Upload,
    User,
    Warning,
    WarningFilled,
} from '@element-plus/icons-vue';
import App from './App.vue';
import router, { preloadDashboardView } from './router';
import { setupHttpInterceptors } from './utils/setupHttp';
import './assets/css/interaction-polish.css';
import { fetchWithTimeout, IS_PLATFORM_SSO, redirectToPlatformLogin, resolveAppUrl } from './utils/runtime';
import { session } from './utils/session';

const icons = {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ChatDotRound,
    Check,
    CircleCheck,
    CircleCheckFilled,
    Close,
    Collection,
    CopyDocument,
    DataAnalysis,
    DataLine,
    Delete,
    Document,
    DocumentAdd,
    Download,
    Edit,
    EditPen,
    Files,
    FullScreen,
    Folder,
    Grid,
    Key,
    Link,
    List,
    Loading,
    Location,
    Lock,
    MagicStick,
    Plus,
    Refresh,
    Search,
    Share,
    SuccessFilled,
    SwitchButton,
    TrendCharts,
    Trophy,
    Upload,
    User,
    Warning,
    WarningFilled,
};

async function bootstrapPlatformSession() {
    if (!IS_PLATFORM_SSO) return;
    const response = await fetchWithTimeout(resolveAppUrl('/api/admin/me'), {
        credentials: 'same-origin',
        cache: 'no-store',
    });
    if (response.status === 401) {
        redirectToPlatformLogin();
        throw new Error('统一登录会话已失效。');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || '统一管理员未映射到考试平台管理员账号。');
    }
    session.enablePlatformSso(payload.data);
}

function scheduleDashboardPreload() {
    const preload = () => {
        preloadDashboardView().catch(() => {});
    };

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(preload, { timeout: 1500 });
        return;
    }

    window.setTimeout(preload, 0);
}

async function startApplication() {
    if (IS_PLATFORM_SSO) {
        await Promise.all([
            bootstrapPlatformSession(),
            preloadDashboardView(),
        ]);
    }
    setupHttpInterceptors();

    const app = createApp(App);

    // Legacy templates use icon names as strings; register only icons they reference.
    for (const [key, component] of Object.entries(icons)) {
        app.component(key, component);
    }

    app.use(router);
    app.mount('#app');

    if (!IS_PLATFORM_SSO) {
        scheduleDashboardPreload();
    }
}

startApplication().catch((error) => {
    const root = document.getElementById('app');
    if (!root || document.querySelector('#platform-sso-error')) return;
    const main = document.createElement('main');
    main.id = 'platform-sso-error';
    main.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fa;font-family:system-ui,sans-serif';
    const panel = document.createElement('section');
    panel.style.cssText = 'max-width:560px;text-align:center';
    const title = document.createElement('h1');
    title.textContent = '无法进入考试管理后台';
    title.style.cssText = 'font-size:22px;color:#1f2937';
    const detail = document.createElement('p');
    detail.textContent = String(error.message || '应用初始化失败，请稍后重试。');
    detail.style.cssText = 'color:#64748b;line-height:1.7';
    const link = document.createElement('a');
    link.href = IS_PLATFORM_SSO ? '/console' : window.location.href;
    link.textContent = IS_PLATFORM_SSO ? '返回管理中心' : '重新加载';
    link.style.cssText = 'display:inline-block;margin-top:12px;color:#2563eb';
    panel.append(title, detail, link);
    main.append(panel);
    root.replaceChildren(main);
});
