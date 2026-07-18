import { runtimeConfig } from '../../config/runtime';
import { api } from '../../services/api';
import { getNavBarInfo } from '../../utils/nav';
import { ROUTES } from '../../utils/routes';

type TabPage = typeof ROUTES.INDEX | typeof ROUTES.PROFILE;
const TAB_PAGES: ReadonlySet<string> = new Set([
    ROUTES.INDEX,
    ROUTES.PROFILE,
]);
const isTabPage = (path: string): path is TabPage => TAB_PAGES.has(path);
const DEFAULT_GUEST_AVATAR = '/assets/guest-avatar.png';

Page({
    data: {
        appName: runtimeConfig.appName,
        nickname: '',
        avatarUrl: '',
        defaultAvatar: DEFAULT_GUEST_AVATAR,
        nextUrl: '',
        submitting: false,
        agreementAccepted: false,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    onLoad(options: Record<string, string>) {
        const nextUrl = options.nextUrl ? decodeURIComponent(options.nextUrl) : '';
        const profile = wx.getStorageSync('user_profile') || {};
        const navInfo = getNavBarInfo();

        this.setData({
            nextUrl,
            nickname: profile.nickname || '',
            avatarUrl: profile.avatarUrl || '',
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },

    onChooseAvatar(e: any) {
        const avatarUrl = e && e.detail && e.detail.avatarUrl ? e.detail.avatarUrl : '';
        this.setData({ avatarUrl });
    },

    onNicknameInput(e: any) {
        this.setData({
            nickname: e.detail.value,
        });
    },

    onNicknameBlur(e: any) {
        this.setData({
            nickname: e.detail.value,
        });
    },

    onAgreementChange(e: any) {
        const values = e && e.detail && Array.isArray(e.detail.value) ? e.detail.value : [];
        this.setData({
            agreementAccepted: values.includes('accepted'),
        });
    },

    async onConfirmLogin(e: any) {
        const submittedNickname = e && e.detail && e.detail.value ? e.detail.value.nickname : '';
        const nickname = String(submittedNickname || this.data.nickname || '').trim();
        const avatarUrl = String(this.data.avatarUrl || '').trim();

        if (!this.data.agreementAccepted) {
            wx.showToast({ title: '请先勾选协议', icon: 'none' });
            return;
        }

        if (!avatarUrl) {
            wx.showToast({ title: '请先选择头像', icon: 'none' });
            return;
        }

        if (!nickname) {
            wx.showToast({ title: '请先填写昵称', icon: 'none' });
            return;
        }

        if (this.data.submitting) {
            return;
        }

        this.setData({
            nickname,
            submitting: true,
        });
        try {
            await api.loginWithProfile({ nickname, avatarUrl });
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => {
                this.navigateAfterLogin();
            }, 300);
        } catch (error) {
            console.error('loginWithProfile failed', error);
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        } finally {
            this.setData({ submitting: false });
        }
    },

    navigateAfterLogin() {
        const nextUrl = this.data.nextUrl;
        if (nextUrl) {
            const path = nextUrl.split('?')[0];
            if (isTabPage(path)) {
                wx.switchTab({ url: path });
                return;
            }

            wx.redirectTo({ url: nextUrl });
            return;
        }

        if (getCurrentPages().length > 1) {
            wx.navigateBack();
            return;
        }

        wx.switchTab({ url: ROUTES.PROFILE });
    },

    onBack() {
        if (getCurrentPages().length > 1) {
            wx.navigateBack();
            return;
        }

        wx.switchTab({ url: ROUTES.INDEX });
    },

    goToPrivacyPolicy() {
        wx.navigateTo({
            url: ROUTES.PRIVACY_POLICY,
        });
    },

    goToUserAgreement() {
        wx.navigateTo({
            url: ROUTES.USER_AGREEMENT,
        });
    },
});
