import { AUTH_REQUIRED_ERROR_CODE } from '../services/shared';

type PromptLoginOptions = {
    message?: string;
    nextUrl?: string;
};

export function isAuthRequiredError(error: any) {
    return !!(error && error.code === AUTH_REQUIRED_ERROR_CODE);
}

export function buildPageUrl(route: string, params?: Record<string, string | number | undefined>) {
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
    const query = Object.entries(params || {})
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

    return query ? `${normalizedRoute}?${query}` : normalizedRoute;
}

function buildLoginPageUrl(nextUrl?: string) {
    if (!nextUrl) {
        return '/pages/auth-login/auth-login';
    }

    return `/pages/auth-login/auth-login?nextUrl=${encodeURIComponent(nextUrl)}`;
}

export function promptLogin(options: PromptLoginOptions = {}) {
    const {
        message = '登录后才可以继续当前操作，是否前往登录？',
        nextUrl,
    } = options;

    return new Promise<boolean>((resolve) => {
        wx.showModal({
            title: '请先登录',
            content: message,
            confirmText: '去登录',
            cancelText: '取消',
            success: (res) => {
                if (!res.confirm) {
                    resolve(false);
                    return;
                }

                wx.navigateTo({
                    url: buildLoginPageUrl(nextUrl),
                    success: () => resolve(true),
                    fail: () => resolve(false),
                });
            },
            fail: () => resolve(false),
        });
    });
}
