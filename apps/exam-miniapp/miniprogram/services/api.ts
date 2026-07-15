import { clearLocalSession, request } from '../utils/request';
import { authApi } from './authApi';
import { learningApi } from './learningApi';
import { libraryApi } from './libraryApi';
import { progressApi } from './progressApi';
import { scanShareApi } from './scanShareApi';

export * from './types';
export { AUTH_REQUIRED_ERROR_CODE } from './shared';

function clearSession() {
    authApi.clearSession();
    libraryApi.clearLibraryCache();
}

async function deleteAccount() {
    await authApi.ensureAuth();
    const result = await request({ url: '/api/user/account', method: 'DELETE' });
    clearSession();
    return result;
}

export const api = {
    ...authApi,
    ...libraryApi,
    ...learningApi,
    ...progressApi,
    ...scanShareApi,
    clearSession,
    clearLibraryCache: libraryApi.clearLibraryCache,
    deleteAccount,
};

export { clearLocalSession };
