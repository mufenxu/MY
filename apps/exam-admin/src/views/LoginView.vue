<template>
    <div class="login-page">
        <div class="shell">
            <section class="hero">
                <div class="brand-mark">
                    <img :src="faviconUrl" alt="好爱学习">
                </div>
                <div class="hero-badge">{{ loginCopy.heroBadge }}</div>
                <h1>{{ loginCopy.heroTitle }}</h1>
                <p>{{ loginCopy.heroDescription }}</p>

                <div class="hero-meta">
                    <span>题库管理</span>
                    <span>考试数据</span>
                    <span>安全访问</span>
                </div>

                <div class="mini-program-card">
                    <div class="mini-program-code">
                        <img :src="miniProgramCodeUrl" alt="好爱学习小程序码">
                    </div>
                    <div class="mini-program-copy">
                        <strong>好爱学习小程序</strong>
                        <span>首次使用请先完成小程序登录，微信扫码后会进入确认页。</span>
                    </div>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <h2>{{ loginCopy.panelTitle }}</h2>
                    <p>{{ loginCopy.panelSubtitle }}</p>
                </div>

                <div class="auth-tabs" role="tablist" aria-label="登录方式">
                    <button type="button" class="auth-tab"
                        :class="{ active: activeTab === 'qrcode', disabled: !scanLoginEnabled }"
                        :disabled="!scanLoginEnabled"
                        :aria-selected="activeTab === 'qrcode'"
                        @click="switchTab('qrcode')">
                        <span class="auth-tab-icon">
                            <el-icon :size="20"><component is="FullScreen" /></el-icon>
                        </span>
                        <span class="auth-tab-copy">
                            <strong>{{ loginCopy.qrTab }}</strong>
                            <small>微信扫码，小程序确认</small>
                        </span>
                        <span class="auth-tab-state"></span>
                    </button>
                    <button type="button" class="auth-tab" :class="{ active: activeTab === 'account' }"
                        :aria-selected="activeTab === 'account'"
                        @click="switchTab('account')">
                        <span class="auth-tab-icon">
                            <el-icon :size="20"><component is="User" /></el-icon>
                        </span>
                        <span class="auth-tab-copy">
                            <strong>{{ loginCopy.accountTab }}</strong>
                            <small>使用管理员账号进入</small>
                        </span>
                        <span class="auth-tab-state"></span>
                    </button>
                </div>

                <div class="panel-body">
                    <div v-show="activeTab === 'qrcode'" class="qr-pane">
                        <div class="qr-card">
                            <div v-show="!qrError" ref="qrcodeEl" class="qrcode-container"></div>
                            <div v-if="qrError" class="qr-fallback" :class="qrFallback.tone">
                                <div class="qr-fallback-icon">
                                    <el-icon :color="qrFallback.color" size="34">
                                        <component :is="qrFallback.icon" />
                                    </el-icon>
                                </div>
                                <h3>{{ qrFallback.title }}</h3>
                                <p>{{ qrFallback.message }}</p>
                                <el-button type="primary" class="qr-refresh-btn"
                                    :disabled="!scanLoginEnabled" @click="initQrcode">
                                    {{ qrFallback.buttonText }}
                                </el-button>
                            </div>

                            <div v-show="!qrError" class="qr-status" :class="qrStatusClass">
                                <el-icon v-if="qrStatusIcon" :size="16">
                                    <component :is="qrStatusIcon" />
                                </el-icon>
                                <span>{{ qrStatusText }}</span>
                            </div>
                        </div>
                    </div>

                    <div v-show="activeTab === 'account'" class="account-pane">
                        <div class="login-tip">
                            个人用户可使用微信扫一扫扫码登录，更安全；账号密码登录仅供后台管理员使用。
                        </div>
                        <el-form :model="loginForm" :rules="rules" ref="loginFormRef" size="large"
                            @keyup.enter="handleLogin">
                            <el-form-item prop="username">
                                <el-input v-model="loginForm.username" placeholder="请输入管理员用户名"
                                    prefix-icon="User" />
                            </el-form-item>
                            <el-form-item prop="password">
                                <el-input v-model="loginForm.password" type="password" placeholder="请输入密码"
                                    prefix-icon="Lock" show-password />
                            </el-form-item>
                            <div v-if="aiCaptchaEnabled" id="account-login-captcha" class="ai-captcha-box"></div>
                            <button
                                v-if="aiCaptchaEnabled"
                                id="account-login-captcha-trigger"
                                ref="captchaTriggerRef"
                                type="button"
                                class="ai-captcha-trigger"
                                aria-hidden="true"
                                tabindex="-1"
                            ></button>
                            <el-button type="primary" :loading="loading" class="submit-btn"
                                @click="handleLogin">立即登录</el-button>
                        </el-form>
                    </div>
                </div>
            </section>
        </div>
        <footer class="icp-footer" aria-label="ICP备案信息">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
                宁ICP备2025009338号-4
            </a>
        </footer>
    </div>
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
import { resolveAppUrl } from '@/utils/runtime';

const router = useRouter();
const route = useRoute();
const faviconUrl = resolveAppUrl('/favicon.png');
const miniProgramCodeUrl = resolveAppUrl('/assets/haoai-miniprogram-code.jpg');

const QR_TOKEN_KEY = 'manage_qr_token';
const QR_POLL_TOKEN_KEY = 'manage_qr_poll_token';
const ACCOUNT_CAPTCHA_ELEMENT = '#account-login-captcha';
const ACCOUNT_CAPTCHA_TRIGGER = '#account-login-captcha-trigger';

