<template>
    <main class="login-page">
        <div class="login-aurora" aria-hidden="true">
            <span class="login-glow login-glow-a"></span>
            <span class="login-glow login-glow-b"></span>
        </div>

        <section class="login-panel" aria-labelledby="login-title">
            <header class="login-brand">
                <span class="login-brand-mark">
                    <img :src="faviconUrl" alt="好爱学习">
                </span>
                <span class="login-brand-copy">
                    <strong>好爱学习</strong>
                    <small>考试业务管理后台</small>
                </span>
                <button type="button" class="login-theme-toggle" :aria-pressed="isDarkTheme"
                    :aria-label="isDarkTheme ? '切换到浅色主题' : '切换到深色主题'"
                    :title="isDarkTheme ? '切换到浅色主题' : '切换到深色主题'" @click="handleThemeToggle">
                    <svg v-if="isDarkTheme" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6" />
                        <path
                            d="M12 3.2v2.1M12 18.7v2.1M4.2 12h2.1M17.7 12h2.1M6.5 6.5l1.5 1.5M16 16l1.5 1.5M17.5 6.5L16 8M8 16l-1.5 1.5"
                            stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" stroke="currentColor"
                            stroke-width="1.6" stroke-linejoin="round" />
                    </svg>
                </button>
            </header>

            <div class="login-heading">
                <h1 id="login-title">欢迎回来</h1>
                <p>请选择登录方式继续进入后台。</p>
            </div>

            <div class="login-methods" role="tablist" aria-label="登录方式">
                <button type="button" role="tab" class="login-method"
                    :class="{ active: activeTab === 'qrcode' }" :disabled="!scanLoginEnabled"
                    :aria-selected="activeTab === 'qrcode'" @click="switchTab('qrcode')">
                    <el-icon :size="17">
                        <FullScreen />
                    </el-icon>
                    <span>扫码登录</span>
                </button>
                <button type="button" role="tab" class="login-method"
                    :class="{ active: activeTab === 'account' }" :aria-selected="activeTab === 'account'"
                    @click="switchTab('account')">
                    <el-icon :size="17">
                        <User />
                    </el-icon>
                    <span>账号登录</span>
                </button>
            </div>

            <div class="login-body">
                <div v-show="activeTab === 'qrcode'" class="qr-pane" role="tabpanel" aria-label="扫码登录">
                    <div class="qr-well">
                        <div v-show="!qrError" ref="qrcodeEl" class="qrcode-container"></div>

                        <div v-if="qrError" class="qr-fallback" :class="`is-${qrFallback.tone}`">
                            <span class="qr-fallback-icon">
                                <el-icon :size="22">
                                    <component :is="qrFallback.icon" />
                                </el-icon>
                            </span>
                            <strong>{{ qrFallback.title }}</strong>
                            <p>{{ qrFallback.message }}</p>
                            <button type="button" class="btn btn-secondary btn-sm"
                                :disabled="!scanLoginEnabled" @click="initQrcode">
                                {{ qrFallback.buttonText }}
                            </button>
                        </div>
                    </div>

                    <p v-if="!qrError" class="qr-status" :class="qrStatusClass">
                        <el-icon v-if="qrStatusIcon" :size="14">
                            <component :is="qrStatusIcon" />
                        </el-icon>
                        <span>{{ qrStatusText }}</span>
                    </p>
                </div>

                <div v-show="activeTab === 'account'" class="account-pane" role="tabpanel" aria-label="账号登录">
                    <el-form ref="loginFormRef" :model="loginForm" :rules="rules" size="large" label-position="top"
                        hide-required-asterisk class="login-form" @keyup.enter="handleLogin">
                        <el-form-item prop="username" label="管理员账号">
                            <el-input v-model="loginForm.username" placeholder="请输入管理员用户名" prefix-icon="User"
                                autocomplete="username" />
                        </el-form-item>
                        <el-form-item prop="password" label="登录密码">
                            <el-input v-model="loginForm.password" type="password" placeholder="请输入密码"
                                prefix-icon="Lock" show-password autocomplete="current-password" />
                        </el-form-item>

                        <div v-if="aiCaptchaEnabled" id="account-login-captcha" class="ai-captcha-box"></div>
                        <button v-if="aiCaptchaEnabled" id="account-login-captcha-trigger" ref="captchaTriggerRef"
                            type="button" class="ai-captcha-trigger" aria-hidden="true" tabindex="-1"></button>

                        <button type="button" class="btn btn-primary login-submit" :disabled="loading"
                            @click="handleLogin">
                            <span v-if="loading" class="spin" aria-hidden="true"></span>
                            {{ loading ? '正在登录…' : '立即登录' }}
                        </button>
                    </el-form>

                    <p class="login-tip">个人用户建议使用微信扫码登录；账号密码登录仅供后台管理员使用。</p>
                </div>
            </div>
        </section>

        <footer class="login-footer">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">宁ICP备2025009338号-4</a>
        </footer>
    </main>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { session, loadRuntimeConfig } from '@/utils/session';
