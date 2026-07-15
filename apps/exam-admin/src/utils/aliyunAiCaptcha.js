const CAPTCHA_SCRIPT_ID = 'aliyun-ai-captcha-script';
const CAPTCHA_SCRIPT_URL = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
const CAPTCHA_VERIFY_HEADER = 'X-Captcha-Verify-Code';

let scriptPromise = null;

function normalizeConfig(config = {}) {
    return {
        enabled: Boolean(config.enabled),
        region: config.region || 'cn',
        prefix: config.prefix || '',
        sceneId: config.sceneId || '',
    };
}

export function isAiCaptchaConfigured(config = {}) {
    const normalized = normalizeConfig(config);
    return normalized.enabled && Boolean(normalized.prefix && normalized.sceneId);
}

function loadScript() {
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById(CAPTCHA_SCRIPT_ID);
        if (existing) {
            if (window.initAliyunCaptcha) {
                resolve();
                return;
            }

            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', () => reject(new Error('AI 验证码脚本加载失败')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = CAPTCHA_SCRIPT_ID;
        script.src = CAPTCHA_SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('AI 验证码脚本加载失败'));
        document.head.appendChild(script);
    });

    return scriptPromise;
}

export async function initAliyunAiCaptcha(config, options) {
    const normalized = normalizeConfig(config);
    if (!isAiCaptchaConfigured(normalized)) {
        throw new Error('AI 验证码配置不完整');
    }

    window.AliyunCaptchaConfig = {
        region: normalized.region,
        prefix: normalized.prefix,
    };

    await loadScript();
    if (!window.initAliyunCaptcha) {
        throw new Error('AI 验证码初始化入口不存在');
    }

    return new Promise((resolve, reject) => {
        window.initAliyunCaptcha({
            SceneId: normalized.sceneId,
            mode: 'popup',
            ...options,
            success: (captchaVerifyParam) => {
                options.success?.(captchaVerifyParam);
            },
            fail: (captchaResult) => {
                options.fail?.(captchaResult);
            },
            getInstance: (instance) => {
                options.getInstance?.(instance);
                resolve(instance);
            },
        });

        window.setTimeout(() => reject(new Error('AI 验证码初始化超时')), 10000);
    });
}

export function getCaptchaVerifyCode(headers) {
    if (!headers || typeof headers.get !== 'function') return '';
    return headers.get(CAPTCHA_VERIFY_HEADER) || '';
}