const loginCopy = {
    pageTitle: '好爱学习',
    heroBadge: '好爱学习',
    heroTitle: '好爱学习',
    heroDescription: '集中管理题库内容、考试数据与学习运营，让日常维护更清晰高效。',
    panelTitle: '欢迎回来',
    panelSubtitle: '请选择登录方式继续进入后台。',
    qrHint: '请使用微信扫一扫扫码登录',
    qrEmptyState: '二维码加载失败，请刷新后重试。',
    accountTab: '账号登录',
    qrTab: '扫码登录',
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
let qrTimer = null;
let pollErrorCount = 0;
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
    if (qrTimer) clearInterval(qrTimer);
    qrTimer = null;
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
    qrTimer = setInterval(async () => {
        try {
            const res = await fetch(
                `${scanLoginConfig.apiBase}/qrcode/status?qrToken=${encodeURIComponent(qrToken.value)}&pollToken=${encodeURIComponent(pollToken.value)}`,
                { cache: 'no-store' },
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
            } else if (data.status === 'expired' || data.status === 'cancelled') {
                clearStoredTokens();
                setQrExpired();
            }
        } catch {
            pollErrorCount += 1;
            if (pollErrorCount >= 3) {
                clearStoredTokens();
                setQrRetryNotice();
            }
        }
    }, 2000);
};

const initQrcode = async () => {
    stopPolling();
    if (!scanLoginEnabled.value) {
        setQrFailed('扫码登录未开启');
        return;
    }
    resetQrState();

    const el = qrcodeEl.value;
    if (el) el.innerHTML = '';

    const oldQrToken = sessionStorage.getItem(QR_TOKEN_KEY) || '';

    try {
        const requestBody = { intent: 'manage_login' };
        if (oldQrToken) requestBody.oldQrToken = oldQrToken;

        const res = await fetch(`${scanLoginConfig.apiBase}/qrcode/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        const payload = await res.json();
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
            el.style.width = 'min(232px, 72vw)';
            el.style.minHeight = '0';
            el.style.aspectRatio = '1 / 1';
            if (data.qrCodeImage) {
                const image = document.createElement('img');
                image.src = data.qrCodeImage;
                image.alt = '微信扫码登录小程序码';
                image.style.width = 'min(200px, 100%)';
                image.style.height = 'auto';
                image.style.maxWidth = '100%';
                el.appendChild(image);
            } else {
                // 使用 npm 版 qrcode 库渲染普通二维码到 canvas。
                const QRCode = await loadQrcode();
                const qrText = data.qrCodeText || `miniprogram-login://scan?qrToken=${data.qrToken}`;
                const canvas = document.createElement('canvas');
                await QRCode.toCanvas(canvas, qrText, {
                    width: 200,
                    margin: 2,
                    color: { dark: '#111827', light: '#ffffff' },
                    errorCorrectionLevel: 'H',
                });
                canvas.style.width = 'min(200px, 100%)';
                canvas.style.height = 'auto';
                el.appendChild(canvas);
            }
        }

        qrStatusText.value = loginCopy.qrHint;
        qrStatusTone.value = 'ready';
        qrStatusIcon.value = 'FullScreen';
        startPolling();
    } catch (error) {
        setQrFailed(error.message || '二维码获取失败');
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

onMounted(async () => {
    document.title = loginCopy.pageTitle;
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

onUnmounted(stopPolling);
</script>

<style scoped>

.login-page {
    --surface: #ffffff;
    --background: #f3f8fb;
    --text-main: #182536;
    --text-soft: #344960;
    --text-muted: #6a7b8e;
    --border: #d8e5ef;
    --primary: #1f7ae0;
    --primary-strong: #1764bd;
    --primary-soft: rgba(31, 122, 224, 0.11);
    --accent: #10a98a;
    --accent-soft: rgba(16, 169, 138, 0.14);
    --warm: #f3a33b;
    min-height: 100vh;
    padding: 24px;
    display: grid;
    grid-template-rows: auto auto;
    align-content: center;
    justify-items: center;
    gap: 14px;
    font-family: 'Manrope', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    background:
        linear-gradient(rgba(31, 122, 224, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(16, 169, 138, 0.045) 1px, transparent 1px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.58)),
        linear-gradient(120deg, rgba(218, 244, 255, 0.86) 0%, rgba(244, 255, 241, 0.72) 42%, rgba(255, 247, 232, 0.76) 100%);
    background-size: 32px 32px, 32px 32px, auto, auto;
    background-position: -1px -1px, -1px -1px, 0 0, 0 0;
    color: var(--text-main);
}

.icp-footer {
    width: min(1160px, 100%);
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.6;
}

.icp-footer a {
    color: inherit;
    text-decoration: none;
}

.icp-footer a:hover,
.icp-footer a:focus-visible {
    color: var(--primary);
    text-decoration: underline;
}

.shell {
    width: min(1160px, 100%);
    display: grid;
    grid-template-columns: 0.95fr 1.05fr;
    border: 1px solid rgba(216, 229, 239, 0.9);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 24px 70px rgba(50, 72, 94, 0.14);
}

/* --- Hero Section --- */
.hero {
    position: relative;
    overflow: hidden;
    padding: 52px 56px;
    color: var(--text-main);
    background:
        linear-gradient(135deg, rgba(224, 246, 255, 0.96) 0%, rgba(237, 255, 248, 0.94) 54%, rgba(255, 248, 235, 0.96) 100%);
    border-right: 1px solid rgba(216, 229, 239, 0.8);
}

.hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
        linear-gradient(rgba(31, 122, 224, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(16, 169, 138, 0.052) 1px, transparent 1px);
    background-size: 30px 30px;
    pointer-events: none;
}

.brand-mark {
    position: relative;
    width: 74px;
    height: 74px;
    margin-bottom: 26px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #ffffff;
    border: 1px solid rgba(216, 229, 239, 0.9);
    box-shadow: 0 14px 28px rgba(50, 72, 94, 0.12);
}

.brand-mark img {
    width: 100%;
    height: 100%;
    display: block;
}

.hero-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 9px 15px;
    border-radius: 999px;
    border: 1px solid rgba(31, 122, 224, 0.16);
    background: rgba(255, 255, 255, 0.72);
    color: #13756b;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0;
    box-shadow: 0 10px 22px rgba(50, 72, 94, 0.08);
}

.hero h1 {
    position: relative;
    margin: 28px 0 18px;
    font-size: 44px;
    line-height: 1.12;
    color: #14273c;
}

.hero p {
    position: relative;
    margin: 0;
    max-width: 540px;
    font-size: 16px;
    line-height: 1.85;
    color: var(--text-soft);
}

.hero-meta {
    position: relative;
    margin-top: 44px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: var(--text-soft);
    font-size: 13px;
}

.hero-meta span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.66);
    border: 1px solid rgba(216, 229, 239, 0.8);
}