import {
    initAliyunAiCaptcha,
    isAiCaptchaConfigured,
    getCaptchaVerifyCode,
} from '@/utils/aliyunAiCaptcha';
import http from '@/utils/http';
import { fetchWithTimeout, resolveAppUrl } from '@/utils/runtime';
import { createSequentialPoller } from '@/utils/sequentialPoller';
import { getCurrentTheme, toggleTheme } from '@/utils/theme';

const router = useRouter();
const route = useRoute();
const faviconUrl = resolveAppUrl('/favicon.png');

const QR_TOKEN_KEY = 'manage_qr_token';
const QR_POLL_TOKEN_KEY = 'manage_qr_poll_token';
const ACCOUNT_CAPTCHA_ELEMENT = '#account-login-captcha';
const ACCOUNT_CAPTCHA_TRIGGER = '#account-login-captcha-trigger';
// 登录页独立布局：后台样式表里针对 html/body/#app 与 el-input 的全局规则会按这个类放过登录页
const AUTH_STANDALONE_CLASS = 'auth-standalone';

const loginCopy = {
    pageTitle: '好爱学习',
    qrHint: '请使用微信扫一扫，在手机上确认登录',
    qrEmptyState: '二维码加载失败，请刷新后重试。',
};

// --- 主题 ---
const isDarkTheme = ref(getCurrentTheme() === 'dark');

const handleThemeToggle = () => {
    isDarkTheme.value = toggleTheme() === 'dark';
};

function unwrapPayload(payload) {
    if (!payload) return {};
    return Object.prototype.hasOwnProperty.call(payload, 'data') ? (payload.data || {}) : payload;
}

function getPostLoginRoute() {
    const shareCode = String(route.query.shareCode || '').trim();
    return shareCode ? { path: '/', query: { shareCode } } : { path: '/' };
}

// --- 表单状态 ---
const activeTab = ref('qrcode');
const loading = ref(false);
const loginForm = reactive({ username: '', password: '' });
const loginFormRef = ref(null);
const captchaTriggerRef = ref(null);
const rules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};
const aiCaptchaEnabled = ref(false);
const aiCaptchaReady = ref(false);
let aiCaptchaConfig = { enabled: false, region: 'cn', prefix: '', sceneId: '' };
let aiCaptchaInstance = null;
let aiCaptchaInitPromise = null;
let accountLoginWaitingCaptcha = false;

