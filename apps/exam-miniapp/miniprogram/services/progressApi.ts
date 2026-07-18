import { request } from '../utils/request';
import { authApi } from './authApi';
import { buildQuery } from './shared';
import { ExamProgress, ProgressPayload } from './types';

const flushPromises = new Map<string, Promise<void>>();
const uploadPromises = new Map<string, Promise<any>>();

function getProgressStorageKey(categoryId: string, mode: string) {
    const uid = wx.getStorageSync('wechat_openid') || 'guest';
    return `exam_progress_${uid}_${categoryId}_${mode}`;
}

function getPendingProgressStorageKey() {
    const uid = wx.getStorageSync('wechat_openid') || 'guest';
    return `pending_exam_progress_keys_${uid}`;
}

function readPendingProgressKeys(pendingStorageKey = getPendingProgressStorageKey()) {
    const keys = wx.getStorageSync(pendingStorageKey);
    return Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
}

function addPendingProgressKey(categoryId: string, mode: string, pendingStorageKey = getPendingProgressStorageKey()) {
    const key = getProgressStorageKey(categoryId, mode);
    const keys = readPendingProgressKeys(pendingStorageKey);
    if (!keys.includes(key)) {
        wx.setStorageSync(pendingStorageKey, [...keys, key]);
    }
}

function removePendingProgressStorageKey(progressStorageKey: string, pendingStorageKey = getPendingProgressStorageKey()) {
    const storedKeys = wx.getStorageSync(pendingStorageKey);
    if (!Array.isArray(storedKeys)) {
        return;
    }

    const keys = storedKeys.filter((item) => item !== progressStorageKey);
    wx.setStorageSync(pendingStorageKey, keys);
}

function removePendingProgressKey(categoryId: string, mode: string, pendingStorageKey = getPendingProgressStorageKey()) {
    removePendingProgressStorageKey(getProgressStorageKey(categoryId, mode), pendingStorageKey);
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

function isSameProgressSnapshot(left: ProgressPayload | '', right: ProgressPayload | '') {
    if (!left || !right) {
        return left === right;
    }

    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function uploadLatestProgress(progressStorageKey: string, pendingStorageKey: string) {
    const activeUpload = uploadPromises.get(progressStorageKey);
    if (activeUpload) {
        return activeUpload;
    }

    let uploadPromise: Promise<any>;
    uploadPromise = (async () => {
        let result: any;
        while (true) {
            const progress = wx.getStorageSync(progressStorageKey) as ProgressPayload | '';
            if (!progress || !progress.categoryId || !progress.mode) {
                removePendingProgressStorageKey(progressStorageKey, pendingStorageKey);
                return result;
            }

            result = await request({ url: '/exam/progress', method: 'POST', data: progress });
            const latestProgress = wx.getStorageSync(progressStorageKey) as ProgressPayload | '';
            if (isSameProgressSnapshot(progress, latestProgress)) {
                removePendingProgressStorageKey(progressStorageKey, pendingStorageKey);
                return result;
            }

            if (!latestProgress) {
                removePendingProgressStorageKey(progressStorageKey, pendingStorageKey);
                return result;
            }
        }
    })().finally(() => {
        if (uploadPromises.get(progressStorageKey) === uploadPromise) {
            uploadPromises.delete(progressStorageKey);
        }
    });

    uploadPromises.set(progressStorageKey, uploadPromise);
    return uploadPromise;
}

export const progressApi = {
    saveProgress: async (data: ProgressPayload) => {
        const progressStorageKey = getProgressStorageKey(data.categoryId, data.mode);
        const pendingStorageKey = getPendingProgressStorageKey();
        progressApi.saveLocalProgress(data);
        addPendingProgressKey(data.categoryId, data.mode, pendingStorageKey);
        await authApi.ensureAuth();
        return uploadLatestProgress(progressStorageKey, pendingStorageKey);
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
        const progressStorageKey = getProgressStorageKey(categoryId, mode);
        const pendingStorageKey = getPendingProgressStorageKey();
        progressApi.clearLocalProgress(categoryId, mode);
        removePendingProgressKey(categoryId, mode, pendingStorageKey);
        const activeUpload = uploadPromises.get(progressStorageKey);
        if (activeUpload) {
            await activeUpload.catch(() => undefined);
        }
        await authApi.ensureAuth();
        return request({ url: '/exam/progress', method: 'DELETE', data: { categoryId, mode } });
    },

    saveLocalProgress: (data: ProgressPayload) => {
        const storedProgress = {
            ...data,
            updateTime: data.updateTime || new Date().toISOString(),
        };
        wx.setStorageSync(getProgressStorageKey(data.categoryId, data.mode), storedProgress);
        return storedProgress;
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

        const pendingStorageKey = getPendingProgressStorageKey();
        const activeFlush = flushPromises.get(pendingStorageKey);
        if (activeFlush) return activeFlush;

        let flushPromise: Promise<void>;
        flushPromise = (async () => {
            const keys = readPendingProgressKeys(pendingStorageKey);
            for (const key of keys) {
                const progress = wx.getStorageSync(key) as ProgressPayload | '';
                if (!progress || !progress.categoryId || !progress.mode) {
                    removePendingProgressStorageKey(key, pendingStorageKey);
                    continue;
                }

                try {
                    await uploadLatestProgress(key, pendingStorageKey);
                } catch (error) {
                    console.error('Flush progress failed', error);
                }
            }
        })().finally(() => {
            if (flushPromises.get(pendingStorageKey) === flushPromise) {
                flushPromises.delete(pendingStorageKey);
            }
        });

        flushPromises.set(pendingStorageKey, flushPromise);
        return flushPromise;
    },
};
