import { runtimeConfig } from '../../config/runtime';
import { api } from '../../services/api';
import { buildPageUrl, promptLogin } from '../../utils/auth';
import { getNavBarInfo } from '../../utils/nav';
import { ROUTES } from '../../utils/routes';

const DEFAULT_CONSOLE_TEXT = '电脑端入口';
const DEFAULT_GUEST_AVATAR = '/assets/guest-avatar.png';

Page({
    data: {
        isLogin: false,
        uid: '',
        userInfo: { nickname: '', avatarUrl: '' },
        summary: {
            examCount: 0,
            passCount: 0,
            bestScore: 0,
            averageScore: 0,
        },
        consoleProfile: {
            hasConsoleAccount: false,
            categoryCount: 0,
        },
        consoleStatusText: DEFAULT_CONSOLE_TEXT,
        consoleDialogVisible: false,
        consoleUrl: '',
        defaultAvatar: DEFAULT_GUEST_AVATAR,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    onLoad() {
        this.initNavBar();
    },

    initNavBar() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },

    onShow() {
        this.checkLoginStatus();
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
            this.getTabBar().setData({
                selected: 1,
            });
        }
    },

    async checkLoginStatus() {
        const openid = api.getUserId();
        const token = api.getToken();
        const isLogin = !!openid && !!token;

        this.setData({
            isLogin,
            uid: isLogin ? openid.substring(0, 8).toUpperCase() : '',
        });

        if (!isLogin) {
            this.setData({
                summary: {
                    examCount: 0,
                    passCount: 0,
                    bestScore: 0,
                    averageScore: 0,
                },
                userInfo: { nickname: '', avatarUrl: '' },
                consoleProfile: {
                    hasConsoleAccount: false,
                    categoryCount: 0,
                },
                consoleStatusText: DEFAULT_CONSOLE_TEXT,
            });
            return;
        }

        const savedProfile = wx.getStorageSync('user_profile') || { nickname: '', avatarUrl: '' };
        const localAvatar = api.getLocalAvatar(openid);
        this.setData({
            userInfo: {
                ...savedProfile,
                avatarUrl: localAvatar || savedProfile.avatarUrl || '',
            },
        });

        await Promise.all([
            this.loadUserSummary(),
            this.loadConsoleProfile(),
        ]);
    },

    async loadUserSummary() {
        try {
            const summary = await api.getUserSummary();
            this.setData({ summary });
        } catch (error) {
            console.error('Load user summary failed', error);
        }
    },

    async loadConsoleProfile() {
        try {
            const consoleProfile = await api.getConsoleProfile();
            this.setData({
                consoleProfile,
                consoleStatusText: consoleProfile.hasConsoleAccount
                    ? `${consoleProfile.categoryCount} 个题库`
                    : DEFAULT_CONSOLE_TEXT,
            });
        } catch (error) {
            console.error('Load console profile failed', error);
        }
    },

    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
        const { avatarUrl } = e.detail;
        const openid = api.getUserId();

        api.setLocalAvatar(avatarUrl, openid);

        const savedProfile = wx.getStorageSync('user_profile') || { nickname: '', avatarUrl: '' };
        const nextProfile = {
            ...savedProfile,
            avatarUrl,
        };

        wx.setStorageSync('user_profile', nextProfile);
        this.setData({ userInfo: nextProfile });
    },

    onNicknameBlur(e: WechatMiniprogram.InputBlur) {
        const nickname = e.detail.value;
        this.setData({
            'userInfo.nickname': nickname,
        });
        this.saveProfile();
    },

    onNicknameInput(e: WechatMiniprogram.Input) {
        this.setData({
            'userInfo.nickname': e.detail.value,
        });
    },

    async saveProfile() {
        try {
            const { nickname, avatarUrl } = this.data.userInfo;
            await api.updateUserProfile({ nickname });

            const savedProfile = wx.getStorageSync('user_profile') || {};
            wx.setStorageSync('user_profile', {
                ...savedProfile,
                nickname,
                avatarUrl,
            });
        } catch (error) {
            console.error('Auto sync failed', error);
        }
    },

    onLogin() {
        wx.navigateTo({
            url: ROUTES.AUTH_LOGIN,
        });
    },

    async goToWrongBook() {
        const nextUrl = buildPageUrl(ROUTES.WRONG_BOOK);
        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能查看同步错题本，是否前往登录？',
                nextUrl,
            });
            return;
        }

        wx.navigateTo({
            url: nextUrl,
        });
    },

    goToQuestionSearch() {
        wx.navigateTo({
            url: ROUTES.QUESTION_SEARCH,
        });
    },

    async goToStudyReport() {
        const nextUrl = buildPageUrl(ROUTES.STUDY_REPORT);
        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能查看学习报告，是否前往登录？',
                nextUrl,
            });
            return;
        }

        wx.navigateTo({
            url: nextUrl,
        });
    },

    async goToScanLogin() {
        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '请先登录小程序，再确认电脑端扫码登录。',
                nextUrl: ROUTES.SCAN_LOGIN,
            });
            return;
        }

        wx.navigateTo({
            url: ROUTES.SCAN_LOGIN,
        });
    },

    async goToCreatorConsole() {
        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '请先登录小程序，再查看个人题库后台入口。',
                nextUrl: ROUTES.PROFILE,
            });
            return;
        }

        const rawConsolePath = this.data.consoleProfile.consolePath || '';
        const consolePath = rawConsolePath === '/' || rawConsolePath === '/login.html' ? '' : rawConsolePath;
        const consoleUrl = `${runtimeConfig.consoleBaseUrl.replace(/\/$/, '')}${consolePath}`;

        this.setData({
            consoleUrl,
            consoleDialogVisible: true,
        });
    },

    closeConsoleDialog() {
        this.setData({
            consoleDialogVisible: false,
        });
    },

    copyConsoleUrl() {
        wx.setClipboardData({
            data: this.data.consoleUrl,
            success: () => {
                wx.showToast({ title: '地址已复制', icon: 'success' });
            },
        });
    },

    async openScanLoginFromDialog() {
        this.closeConsoleDialog();
        await this.goToScanLogin();
    },

    noop() {
        // Used by WXML catchtap to stop mask click-through.
    },

    goToAccountManage() {
        wx.navigateTo({
            url: ROUTES.ACCOUNT_MANAGE,
        });
    },
});