// --- 二维码状态 ---
const qrcodeEl = ref(null);
const qrToken = ref('');
const pollToken = ref('');
const qrStatusText = ref('正在加载二维码...');
const qrStatusTone = ref('neutral');
const qrStatusIcon = ref('Loading');
const qrError = ref(false);
const qrFallback = reactive({
    title: '二维码暂不可用',
    message: loginCopy.qrEmptyState,
    buttonText: '重新获取',
    icon: 'WarningFilled',
    color: '#dc2626',
    tone: 'error',
});
const scanLoginEnabled = ref(false);
const qrStatusClass = computed(() => `is-${qrStatusTone.value}`);
let qrPoller = null;
let pollErrorCount = 0;
let qrCreateController = null;
let qrCreateSequence = 0;
let scanLoginConfig = { enabled: false, apiBase: '' };
let qrcodeModulePromise = null;

const loadQrcode = async () => {
    if (!qrcodeModulePromise) {
        qrcodeModulePromise = import('qrcode');
    }
    const module = await qrcodeModulePromise;
    return module.default || module;
};

const stopPolling = () => {
    qrPoller?.stop();
    qrPoller = null;
};

const stopQrCreation = () => {
    qrCreateSequence += 1;
    qrCreateController?.abort();
    qrCreateController = null;
};

const clearStoredTokens = () => {
    sessionStorage.removeItem(QR_TOKEN_KEY);
    sessionStorage.removeItem(QR_POLL_TOKEN_KEY);
};

const resetQrState = () => {
    qrError.value = false;
    qrStatusText.value = '正在加载二维码...';
    qrStatusTone.value = 'neutral';
    qrStatusIcon.value = 'Loading';
    pollErrorCount = 0;
};

const setQrFallback = ({ title, message, buttonText = '重新获取', icon = 'WarningFilled', color = '#dc2626', tone = 'error' }) => {
    stopPolling();
    Object.assign(qrFallback, { title, message, buttonText, icon, color, tone });
    qrError.value = true;
    qrStatusText.value = message;
    qrStatusTone.value = tone === 'notice' ? 'ready' : 'danger';
    qrStatusIcon.value = icon;
};

const setQrFailed = (message) => {
    setQrFallback({ title: '二维码暂不可用', message: message || loginCopy.qrEmptyState });
};

const setQrExpired = () => {
    setQrFallback({
        title: '二维码已过期',
        message: '为了保障账号安全，请刷新后使用新的二维码登录。',
        buttonText: '刷新二维码',
        icon: 'Refresh',
        color: '#0f766e',
        tone: 'notice',
    });
};

const setQrRetryNotice = () => {
    setQrFallback({
        title: '暂时无法确认二维码状态',
        message: '网络可能不稳定，请刷新二维码后重试。',
        buttonText: '刷新二维码',
        icon: 'Refresh',
        color: '#0f766e',
        tone: 'notice',
    });
};

const switchTab = (name) => {
    if (name === activeTab.value) return;
    if (name === 'qrcode' && !scanLoginEnabled.value) {
        ElMessage.warning('扫码登录暂未开启');
        return;
    }
    activeTab.value = name;
    if (name === 'qrcode') initQrcode();
    else {
        stopPolling();
        stopQrCreation();
        initAccountCaptcha();
    }
};

const initAccountCaptcha = async () => {
    if (!aiCaptchaEnabled.value) return null;
    if (aiCaptchaInitPromise) return aiCaptchaInitPromise;

    aiCaptchaReady.value = false;
    aiCaptchaInitPromise = nextTick()
        .then(() => initAliyunAiCaptcha(aiCaptchaConfig, {
            element: ACCOUNT_CAPTCHA_ELEMENT,
            button: ACCOUNT_CAPTCHA_TRIGGER,
            language: 'cn',
            server: ['captcha-esa-open.aliyuncs.com', 'captcha-esa-open-b.aliyuncs.com'],
            slideStyle: {
                width: 320,
                height: 40,
            },
            success: (captchaVerifyParam) => {
                submitAccountLoginWithCaptcha(captchaVerifyParam);
            },
            fail: (result) => {
                accountLoginWaitingCaptcha = false;
                console.error('Aliyun AI captcha failed', result);
            },
            getInstance: (instance) => {
                aiCaptchaInstance = instance;
                aiCaptchaReady.value = true;
            },
        }))
        .catch((error) => {
            aiCaptchaInitPromise = null;
            aiCaptchaReady.value = false;
            ElMessage.error(error.message || 'AI 验证码初始化失败');
            return null;
        });

    return aiCaptchaInitPromise;
};