.hero-meta span::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
}

.mini-program-card {
    position: relative;
    width: min(430px, 100%);
    margin-top: 36px;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid rgba(216, 229, 239, 0.9);
    background: rgba(255, 255, 255, 0.76);
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 18px 38px rgba(50, 72, 94, 0.1);
}

.mini-program-code {
    width: 104px;
    height: 104px;
    flex: 0 0 auto;
    padding: 8px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid rgba(216, 229, 239, 0.8);
}

.mini-program-code img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    border-radius: 6px;
}

.mini-program-copy strong {
    display: block;
    margin-bottom: 6px;
    font-size: 16px;
    line-height: 1.4;
}

.mini-program-copy span {
    display: block;
    color: var(--text-soft);
    font-size: 13px;
    line-height: 1.65;
}

/* --- Panel Section --- */
.panel {
    padding: 48px 54px 42px;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 253, 255, 0.96));
}

.panel-header h2 {
    margin: 0 0 10px;
    font-size: 32px;
    letter-spacing: 0;
    color: #152235;
}

.panel-header p {
    margin: 0 0 24px;
    color: var(--text-muted);
    line-height: 1.7;
}

.auth-tabs {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 28px;
}

.auth-tab {
    position: relative;
    min-height: 78px;
    padding: 14px 15px;
    border-radius: 8px;
    border: 1px solid rgba(199, 216, 229, 0.94);
    background: linear-gradient(180deg, #ffffff 0%, #f8fbfe 100%);
    color: var(--text-soft);
    text-align: left;
    font-weight: 800;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 10px 24px rgba(50, 72, 94, 0.07);
    transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.auth-tab:hover {
    border-color: rgba(31, 122, 224, 0.34);
    box-shadow: 0 14px 30px rgba(50, 72, 94, 0.1);
}

.auth-tab.active {
    border-color: rgba(31, 122, 224, 0.62);
    background: linear-gradient(180deg, #f7fbff 0%, #ffffff 100%);
    color: var(--primary);
    box-shadow: 0 14px 32px rgba(31, 122, 224, 0.16);
    transform: translateY(-1px);
}

.auth-tab.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
}

.auth-tab.disabled:hover {
    border-color: rgba(199, 216, 229, 0.94);
    transform: none;
}

.auth-tab-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: #eef6ff;
    color: var(--primary);
    border: 1px solid rgba(31, 122, 224, 0.12);
}

.auth-tab.active .auth-tab-icon {
    background: var(--primary);
    color: #ffffff;
    border-color: var(--primary);
    box-shadow: 0 10px 18px rgba(31, 122, 224, 0.18);
}

.auth-tab-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
}

.auth-tab-copy strong {
    font-size: 16px;
    line-height: 1.3;
}

.auth-tab-copy small {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
}

.auth-tab.active .auth-tab-copy small {
    color: #4f80b5;
}

.auth-tab-state {
    position: absolute;
    right: 14px;
    top: 14px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #d2dfeb;
}

.auth-tab.active .auth-tab-state {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
}

.panel-body {
    min-height: 330px;
}

.account-pane {
    max-width: 440px;
    margin: 0 auto;
}

.login-tip {
    margin-bottom: 18px;
    padding: 14px 16px;
    border-radius: 8px;
    background: #f7fbff;
    border: 1px solid rgba(216, 229, 239, 0.72);
    color: var(--text-muted);
    line-height: 1.7;
    font-size: 14px;
}

.ai-captcha-box {
    min-height: 1px;
    margin-bottom: 12px;
}

.ai-captcha-box:empty {
    display: none;
}

.ai-captcha-trigger {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
}

.account-pane .submit-btn.el-button {
    width: 100%;
    height: 54px;
    display: inline-flex !important;
    margin-top: 2px;
    border: none !important;
    border-radius: 8px !important;
    background: var(--primary) !important;
    border-color: var(--primary) !important;
    color: #ffffff !important;
    font-size: 16px;
    font-weight: 800;
    box-shadow: 0 12px 24px rgba(31, 122, 224, 0.22);
}

.account-pane .submit-btn.el-button:hover,
.account-pane .submit-btn.el-button:focus {
    background: var(--primary-strong) !important;
    border-color: var(--primary-strong) !important;
    color: #ffffff !important;
}

/* --- QR Code --- */
.qr-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
}

.qr-card {
    width: 100%;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #ffffff;
    box-shadow: 0 18px 40px rgba(50, 72, 94, 0.07);
    text-align: center;
}

.qrcode-container {
    width: 232px;
    min-height: 232px;
    margin: 0 auto 20px;
    padding: 16px;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #eef2f7;
    display: flex;
    align-items: center;
    justify-content: center;
}

.qrcode-container canvas,
.qrcode-container img {
    display: block;
    width: 200px;
    height: 200px;
    object-fit: contain;
}

.qr-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    max-width: 100%;
    padding: 10px 18px;
    border-radius: 999px;
    background: #eef8f4;
    color: #59606f;
    font-weight: 800;
    line-height: 1.5;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.qr-fallback {
    min-height: 280px;
    padding: 22px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}

.qr-fallback-icon {
    width: 68px;
    height: 68px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    margin-bottom: 16px;
    background: var(--primary-soft);
}

.qr-fallback.error .qr-fallback-icon {
    background: #fef2f2;
}

.qr-fallback h3 {
    margin: 0 0 8px;
    font-size: 20px;
    line-height: 1.35;
}

