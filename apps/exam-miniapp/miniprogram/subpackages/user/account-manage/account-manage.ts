import { runtimeConfig } from '../../../config/runtime';
import { api } from '../../../services/api';
import { getNavBarInfo } from '../../../utils/nav';

Page({
    data: {
        appName: runtimeConfig.appName,
        supportEmail: runtimeConfig.supportEmail,
        uid: '',
        isLogin: false,
        submitting: false,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    onLoad() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });
    },

    onShow() {
        const openid = api.getUserId();
        const token = api.getToken();
        this.setData({
            isLogin: !!openid && !!token,
            uid: openid ? openid.substring(0, 8).toUpperCase() : '',
        });
    },

    async onLogout() {
        if (!this.data.isLogin) {
            wx.showToast({ title: '当前未登录', icon: 'none' });
            return;
        }

        const result = await wx.showModal({
            title: '退出登录',
            content: '退出后会清除当前设备上的登录状态和本地缓存，确定继续吗？',
            confirmText: '退出',
            cancelText: '取消',
        });

        if (result.cancel) {
            return;
        }

        api.clearSession();
        wx.showToast({ title: '已退出登录', icon: 'success' });
        setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
        }, 300);
    },

    async onDeleteAccount() {
        if (!this.data.isLogin || this.data.submitting) {
            if (!this.data.isLogin) {
                wx.showToast({ title: '请先登录', icon: 'none' });
            }
            return;
        }

        const firstConfirm = await wx.showModal({
            title: '注销账号',
            content: '注销后会删除你的账号、考试记录和做题进度，且无法恢复。',
            confirmText: '继续注销',
            cancelText: '取消',
            confirmColor: '#dc2626',
        });
        if (firstConfirm.cancel) {
            return;
        }

        const secondConfirm = await wx.showModal({
            title: '再次确认',
            content: '这是最后一步确认。删除后你的学习数据将无法找回。',
            confirmText: '确认删除',
            cancelText: '返回',
            confirmColor: '#b91c1c',
        });
        if (secondConfirm.cancel) {
            return;
        }

        this.setData({ submitting: true });
        try {
            await api.deleteAccount();
            wx.showToast({ title: '账号已注销', icon: 'success' });
            setTimeout(() => {
                wx.reLaunch({ url: '/pages/index/index' });
            }, 500);
        } catch (error) {
            console.error('Delete account failed', error);
        } finally {
            this.setData({ submitting: false });
        }
    },

    goToPrivacyPolicy() {
        wx.navigateTo({
            url: '/subpackages/user/privacy-policy/privacy-policy',
        });
    },

    goToUserAgreement() {
        wx.navigateTo({
            url: '/subpackages/user/user-agreement/user-agreement',
        });
    },
});