const refreshAccountCaptcha = () => {
    try {
        aiCaptchaInstance?.refresh?.();
    } catch {
        // Captcha refresh failure should not block retry; the next click will re-use current instance.
    }
};

const validateLoginForm = async () => {
    if (!loginFormRef.value) return false;
    try {
        await loginFormRef.value.validate();
        return true;
    } catch {
        return false;
    }
};

const triggerAccountCaptcha = async () => {
    const captcha = await initAccountCaptcha();
    if (!captcha || !captchaTriggerRef.value) {
        ElMessage.error('AI 验证码暂不可用，请稍后重试');
        return;
    }

    accountLoginWaitingCaptcha = true;
    if (typeof captcha.show === 'function') {
        captcha.show();
        return;
    }
    captchaTriggerRef.value.click();
};

const handleWechatLogin = async (tempAuthCode) => {
    try {
        const res = await http.post(`${scanLoginConfig.apiBase}/auth/login`, { tempAuthCode });
        if (res.data.code !== 0) throw new Error(res.data.message || '登录失败');

        const data = unwrapPayload(res.data);
        const authType = data.authType === 'console' ? 'console' : 'admin';
        session.setAuth(data.token, data.user, authType, {
            cookieAuth: data.cookieAuth,
            expiresAt: data.expiresAt,
        });
        ElMessage.success('登录成功');
        setTimeout(() => router.push(getPostLoginRoute()), 500);
    } catch (error) {
        setQrFailed(error.response?.data?.message || error.message || '登录失败，请重新扫码');
    }
};

const startPolling = () => {
    stopPolling();
    qrPoller = createSequentialPoller(async (signal) => {
            const res = await fetchWithTimeout(
                `${scanLoginConfig.apiBase}/qrcode/status?qrToken=${encodeURIComponent(qrToken.value)}&pollToken=${encodeURIComponent(pollToken.value)}`,
                { cache: 'no-store', signal },
                8000,
            );
            const payload = await res.json();
            if (!res.ok || payload.code !== 0) throw new Error(payload.message || '二维码状态获取失败');

            pollErrorCount = 0;
            const data = unwrapPayload(payload);

            if (data.status === 'scanned') {
                qrStatusText.value = '已扫码，请在手机上确认';
                qrStatusTone.value = 'waiting';
                qrStatusIcon.value = 'Check';
            } else if (data.status === 'confirmed') {
                stopPolling();
                clearStoredTokens();
                qrStatusText.value = '验证成功，正在登录...';
                qrStatusTone.value = 'success';
                qrStatusIcon.value = 'CircleCheckFilled';
                await handleWechatLogin(data.tempAuthCode);
                return false;
            } else if (data.status === 'expired' || data.status === 'cancelled') {
                clearStoredTokens();
                setQrExpired();
                return false;
            }
            return true;
    }, {
        interval: 2000,
        onError: () => {
            pollErrorCount += 1;
            if (pollErrorCount >= 3) {
                clearStoredTokens();
                setQrRetryNotice();
                return false;
            }
            return true;
        },
    });
    qrPoller.start();
};

