import { request } from '../utils/request';
import { authApi } from './authApi';
import { libraryApi } from './libraryApi';
import { buildQuery } from './shared';
import {
    AcceptPaperShareResult,
    PaperSharePreview,
    ScanLoginSession,
} from './types';

export const scanShareApi = {
    previewPaperShare: async (shareCode: string) => {
        await authApi.ensureAuth();
        return request<PaperSharePreview>({
            url: `/api/user/paper-shares/preview${buildQuery({ shareCode })}`,
            showError: false,
        });
    },

    acceptPaperShare: async (shareCode: string) => {
        await authApi.ensureAuth();
        const result = await request<AcceptPaperShareResult>({
            url: '/api/user/paper-shares/accept',
            method: 'POST',
            data: { shareCode },
            showError: false,
        });
        libraryApi.clearLibraryCache();
        return result;
    },

    scanLoginQrCode: async (qrToken: string) => {
        await authApi.ensureAuth();
        return request<ScanLoginSession>({
            url: '/api/user/scan-login/scan',
            method: 'POST',
            data: { qrToken },
            showError: false,
        });
    },

    confirmScanLogin: async (qrToken: string) => {
        await authApi.ensureAuth();
        return request<ScanLoginSession>({
            url: '/api/user/scan-login/confirm',
            method: 'POST',
            data: { qrToken },
            showError: false,
        });
    },
};