.qr-fallback p {
    max-width: 320px;
    margin: 0;
    color: var(--text-muted);
    line-height: 1.7;
}

.qr-refresh-btn {
    min-width: 132px;
    height: 42px;
    margin-top: 20px;
    border-radius: 8px !important;
    font-weight: 800 !important;
    background: var(--primary) !important;
    border-color: var(--primary) !important;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
}

.qr-refresh-btn:hover {
    background: var(--primary-strong) !important;
    border-color: var(--primary-strong) !important;
}

/* --- Responsive --- */
@media (max-width: 960px) {
    .login-page {
        padding: 16px;
    }

    .shell {
        grid-template-columns: 1fr;
    }

    .hero,
    .panel {
        padding: 32px 26px;
    }

    .hero h1 {
        font-size: 36px;
    }

    .hero-meta {
        margin-top: 34px;
        flex-wrap: wrap;
    }

    .mini-program-card {
        margin-top: 28px;
    }
}

@media (max-width: 520px) {
    .auth-tabs {
        display: grid;
        grid-template-columns: 1fr;
    }

    .panel {
        padding: 28px 18px 24px;
    }

    .hero {
        padding: 28px 20px;
    }

    .hero h1 {
        font-size: 30px;
    }

    .mini-program-card {
        align-items: flex-start;
        flex-direction: column;
    }

    .mini-program-code {
        width: 88px;
        height: 88px;
    }
}

:deep(.el-input__wrapper) {
    border-radius: 8px !important;
    box-shadow: none !important;
    border: 1px solid var(--border) !important;
    background: #ffffff !important;
    padding: 11px 16px !important;
}

:deep(.el-input__wrapper.is-focus) {
    background: #fff !important;
    border-color: var(--primary) !important;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1) !important;
}

:deep(.el-form-item) {
    margin-bottom: 22px;
}

/* Touch device adaptation */
@media (min-width: 821px) and (max-width: 1100px) {
    .login-page {
        padding: 18px;
        align-items: start;
    }

    .shell {
        width: min(980px, 100%);
        grid-template-columns: 0.9fr 1.1fr;
    }

    .hero {
        padding: 34px 32px;
    }

    .panel {
        padding: 34px 32px 30px;
    }

    .brand-mark {
        width: 60px;
        height: 60px;
        margin-bottom: 18px;
    }

    .hero h1 {
        margin-top: 22px;
        font-size: 36px;
    }

    .hero p {
        font-size: 15px;
        line-height: 1.75;
    }

    .hero-meta {
        margin-top: 28px;
        gap: 8px;
    }

    .mini-program-card {
        margin-top: 26px;
        padding: 12px;
    }

    .mini-program-code {
        width: 86px;
        height: 86px;
    }

    .panel-header h2 {
        font-size: 28px;
    }

    .auth-tabs {
        gap: 10px;
        margin-bottom: 22px;
    }

    .auth-tab {
        min-height: 70px;
        padding: 12px;
    }

    .auth-tab-copy small {
        display: none;
    }

    .panel-body {
        min-height: 300px;
    }

    .qr-card {
        padding: 20px;
    }

    .qrcode-container {
        width: 214px;
        min-height: 214px;
    }
}

@media (max-width: 820px) {
    .login-page {
        min-height: 100dvh;
        padding: 14px;
        align-content: start;
        justify-items: center;
        overflow-x: hidden;
    }

    .shell {
        width: 100%;
        grid-template-columns: 1fr;
        border-radius: 8px;
        overflow: hidden;
    }

    .hero {
        padding: 26px 24px;
        border-right: 0;
        border-bottom: 1px solid rgba(216, 229, 239, 0.8);
    }

    .brand-mark {
        width: 54px;
        height: 54px;
        margin-bottom: 16px;
    }

    .hero-badge {
        min-height: 30px;
        padding: 0 12px;
        font-size: 12px;
    }

    .hero h1 {
        margin: 18px 0 10px;
        font-size: clamp(28px, 7vw, 34px);
    }

    .hero p {
        font-size: 14px;
        line-height: 1.7;
    }

    .hero-meta {
        margin-top: 22px;
        gap: 8px;
    }

    .hero-meta span {
        min-height: 30px;
        padding: 0 10px;
        font-size: 12px;
    }

    .mini-program-card {
        width: 100%;
        margin-top: 22px;
        padding: 12px;
        gap: 12px;
    }

    .mini-program-code {
        width: 78px;
        height: 78px;
        padding: 6px;
    }

    .mini-program-copy strong {
        font-size: 15px;
    }

    .mini-program-copy span {
        font-size: 12px;
        line-height: 1.55;
    }

    .panel {
        padding: 26px 22px 24px;
    }

    .panel-header h2 {
        margin-bottom: 6px;
        font-size: 26px;
    }

    .panel-header p {
        margin-bottom: 18px;
        font-size: 14px;
        line-height: 1.6;
    }

    .auth-tabs {
        gap: 10px;
        margin-bottom: 20px;
    }

    .auth-tab {
        min-height: 68px;
        padding: 12px;
    }

    .auth-tab-icon {
        width: 38px;
        height: 38px;
    }

    .auth-tab-copy strong {
        font-size: 15px;
    }

    .auth-tab-copy small {
        font-size: 11px;
    }

    .panel-body {
        min-height: auto;
    }

    .account-pane {
        max-width: none;
    }

    .qr-card {
        padding: 18px;
    }

    .qrcode-container {
        width: min(220px, 100%);
        min-height: 0;
        aspect-ratio: 1;
        margin-bottom: 16px;
        padding: 12px;
    }

    .qrcode-container canvas,
    .qrcode-container img {
        width: 100% !important;
        height: auto !important;
    }

    .qr-status {
        width: 100%;
        padding: 9px 12px;
        font-size: 13px;
    }

    .qr-fallback {
        min-height: 220px;
        padding: 18px 12px;
    }

    .account-pane .submit-btn.el-button {
        height: 48px;
    }

    :deep(.el-form-item) {
        margin-bottom: 16px;
    }
}