const initQrcode = async () => {
    stopQrCreation();
    stopPolling();
    if (!scanLoginEnabled.value) {
        setQrFailed('扫码登录未开启');
        return;
    }

    const requestSequence = qrCreateSequence;
    const controller = new AbortController();
    qrCreateController = controller;
    resetQrState();

    const el = qrcodeEl.value;
    if (el) el.innerHTML = '';

    const oldQrToken = sessionStorage.getItem(QR_TOKEN_KEY) || '';

    try {
        const requestBody = { intent: 'manage_login' };
        if (oldQrToken) requestBody.oldQrToken = oldQrToken;

        const res = await fetchWithTimeout(`${scanLoginConfig.apiBase}/qrcode/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });
        const payload = await res.json();
        if (controller.signal.aborted || requestSequence !== qrCreateSequence) return;
        if (!res.ok || payload.code !== 0) throw new Error(payload.message || '获取二维码失败');

        const data = unwrapPayload(payload);
        if (!data.qrToken || !data.pollToken) throw new Error('二维码数据不完整');

        qrToken.value = data.qrToken;
        pollToken.value = data.pollToken;
        sessionStorage.setItem(QR_TOKEN_KEY, data.qrToken);
        sessionStorage.setItem(QR_POLL_TOKEN_KEY, data.pollToken);

        if (el) {
            el.innerHTML = '';
            el.classList.toggle('is-wxacode', !!data.qrCodeImage);
            el.style.width = 'min(216px, 72vw)';
            el.style.minHeight = '0';
            el.style.aspectRatio = '1 / 1';
            if (data.qrCodeImage) {
                const image = document.createElement('img');
                image.src = data.qrCodeImage;
                image.alt = '微信扫码登录小程序码';
                image.style.width = 'min(184px, 100%)';
                image.style.height = 'auto';
                image.style.maxWidth = '100%';
                el.appendChild(image);
            } else {
                // 使用 npm 版 qrcode 库渲染普通二维码到 canvas。
                const QRCode = await loadQrcode();
                if (controller.signal.aborted || requestSequence !== qrCreateSequence) return;
                const qrText = data.qrCodeText || `miniprogram-login://scan?qrToken=${data.qrToken}`;
                const canvas = document.createElement('canvas');
                await QRCode.toCanvas(canvas, qrText, {
                    width: 184,
                    margin: 2,
                    color: { dark: '#111827', light: '#ffffff' },
                    errorCorrectionLevel: 'H',
                });
                if (controller.signal.aborted || requestSequence !== qrCreateSequence) return;
                canvas.style.width = 'min(184px, 100%)';
                canvas.style.height = 'auto';
                el.appendChild(canvas);
            }
        }

        qrStatusText.value = loginCopy.qrHint;
        qrStatusTone.value = 'ready';
        qrStatusIcon.value = 'FullScreen';
        startPolling();
    } catch (error) {
        if (controller.signal.aborted || requestSequence !== qrCreateSequence) return;
        setQrFailed(error.message || '二维码获取失败');
    } finally {
        if (qrCreateController === controller) {
            qrCreateController = null;
        }
    }
};

const submitAccountLogin = async (captchaVerifyParam = '') => {
    loading.value = true;
    try {
        const config = {};
        if (aiCaptchaEnabled.value) {
            config.headers = { 'captcha-verify-param': captchaVerifyParam };
        }

        const res = await http.post('/api/admin/login', loginForm, config);
        const captchaVerifyCode = getCaptchaVerifyCode(res.headers);
        if (aiCaptchaEnabled.value && captchaVerifyCode && captchaVerifyCode !== 'T001') {
            const code = captchaVerifyCode || '未返回';
            ElMessage.error(`AI 验证未通过，请重试（${code}）`);
            return;
        }

        if (res.data.code !== 0) {
            ElMessage.error(res.data.message || '登录失败');
            return;
        }
        const data = unwrapPayload(res.data);
        session.setAuth(data.token, data.user, 'admin', {
            cookieAuth: data.cookieAuth,
            expiresAt: data.expiresAt,
        });
        ElMessage.success('欢迎回来');
        setTimeout(() => router.push(getPostLoginRoute()), 500);
    } catch (error) {
        ElMessage.error(error.response?.data?.message || '服务连接失败');
    } finally {
        refreshAccountCaptcha();
        loading.value = false;
    }
};

