import { runtimeConfig } from '../config/runtime';

type ExperienceEvent = 'page_load' | 'ui_error' | 'unhandled_error' | 'unhandled_rejection' | 'request_failure';

function fingerprint(value: unknown) {
    const source = value instanceof Error
        ? `${value.name}:${String(value.stack || '').split('\n').slice(0, 3).join('\n')}`
        : typeof value === 'string' ? value.slice(0, 200) : 'UnknownError';
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function currentRoute() {
    try {
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        return (currentPage && currentPage.route) || 'app';
    } catch {
        return 'app';
    }
}

export function reportMiniappExperience(options: {
    event: ExperienceEvent;
    outcome?: 'ok' | 'error' | 'timeout' | 'aborted';
    error?: unknown;
    route?: string;
    durationMs?: number;
}) {
    const token = wx.getStorageSync('token') || '';
    wx.request({
        url: `${runtimeConfig.baseUrl.replace(/\/$/, '')}/client-experience`,
        method: 'POST',
        data: {
            event: options.event,
            outcome: options.outcome || 'error',
            route: String(options.route || currentRoute()).split(/[?#]/, 1)[0].slice(0, 80),
            durationMs: Number.isFinite(options.durationMs) ? Math.min(Math.round(options.durationMs as number), 300000) : undefined,
            fingerprint: options.error === undefined ? undefined : fingerprint(options.error),
        },
        header: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 5000,
        fail: () => {},
    });
}