@media (max-width: 520px) {
    .login-page {
        padding: 0;
        background-size: 28px 28px, 28px 28px, auto, auto;
    }

    .shell {
        min-height: 100dvh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
    }

    .hero {
        padding: calc(22px + env(safe-area-inset-top, 0px)) 18px 20px;
    }

    .hero h1 {
        font-size: 30px;
    }

    .hero-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .hero-meta span {
        justify-content: center;
        padding: 0 7px;
        white-space: nowrap;
    }

    .mini-program-card {
        align-items: center;
        flex-direction: row;
    }

    .panel {
        padding: 24px 18px 24px;
    }

    .icp-footer {
        padding: 0 18px calc(16px + env(safe-area-inset-bottom, 0px));
    }

    .auth-tabs {
        grid-template-columns: 1fr;
    }

    .auth-tab {
        min-height: 62px;
    }

    .qr-card {
        padding: 14px;
    }

    .qrcode-container {
        width: min(204px, 100%);
    }
}

@media (max-width: 380px) {
    .hero-meta {
        grid-template-columns: 1fr;
    }

    .mini-program-card {
        align-items: flex-start;
        flex-direction: column;
    }

    .mini-program-code {
        width: 72px;
        height: 72px;
    }
}

/* Final login polish: same visual language as the management console. */
@keyframes login-rise {
    from {
        opacity: 0;
        transform: translateY(12px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.login-page {
    --surface: #ffffff;
    --background: #f6f8fb;
    --text-main: #151a21;
    --text-soft: #4e5c6d;
    --text-muted: #7a8797;
    --border: #dfe7ef;
    --border-strong: #c8d5e2;
    --primary: #2563eb;
    --primary-strong: #1d4ed8;
    --primary-soft: #eaf2ff;
    --accent: #0f8f72;
    --accent-soft: #e7f8f2;
    --warm: #b66a12;
    min-height: 100dvh;
    padding: 24px;
    gap: 14px;
    background:
        linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 143, 114, 0.03) 1px, transparent 1px),
        linear-gradient(180deg, #fbfcfe 0%, var(--background) 100%);
    background-size: 28px 28px, 28px 28px, auto;
    background-position: -1px -1px, -1px -1px, 0 0;
    color: var(--text-main);
    -webkit-font-smoothing: antialiased;
}

.shell {
    width: min(1120px, 100%);
    grid-template-columns: minmax(0, 0.96fr) minmax(420px, 1.04fr);
    border-color: rgba(210, 221, 232, 0.92);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 24px 70px rgba(18, 28, 38, 0.12);
    animation: login-rise 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero {
    isolation: isolate;
    padding: 52px 54px;
    border-right-color: rgba(210, 221, 232, 0.86);
    background:
        linear-gradient(135deg, rgba(234, 242, 255, 0.92), rgba(231, 248, 242, 0.82) 58%, rgba(255, 244, 223, 0.72));
}

.hero::before {
    opacity: 0.72;
    background:
        linear-gradient(rgba(37, 99, 235, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 143, 114, 0.045) 1px, transparent 1px);
    background-size: 24px 24px;
}

.hero::after {
    content: "";
    position: absolute;
    right: -56px;
    bottom: -36px;
    z-index: -1;
    width: 300px;
    height: 220px;
    border: 1px solid rgba(200, 213, 226, 0.72);
    border-radius: 8px;
    background:
        linear-gradient(#ffffff, #ffffff) 20px 20px / 112px 10px no-repeat,
        linear-gradient(#e6edf5, #e6edf5) 20px 42px / 210px 8px no-repeat,
        linear-gradient(90deg, #eaf2ff 0 34%, #e7f8f2 34% 66%, #fff4df 66% 100%) 20px 72px / 240px 48px no-repeat,
        repeating-linear-gradient(0deg, #ffffff 0 32px, #f3f6fa 32px 33px);
    box-shadow: 0 20px 44px rgba(18, 28, 38, 0.12);
    opacity: 0.8;
    transform: rotate(-3deg);
}

.brand-mark {
    width: 68px;
    height: 68px;
    margin-bottom: 24px;
    border-color: rgba(210, 221, 232, 0.9);
    border-radius: 8px;
    box-shadow: 0 14px 30px rgba(18, 28, 38, 0.12);
}

.hero-badge {
    min-height: 32px;
    padding: 0 12px;
    border-color: rgba(15, 143, 114, 0.22);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--accent);
    box-shadow: 0 8px 18px rgba(18, 28, 38, 0.06);
}

.hero h1 {
    margin: 26px 0 16px;
    color: var(--text-main);
    font-size: clamp(38px, 4vw, 50px);
    font-weight: 920;
    letter-spacing: 0;
}

.hero p {
    max-width: 500px;
    color: var(--text-soft);
    font-size: 16px;
    line-height: 1.85;
}

.hero-meta {
    margin-top: 38px;
    gap: 10px;
}

.hero-meta span {
    min-height: 32px;
    border-color: rgba(210, 221, 232, 0.86);
    background: rgba(255, 255, 255, 0.68);
    color: var(--text-soft);
    font-weight: 760;
}

.hero-meta span:nth-child(2)::before {
    background: var(--primary);
}

.hero-meta span:nth-child(3)::before {
    background: var(--warm);
}

.mini-program-card {
    margin-top: 34px;
    border-color: rgba(210, 221, 232, 0.9);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 16px 38px rgba(18, 28, 38, 0.09);
}

.mini-program-code {
    border-color: var(--border);
    border-radius: 8px;
}

.mini-program-copy strong {
    color: var(--text-main);
    font-weight: 880;
}

.mini-program-copy span {
    color: var(--text-muted);
}

.panel {
    padding: 50px 54px 44px;
    background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.panel-header h2 {
    color: var(--text-main);
    font-size: 31px;
    font-weight: 900;
}

.panel-header p {
    color: var(--text-muted);
}

.auth-tabs {
    gap: 10px;
    margin-bottom: 24px;
}

.auth-tab {
    min-height: 76px;
    border-color: var(--border);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(18, 28, 38, 0.05);
}

.auth-tab:hover,
.auth-tab:focus-visible {
    border-color: var(--border-strong);
    box-shadow: 0 10px 24px rgba(18, 28, 38, 0.08);
    outline: none;
}

.auth-tab.active {
    border-color: rgba(37, 99, 235, 0.52);
    background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
    color: var(--primary);
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.13);
}

.auth-tab-icon {
    border-color: rgba(37, 99, 235, 0.14);
    border-radius: 8px;
    background: var(--primary-soft);
}

.auth-tab.active .auth-tab-icon {
    background: var(--primary);
    box-shadow: 0 10px 20px rgba(37, 99, 235, 0.18);
}

.auth-tab-copy strong {
    color: var(--text-main);
    font-weight: 880;
}

.auth-tab.active .auth-tab-copy strong {
    color: var(--primary);
}

.auth-tab-copy small {
    color: var(--text-muted);
}

.auth-tab-state {
    background: #d8e2ec;
}

.auth-tab.active .auth-tab-state {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
}

.login-tip,
.qr-card {
    border-color: var(--border);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(18, 28, 38, 0.05);
}

.login-tip {
    color: var(--text-muted);
    background: #f8fafc;
}

.qr-card {
    padding: 22px;
}

.qrcode-container {
    border-color: var(--border);
    border-radius: 8px;
    box-shadow: inset 0 0 0 6px #f8fafc;
}

.qr-status {
    border-radius: 999px;
    background: var(--accent-soft);
}

.qr-status.is-neutral {
    color: #59606f;
    background: #f1f5f9;
}

.qr-status.is-ready,
.qr-status.is-success {
    color: #0f766e;
    background: #e7f8f2;
}

.qr-status.is-waiting {
    color: #b45309;
    background: #fff4df;
}

.qr-status.is-danger {
    color: #dc2626;
    background: #fef2f2;
}

.qr-fallback-icon {
    border-radius: 8px;
}

.qr-refresh-btn,
.account-pane .submit-btn.el-button {
    border-radius: 8px !important;
    background: var(--primary) !important;
    border-color: var(--primary) !important;
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2) !important;
}

.qr-refresh-btn:hover,
.account-pane .submit-btn.el-button:hover,
.account-pane .submit-btn.el-button:focus {
    background: var(--primary-strong) !important;
    border-color: var(--primary-strong) !important;
    transform: translateY(-1px);
}

.icp-footer {
    color: var(--text-muted);
    animation: login-rise 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
}

:deep(.el-input__wrapper) {
    min-height: 46px;
    border-color: var(--border) !important;
    border-radius: 8px !important;
    transition: border-color 0.18s ease, box-shadow 0.18s ease !important;
}

:deep(.el-input__wrapper:hover) {
    border-color: var(--border-strong) !important;
}

:deep(.el-input__wrapper.is-focus) {
    border-color: rgba(37, 99, 235, 0.58) !important;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.09) !important;
}

@media (max-width: 960px) {
    .shell {
        grid-template-columns: 1fr;
    }

    .hero::after {
        width: 260px;
        height: 160px;
        right: -90px;
        bottom: -54px;
        opacity: 0.48;
    }
}

@media (max-width: 820px) {
    .login-page {
        padding: 12px;
        align-content: start;
    }

    .shell {
        border-radius: 8px;
    }

    .hero,
    .panel {
        padding: 28px 22px;
    }

    .hero h1 {
        font-size: clamp(30px, 9vw, 38px);
    }

    .mini-program-card {
        width: 100%;
    }
}

@media (max-width: 520px) {
    .login-page {
        padding: 0;
    }

    .shell {
        min-height: 100dvh;
        border: 0;
        border-radius: 0;
    }

    .hero {
        padding: calc(22px + env(safe-area-inset-top, 0px)) 18px 20px;
    }

    .hero::after {
        display: none;
    }

    .hero-meta {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .hero-meta span {
        min-width: 0;
        padding: 0 6px;
        font-size: 12px;
    }

    .panel {
        padding: 24px 18px;
    }

    .auth-tabs {
        grid-template-columns: 1fr;
    }
}

/* Final mobile login rebuild: centered, complete, scan-first. */
@media (max-width: 640px) {
    .login-page {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        min-height: 100dvh !important;
        padding: calc(18px + env(safe-area-inset-top, 0px)) 16px calc(18px + env(safe-area-inset-bottom, 0px)) !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-rows: auto auto !important;
        align-content: center !important;
        justify-content: center !important;
        justify-items: center !important;
        row-gap: 12px !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
        background:
            radial-gradient(circle at 16% 0%, rgba(37, 99, 235, 0.12), transparent 30%),
            radial-gradient(circle at 88% 12%, rgba(15, 143, 114, 0.1), transparent 28%),
            linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15, 143, 114, 0.03) 1px, transparent 1px),
            linear-gradient(180deg, #f8fbff 0%, #eef4f8 100%) !important;
        background-size: auto, auto, 28px 28px, 28px 28px, auto !important;
        background-position: 0 0, 0 0, -1px -1px, -1px -1px, 0 0 !important;
    }

    .login-page,
    .login-page *,
    .login-page *::before,
    .login-page *::after {
        box-sizing: border-box !important;
    }

    .shell {
        width: min(390px, calc(100vw - 32px)) !important;
        max-width: 100% !important;
        min-height: auto !important;
        margin-inline: auto !important;
        display: block !important;
        justify-self: center !important;
        border: 1px solid rgba(204, 218, 232, 0.92) !important;
        border-radius: 18px !important;
        overflow: hidden !important;
        background: rgba(255, 255, 255, 0.94) !important;
        box-shadow:
            0 24px 60px rgba(18, 28, 38, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.76) !important;
        backdrop-filter: blur(16px) saturate(1.12);
        -webkit-backdrop-filter: blur(16px) saturate(1.12);
    }

    .hero {
        min-height: auto !important;
        padding: 22px 22px 16px !important;
        display: grid !important;
        grid-template-columns: 58px minmax(0, 1fr) !important;
        gap: 14px !important;
        align-items: center !important;
        border: 0 !important;
        border-bottom: 1px solid rgba(223, 231, 239, 0.86) !important;
        background:
            linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37, 99, 235, 0.026) 1px, transparent 1px),
            linear-gradient(180deg, rgba(248, 251, 255, 0.9), rgba(255, 255, 255, 0.72)) !important;
        background-size: 28px 28px, 28px 28px, auto !important;
        background-position: -1px -1px, -1px -1px, 0 0 !important;
    }

    .hero::before,
    .hero::after,
    .hero-badge,
    .mini-program-card {
        display: none !important;
    }

    .brand-mark {
        grid-row: 1 / span 2;
        width: 58px !important;
        height: 58px !important;
        margin: 0 !important;
        border-radius: 16px !important;
        border: 1px solid rgba(255, 255, 255, 0.82) !important;
        background: rgba(255, 255, 255, 0.78) !important;
        box-shadow:
            0 12px 28px rgba(37, 99, 235, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.76) !important;
    }

    .hero h1 {
        min-width: 0;
        margin: 3px 0 -1px !important;
        color: #101828 !important;
        font-size: 25px !important;
        font-weight: 920 !important;
        line-height: 1.12 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transform: translateY(2px);
    }

    .hero p {
        display: block !important;
        grid-column: 2;
        margin: 6px 0 0 !important;
        color: #667085 !important;
        font-size: 12px !important;
        line-height: 1.45 !important;
    }

    .hero-meta {
        grid-column: 1 / -1;
        margin-top: 14px !important;
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 8px !important;
    }

    .hero-meta span {
        min-width: 0 !important;
        min-height: 30px !important;
        padding: 0 8px !important;
        justify-content: center !important;
        border-color: rgba(223, 231, 239, 0.9) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.74) !important;
        color: #536276 !important;
        font-size: 11px !important;
        font-weight: 780 !important;
        white-space: nowrap !important;
    }

    .hero-meta span::before {
        width: 5px !important;
        height: 5px !important;
        flex: 0 0 auto;
    }

    .panel {
        width: 100% !important;
        margin: 0 !important;
        padding: 22px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: #ffffff !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
    }

    .panel-header {
        margin: 0 0 16px !important;
        text-align: left !important;
    }

    .panel-header h2 {
        margin: 0 0 6px !important;
        color: #101828 !important;
        font-size: 26px !important;
        font-weight: 920 !important;
        line-height: 1.15 !important;
    }

    .panel-header p {
        margin: 0 !important;
        color: #667085 !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
    }

    .auth-tabs {
        margin: 0 0 18px !important;
        padding: 4px !important;
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 4px !important;
        border: 1px solid #dfe7ef !important;
        border-radius: 13px !important;
        background: #f3f7fb !important;
    }

    .auth-tab {
        min-height: 46px !important;
        padding: 0 8px !important;
        display: inline-flex !important;
        justify-content: center !important;
        gap: 7px !important;
        border: 0 !important;
        border-radius: 10px !important;
        background: transparent !important;
        color: #5f6f85 !important;
        box-shadow: none !important;
        text-align: center !important;
        transform: none !important;
    }

    .auth-tab.active {
        background: #ffffff !important;
        color: var(--primary) !important;
        box-shadow:
            0 7px 16px rgba(18, 28, 38, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
    }

    .auth-tab-icon {
        width: 24px !important;
        height: 24px !important;
        border: 0 !important;
        background: transparent !important;
        color: currentColor !important;
        box-shadow: none !important;
    }

    .auth-tab-copy {
        display: block !important;
    }

    .auth-tab-copy strong {
        display: block !important;
        color: currentColor !important;
        font-size: 14px !important;
        line-height: 1 !important;
        white-space: nowrap !important;
    }

    .auth-tab-copy small,
    .auth-tab-state {
        display: none !important;
    }

    .panel-body {
        min-height: 0 !important;
    }

    .qr-pane {
        width: 100% !important;
        display: grid !important;
        justify-items: center !important;
    }

    .qr-card,
    .login-tip {
        border-color: #dfe7ef !important;
        border-radius: 14px !important;
        background: #f8fafc !important;
        box-shadow: none !important;
    }

    .qr-card {
        width: 100% !important;
        max-width: 100% !important;
        padding: 16px !important;
        display: grid !important;
        justify-items: center !important;
        overflow: hidden !important;
    }

    .qrcode-container {
        width: min(218px, 72vw) !important;
        min-height: 0 !important;
        aspect-ratio: 1 !important;
        margin: 0 auto 14px !important;
        padding: 12px !important;
        border-color: #dfe7ef !important;
        border-radius: 14px !important;
        background: #ffffff !important;
        box-shadow: inset 0 0 0 6px #f8fafc !important;
    }

    .qrcode-container canvas,
    .qrcode-container img {
        width: 100% !important;
        height: auto !important;
    }

    .qr-status {
        width: 100% !important;
        max-width: 100% !important;
        display: flex !important;
        min-height: 40px !important;
        padding: 9px 12px !important;
        gap: 7px !important;
        justify-content: center !important;
        border-radius: 12px !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        text-align: center !important;
    }

    .account-pane {
        max-width: none !important;
    }

    .login-tip {
        margin-bottom: 15px !important;
        padding: 12px 13px !important;
        color: #667085 !important;
        font-size: 12px !important;
        line-height: 1.55 !important;
    }

    :deep(.el-form-item) {
        margin-bottom: 14px !important;
    }

    :deep(.el-input__wrapper) {
        min-height: 48px !important;
        padding: 0 13px !important;
        border-color: #d9e4ef !important;
        border-radius: 12px !important;
        background: #ffffff !important;
    }

    :deep(.el-input__inner) {
        font-size: 15px !important;
    }

    .account-pane .submit-btn.el-button {
        height: 48px !important;
        margin-top: 2px !important;
        border-radius: 12px !important;
        font-size: 15px !important;
        box-shadow: 0 12px 26px rgba(37, 99, 235, 0.2) !important;
    }

    .qr-fallback {
        min-height: 208px !important;
        padding: 16px 12px !important;
    }

    .qr-fallback-icon {
        width: 54px !important;
        height: 54px !important;
        margin-bottom: 12px !important;
        border-radius: 14px !important;
    }

    .qr-fallback h3 {
        font-size: 18px !important;
    }

    .qr-fallback p {
        font-size: 13px !important;
        line-height: 1.55 !important;
    }

    .qr-refresh-btn {
        min-width: 120px !important;
        height: 40px !important;
        margin-top: 14px !important;
        border-radius: 12px !important;
    }

    .icp-footer {
        width: min(390px, calc(100vw - 32px)) !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 0 8px !important;
        display: block !important;
        color: rgba(83, 98, 118, 0.72) !important;
        font-size: 11px !important;
        line-height: 1.55 !important;
        text-align: center !important;
        animation: none !important;
    }

    .icp-footer a {
        color: inherit !important;
        text-decoration: none !important;
    }
}

@media (max-width: 380px) {
    .login-page {
        padding-right: 10px !important;
        padding-left: 10px !important;
    }

    .shell {
        border-radius: 16px !important;
    }

    .icp-footer {
        width: min(100%, calc(100vw - 20px)) !important;
        font-size: 10.5px !important;
    }

    .hero {
        padding: 18px 18px 14px !important;
        grid-template-columns: 52px minmax(0, 1fr) !important;
    }

    .brand-mark {
        width: 52px !important;
        height: 52px !important;
    }

    .hero h1 {
        font-size: 23px !important;
    }

    .panel {
        padding: 18px !important;
    }

    .panel-header h2 {
        font-size: 24px !important;
    }

    .auth-tab-copy strong {
        font-size: 13px !important;
    }
}

/* Final login interaction repair: prevent rectangular press/focus flash. */
.login-page button,
.login-page :deep(.el-button) {
    -webkit-tap-highlight-color: transparent !important;
    appearance: none !important;
    background-clip: padding-box !important;
    outline: none !important;
    overflow: hidden !important;
}

.login-page button:active,
.login-page button:focus,
.login-page button:focus-visible,
.login-page :deep(.el-button:active),
.login-page :deep(.el-button:focus),
.login-page :deep(.el-button:focus-visible) {
    outline: none !important;
    background-clip: padding-box !important;
}

.login-page button::before,
.login-page button::after,
.login-page :deep(.el-button)::before,
.login-page :deep(.el-button)::after {
    border-radius: inherit !important;
}

.account-pane .submit-btn.el-button,
.qr-refresh-btn {
    --login-button-radius: 8px;
}

@media (max-width: 640px) {
    .account-pane .submit-btn.el-button,
    .qr-refresh-btn {
        --login-button-radius: 12px;
    }
}

.account-pane .submit-btn.el-button:active,
.account-pane .submit-btn.el-button:focus,
.account-pane .submit-btn.el-button:focus-visible,
.qr-refresh-btn:active,
.qr-refresh-btn:focus,
.qr-refresh-btn:focus-visible {
    border-radius: var(--login-button-radius, 8px) !important;
    outline: none !important;
    box-shadow: 0 12px 26px rgba(37, 99, 235, 0.2) !important;
}

/* Subtle login motion: same clean scan language as the mini program. */
@keyframes login-ambient-scan {
    0%,
    100% {
        opacity: 0;
        transform: translate3d(0, -44px, 0);
    }

    22%,
    72% {
        opacity: 0.52;
    }

    50% {
        opacity: 0.72;
        transform: translate3d(0, 30vh, 0);
    }
}

@keyframes login-ambient-scan-up {
    0%,
    100% {
        opacity: 0;
        transform: translate3d(0, 44px, 0);
    }

    22%,
    72% {
        opacity: 0.38;
    }

    50% {
        opacity: 0.56;
        transform: translate3d(0, -30vh, 0);
    }
}

@keyframes login-card-sheen {
    0%,
    56%,
    100% {
        opacity: 0;
        transform: translateX(-130%) skewX(-16deg);
    }

    68% {
        opacity: 1;
    }

    86% {
        opacity: 0;
        transform: translateX(320%) skewX(-16deg);
    }
}

@keyframes login-quiet-pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 1;
    }

    50% {
        transform: scale(0.86);
        opacity: 0.72;
    }
}

.login-page {
    position: relative;
    overflow: hidden;
}

.login-page::before,
.login-page::after {
    content: '';
    position: fixed;
    left: 8vw;
    right: 8vw;
    height: 1px;
    border-radius: 999px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent 0%, rgba(37, 99, 235, 0.22) 50%, transparent 100%);
    box-shadow: 0 0 18px rgba(37, 99, 235, 0.12);
    animation: login-ambient-scan 8s ease-in-out infinite;
}

.login-page::before {
    top: 19vh;
}

.login-page::after {
    top: 68vh;
    opacity: 0.34;
    animation-name: login-ambient-scan-up;
    animation-delay: -4s;
}

.shell,
.icp-footer {
    position: relative;
    z-index: 1;
}

.qr-card {
    position: relative;
    overflow: hidden;
}

.qr-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: -30%;
    width: 42%;
    height: 100%;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.055), transparent);
    animation: login-card-sheen 5.8s ease-in-out infinite;
}

.auth-tab.active .auth-tab-state,
.qr-status svg {
    animation: login-quiet-pulse 2.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
    .login-page::before,
    .login-page::after,
    .qr-card::before,
    .login-page *,
    .shell,
    .icp-footer {
        animation: none !important;
        transition: none !important;
    }
}
</style>