const submitAccountLoginWithCaptcha = async (captchaVerifyParam) => {
    if (!accountLoginWaitingCaptcha) return;
    accountLoginWaitingCaptcha = false;

    if (!captchaVerifyParam) {
        ElMessage.error('AI 验证结果为空，请重试');
        refreshAccountCaptcha();
        return;
    }

    await submitAccountLogin(captchaVerifyParam);
};

const handleLogin = async () => {
    if (loading.value) return;
    const valid = await validateLoginForm();
    if (!valid) return;

    if (aiCaptchaEnabled.value) {
        await triggerAccountCaptcha();
        return;
    }

    await submitAccountLogin();
};

// 系统主题变化时同步开关图标（手动选择过主题时 theme.js 不会跟随）
const themeQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
const syncThemeIcon = () => {
    isDarkTheme.value = getCurrentTheme() === 'dark';
};

onMounted(async () => {
    document.title = loginCopy.pageTitle;
    document.documentElement.classList.add(AUTH_STANDALONE_CLASS);
    syncThemeIcon();
    themeQuery?.addEventListener?.('change', syncThemeIcon);

    const runtimeConfig = await loadRuntimeConfig();
    scanLoginConfig = runtimeConfig.scanLogin || scanLoginConfig;
    scanLoginEnabled.value = !!scanLoginConfig.enabled && !!scanLoginConfig.apiBase;
    aiCaptchaConfig = runtimeConfig.aiCaptcha || aiCaptchaConfig;
    aiCaptchaEnabled.value = isAiCaptchaConfigured(aiCaptchaConfig);
    if (aiCaptchaEnabled.value) initAccountCaptcha();

    if (scanLoginEnabled.value) {
        activeTab.value = 'qrcode';
        initQrcode();
    } else {
        activeTab.value = 'account';
        setQrFailed('扫码登录未开启');
    }
});

onUnmounted(() => {
    stopPolling();
    stopQrCreation();
    themeQuery?.removeEventListener?.('change', syncThemeIcon);
    document.documentElement.classList.remove(AUTH_STANDALONE_CLASS);
});
</script>

<style>
@import "@my-platform/pearl-tokens/tokens.css";
@import "@my-platform/pearl-tokens/components.css";

/* ==========================================================================
   登录页 · 珍珠玻璃
   单列认证卡片：品牌头 + 登录方式分段 + 扫码 / 账号两种面板。
   深浅主题由 <html data-theme> 驱动（见 utils/theme.js），此处不写死颜色。
   ========================================================================== */

.login-page {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    padding: clamp(24px, 6vh, 60px) 20px 20px;
    background: var(--canvas);
    color: var(--ink);
    overflow-x: hidden;
    isolation: isolate;
}

/* ── 背景光晕 ─────────────────────────────────────────────────── */
.login-aurora {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
}

.login-glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(4px);
}

.login-glow-a {
    top: -220px;
    right: -170px;
    width: 560px;
    height: 560px;
    background: radial-gradient(circle, var(--blue-soft) 0%, transparent 68%);
    animation: login-drift 22s ease-in-out infinite;
}

.login-glow-b {
    bottom: -240px;
    left: -190px;
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, var(--lime-soft) 0%, transparent 68%);
    animation: login-drift 27s ease-in-out infinite reverse;
}

@keyframes login-drift {
    0%,
    100% {
        transform: translate3d(0, 0, 0) scale(1);
    }

    50% {
        transform: translate3d(-26px, 24px, 0) scale(1.06);
    }
}

/* ── 主题开关 ─────────────────────────────────────────────────── */
.login-theme-toggle {
    display: grid;
    flex: none;
    width: 30px;
    height: 30px;
    margin-left: auto;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
    transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.login-theme-toggle:hover {
    border-color: var(--line-strong);
    background: var(--hover-bg);
    color: var(--ink);
}

.login-theme-toggle:active {
    transform: scale(0.96);
}

.login-theme-toggle:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
}

