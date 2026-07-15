import { request } from '../utils/request';
import { authApi } from './authApi';
import { buildQuery } from './shared';
import { ExamProgress, ProgressPayload } from './types';

function getProgressStorageKey(categoryId: string, mode: string) {
    const uid = wx.getStorageSync('wechat_openid') || 'guest';
    return `exam_progress_${uid}_${categoryId}_${mode}`;
}

function getPendingProgressStorageKey() {
    const uid = wx.getStorageSync('wechat_openid') || 'guest';
    return `pending_exam_progress_keys_${uid}`;
}

function readPendingProgressKeys() {
    const keys = wx.getStorageSync(getPendingProgressStorageKey());
    return Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
}

function addPendingProgressKey(categoryId: string, mode: string) {
    const key = getProgressStorageKey(categoryId, mode);
    const keys = readPendingProgressKeys();
    if (!keys.includes(key)) {
        wx.setStorageSync(getPendingProgressStorageKey(), [...keys, key]);
    }
}

function removePendingProgressKey(categoryId: string, mode: string) {
    const key = getProgressStorageKey(categoryId, mode);
    const keys = readPendingProgressKeys().filter((item) => item !== key);
    wx.setStorageSync(getPendingProgressStorageKey(), keys);
}

function isPendingProgressKey(categoryId: string, mode: string) {
    return readPendingProgressKeys().includes(getProgressStorageKey(categoryId, mode));
}

function getProgressUpdatedAt(progress?: Pick<ExamProgress, 'updateTime'> | null) {
    if (!progress || !progress.updateTime) {
        return 0;
    }

    const timestamp = new Date(progress.updateTime).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export const progressApi = {
    saveProgress: async (data: ProgressPayload) => {
        progressApi.saveLocalProgress(data);
        addPendingProgressKey(data.categoryId, data.mode);
        await authApi.ensureAuth();
        const result = await request({ url: '/exam/progress', method: 'POST', data });
        removePendingProgressKey(data.categoryId, data.mode);
        return result;
    },

    getProgress: async (categoryId: string, mode: string) => {
        const localProgress = progressApi.getLocalProgress(categoryId, mode);
        try {
            await authApi.ensureAuth();
            const remoteProgress = await request<ExamProgress>({ url: `/exam/progress${buildQuery({ categoryId, mode })}` });
            if (remoteProgress) {
                if (remoteProgress.isCleared) {
                    progressApi.clearLocalProgress(categoryId, mode);
                    removePendingProgressKey(categoryId, mode);
                    return null;
                }

                if (localProgress && getProgressUpdatedAt(localProgress) > getProgressUpdatedAt(remoteProgress)) {
                    return localProgress;
                }

                progressApi.saveLocalProgress(remoteProgress as any);
                return remoteProgress;
            }
        } catch (error) {
            if (localProgress) {
                return localProgress;
            }
            throw error;
        }

        if (isPendingProgressKey(categoryId, mode)) {
            return localProgress || null;
        }

        progressApi.clearLocalProgress(categoryId, mode);
        return null;
    },

    clearProgress: async (categoryId: string, mode: string) => {
        progressApi.clearLocalProgress(categoryId, mode);
        removePendingProgressKey(categoryId, mode);
        await authApi.ensureAuth();
        return request({ url: '/exam/progress', method: 'DELETE', data: { categoryId, mode } });
    },

    saveLocalProgress: (data: ProgressPayload) => {
        wx.setStorageSync(getProgressStorageKey(data.categoryId, data.mode), {
            ...data,
            updateTime: data.updateTime || new Date().toISOString(),
        });
    },

    getLocalProgress: (categoryId: string, mode: string) => {
        return (wx.getStorageSync(getProgressStorageKey(categoryId, mode)) || null) as ExamProgress | null;
    },

    clearLocalProgress: (categoryId: string, mode: string) => {
        wx.removeStorageSync(getProgressStorageKey(categoryId, mode));
    },

    flushPendingProgress: async () => {
        if (!authApi.isLoggedIn()) {
            return;
        }

        const keys = readPendingProgressKeys();
        for (const key of keys) {
            const progress = wx.getStorageSync(key) as ProgressPayload | '';
            if (!progress || !progress.categoryId || !progress.mode) {
                wx.setStorageSync(getPendingProgressStorageKey(), readPendingProgressKeys().filter((item) => item !== key));
                continue;
            }

            try {
                await request({ url: '/exam/progress', method: 'POST', data: progress });
                removePendingProgressKey(progress.categoryId, progress.mode);
            } catch (error) {
                console.error('Flush progress failed', error);
            }
        }
    },
};
