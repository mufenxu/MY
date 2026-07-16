import { createApp } from 'vue';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/loading/style/css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router, { preloadDashboardView } from './router';
import { setupHttpInterceptors } from './utils/setupHttp';
import './assets/css/interaction-polish.css';
import { IS_PLATFORM_SSO, redirectToPlatformLogin, resolveAppUrl } from './utils/runtime';
import { session } from './utils/session';

async function bootstrapPlatformSession() {
    if (!IS_PLATFORM_SSO) return;
    const response = await fetch(resolveAppUrl('/api/admin/me'), {
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

async function startApplication() {
    if (IS_PLATFORM_SSO) {
        await Promise.all([
            bootstrapPlatformSession(),
            preloadDashboardView(),
        ]);
    }
    setupHttpInterceptors();

    const app = createApp(App);

    // Icon strings are used across old templates, so icons stay globally available.
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
        app.component(key, component);
    }

    app.use(router);
    app.mount('#app');
}

startApplication().catch((error) => {
    if (IS_PLATFORM_SSO && !document.querySelector('#platform-sso-error')) {
        document.getElementById('app').innerHTML = `
            <main id="platform-sso-error" style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fa;font-family:system-ui,sans-serif">
                <section style="max-width:560px;text-align:center">
                    <h1 style="font-size:22px;color:#1f2937">无法进入考试管理后台</h1>
                    <p style="color:#64748b;line-height:1.7">${String(error.message || '统一登录初始化失败。').replace(/[<>&"]/g, '')}</p>
                    <a href="/" style="display:inline-block;margin-top:12px;color:#2563eb">返回管理中心</a>
                </section>
            </main>`;
    }
});