.login-theme-toggle svg {
    width: 16px;
    height: 16px;
}

/* ── 认证卡片 ─────────────────────────────────────────────────── */
.login-panel {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    margin: auto auto 0;
    padding: 28px 28px 24px;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-xl);
    background: var(--surface);
    box-shadow: var(--edge), var(--e2);
    backdrop-filter: blur(18px) saturate(1.18);
    -webkit-backdrop-filter: blur(18px) saturate(1.18);
}

.login-brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
}

.login-brand-mark {
    display: grid;
    flex: none;
    width: 42px;
    height: 42px;
    place-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 13px;
    background: var(--surface-solid);
    box-shadow: var(--edge), var(--e1);
}

.login-brand-mark img {
    width: 30px;
    height: 30px;
    object-fit: contain;
}

.login-brand-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
}

.login-brand-copy strong {
    color: var(--ink);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
}

.login-brand-copy small {
    color: var(--ink-faint);
    font-size: 11px;
    letter-spacing: 0.04em;
}

.login-heading {
    margin: 22px 0 16px;
}

.login-heading h1 {
    margin: 0 0 5px;
    color: var(--ink);
    font-size: 22px;
    font-weight: 720;
    letter-spacing: -0.025em;
}

.login-heading p {
    margin: 0;
    color: var(--ink-muted);
    font-size: 12.5px;
    line-height: 1.55;
}

/* ── 登录方式：凹槽分段 ───────────────────────────────────────── */
.login-methods {
    display: grid;
    gap: 3px;
    padding: 3px;
    border-radius: var(--r-sm);
    background: var(--groove-bg);
    box-shadow: var(--groove-inset);
    grid-template-columns: 1fr 1fr;
}

.login-method {
    display: inline-flex;
    height: 36px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.login-method:hover:not(:disabled) {
    color: var(--ink);
}

.login-method.active {
    background: var(--surface);
    box-shadow: var(--edge), var(--e1);
    color: var(--ink);
}

.login-method:disabled {
    cursor: not-allowed;
    opacity: 0.42;
}

.login-method:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
}

/* ── 面板 ─────────────────────────────────────────────────────── */
.login-body {
    margin-top: 18px;
}

