import { clearLocalSession, request } from '../utils/request';
import { createAuthRequiredError } from './shared';
import { LoginResult, UserProfile } from './types';

let loginPromise: Promise<string> | null = null;

function getLocalAvatarStorageKey(openid: string) {
    return `local_avatar_${openid}`;
}

function getLocalAvatar(openid?: string) {
    const uid = openid || authApi.getUserId();
    if (!uid) return '';
    return wx.getStorageSync(getLocalAvatarStorageKey(uid)) || '';
}

function setLocalAvatar(avatarUrl: string, openid?: string) {
    const uid = openid || authApi.getUserId();
    if (!uid) return;
    wx.setStorageSync(getLocalAvatarStorageKey(uid), avatarUrl || '');
}

function persistLoginResult(result: LoginResult, profile?: { nickname?: string; avatarUrl?: string }) {
    wx.setStorageSync('wechat_openid', result.openid);
    wx.setStorageSync('token', result.token);

    const profileAvatarUrl = profile && profile.avatarUrl ? profile.avatarUrl : '';
    const profileNickname = profile && profile.nickname ? profile.nickname : '';
    const avatarUrl = profileAvatarUrl || getLocalAvatar(result.openid) || result.avatarUrl || '';
    if (profileAvatarUrl) {
        setLocalAvatar(profileAvatarUrl, result.openid);
    }

    wx.setStorageSync('user_profile', {
        nickname: profileNickname || result.nickname || '',
        avatarUrl,
    });
}

export const authApi = {
    getUserId: () => {
        return wx.getStorageSync('wechat_openid') || '';
    },

    getToken: () => {
        return wx.getStorageSync('token') || '';
    },

    isLoggedIn: () => {
        return !!(authApi.getToken() && authApi.getUserId());
    },

    ensureAuth: async () => {
        const token = authApi.getToken();
        const openid = authApi.getUserId();
        if (token && openid) return openid;
        throw createAuthRequiredError();
    },

    loginWithProfile: async (profile: { nickname: string; avatarUrl: string }) => {
        const nickname = String(profile.nickname || '').trim();
        const avatarUrl = String(profile.avatarUrl || '').trim();

        if (!nickname) {
            throw new Error('Nickname is required');
        }

        if (!avatarUrl) {
            throw new Error('Avatar is required');
        }

        if (!loginPromise) {
            loginPromise = new Promise<string>((resolve, reject) => {
                wx.login({
                    success: async (res) => {
                        if (!res.code) {
                            reject(new Error(`wx.login failed: ${res.errMsg}`));
                            return;
                        }

                        try {
                            const result = await request<LoginResult>({
                                url: '/api/user/login',
                                method: 'POST',
                                data: { code: res.code },
                            });

                            if (!result.openid || !result.token) {
                                reject(new Error('Login failed: missing openid/token'));
                                return;
                            }

                            persistLoginResult(result, { nickname, avatarUrl });
                            await request<UserProfile>({
                                url: '/api/user/profile',
                                method: 'POST',
                                data: { nickname },
                            });
                            resolve(result.openid);
                        } catch (err) {
                            clearLocalSession();
                            reject(err);
                        }
                    },
                    fail: (err) => reject(err),
                });
            }).finally(() => {
                loginPromise = null;
            });
        }

        return loginPromise;
    },

    getLocalAvatar,
    setLocalAvatar,

    clearLocalAvatar: (openid?: string) => {
        const uid = openid || authApi.getUserId();
        if (!uid) return;
        wx.removeStorageSync(getLocalAvatarStorageKey(uid));
    },

    clearSession: () => {
        clearLocalSession();
    },
};