.qr-pane,
.account-pane {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.qr-well {
    display: grid;
    min-height: 226px;
    padding: 13px;
    place-items: center;
    border-radius: var(--r-md);
    background: var(--groove-bg);
    box-shadow: var(--groove-inset);
}

/* 二维码底色必须保持白色，深浅主题都一样，否则扫不出来 */
.qrcode-container {
    display: grid;
    padding: 10px;
    place-items: center;
    border-radius: var(--r-sm);
    background: #fff;
    box-shadow: var(--e1);
}

.qrcode-container img,
.qrcode-container canvas {
    display: block;
    max-width: 100%;
    height: auto;
}

.qr-status {
    display: flex;
    min-height: 20px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0;
    color: var(--ink-muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
}

.qr-status.is-ready {
    color: var(--blue);
}

.qr-status.is-waiting {
    color: var(--amber);
}

.qr-status.is-success {
    color: var(--leaf-text);
}

.qr-status.is-danger {
    color: var(--red-text);
}

/* ── 二维码兜底态 ─────────────────────────────────────────────── */
.qr-fallback {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 7px;
    padding: 16px 10px;
    text-align: center;
}

.qr-fallback-icon {
    display: grid;
    width: 44px;
    height: 44px;
    margin-bottom: 3px;
    place-items: center;
    border-radius: 14px;
    background: var(--red-soft);
    color: var(--red-text);
}

.qr-fallback.is-notice .qr-fallback-icon {
    background: var(--blue-soft);
    color: var(--blue);
}

.qr-fallback strong {
    color: var(--ink);
    font-size: 13.5px;
    font-weight: 650;
}

.qr-fallback p {
    max-width: 244px;
    margin: 0;
    color: var(--ink-muted);
    font-size: 12px;
    line-height: 1.65;
}

.qr-fallback .btn {
    height: 32px;
    margin-top: 6px;
    padding: 0 14px;
    border-color: var(--line-strong);
    background: var(--surface-solid);
    box-shadow: var(--e1);
    color: var(--ink);
    cursor: pointer;
}

.qr-fallback .btn:hover:not(:disabled) {
    border-color: rgba(var(--shade), 0.22);
    box-shadow: var(--e2);
}

/* ── 账号表单 ─────────────────────────────────────────────────── */
.login-form .el-form-item {
    margin-bottom: 15px;
}

.login-form .el-form-item__label {
    padding: 0 0 6px;
    color: var(--ink-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
}

.login-form .el-form-item__content {
    line-height: normal;
}

.login-form .el-input__wrapper {
    height: 42px;
    padding: 0 13px;
    border-radius: var(--r-sm);
    background: var(--input-bg);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition: box-shadow 0.16s ease, background 0.16s ease;
}

.login-form .el-input__wrapper:hover {
    box-shadow: inset 0 0 0 1px rgba(var(--shade), 0.2);
}

.login-form .el-input__wrapper.is-focus {
    background: var(--surface-solid);
    box-shadow: inset 0 0 0 1px var(--blue), 0 0 0 3px var(--blue-soft);
}

.login-form .el-form-item.is-error .el-input__wrapper {
    box-shadow: inset 0 0 0 1px var(--red);
}

.login-form .el-input__inner {
    height: 40px;
    color: var(--ink);
    font-size: 13.5px;
}

.login-form .el-input__inner::placeholder {
    color: var(--ink-faint);
}

.login-form .el-input__prefix,
.login-form .el-input__suffix {
    color: var(--ink-faint);
}

.login-form .el-form-item__error {
    position: static;
    padding-top: 5px;
    color: var(--red-text);
    font-size: 11.5px;
    line-height: 1.4;
}

.login-submit.btn {
    width: 100%;
    height: 44px;
    margin-top: 3px;
    border-radius: var(--r-sm);
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 650;
}

.login-submit .spin {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.42);
    border-radius: 50%;
    border-top-color: #fff;
}

.login-tip {
    margin: 0;
    color: var(--ink-soft);
    font-size: 11.5px;
    line-height: 1.6;
}

/* 阿里云验证码挂载点 */
.ai-captcha-box {
    position: relative;
}

.ai-captcha-box:empty {
    display: none;
}

.ai-captcha-trigger {
    position: absolute;
    width: 0;
    height: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
}

/* ── 页脚 ─────────────────────────────────────────────────────── */
.login-footer {
    position: relative;
    z-index: 1;
    margin: 18px 0 auto;
    color: var(--ink-faint);
    font-size: 11px;
    text-align: center;
}

.login-footer a {
    color: inherit;
    text-decoration: none;
    transition: color 0.16s ease;
}

.login-footer a:hover {
    color: var(--ink-muted);
}

.login-footer a:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--focus);
    outline-offset: 2px;
}

/* ── 断点 ─────────────────────────────────────────────────────── */
@media (max-width: 480px) {
    .login-page {
        padding: 18px 16px 16px;
    }

    .login-panel {
        padding: 22px 18px 18px;
        border-radius: var(--r-lg);
    }

    .login-heading {
        margin: 18px 0 14px;
    }

    .login-heading h1 {
        font-size: 20px;
    }

    .qr-well {
        min-height: 218px;
        padding: 11px;
    }
}

@media (max-height: 660px) {
    .login-page {
        padding-top: 14px;
        padding-bottom: 12px;
    }

    .login-heading {
        margin: 14px 0 12px;
    }

    .qr-well {
        min-height: 204px;
    }
}
</style>
