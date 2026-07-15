import request from '../../../utils/request';
import { ensureAuthorized, getToken } from '../../../utils/auth';

Page({
    _navTimer: null as number | null,
    data: {
        qrToken: '',
        appName: '未知网站',
        loading: false,
        loadingText: '正在处理...'
    },

    onLoad(options: any) {
        let qrToken = '';
        let appName = '未知网站';
        let isWxScan = false;

        // 1. 优先尝试从 options.scene 获取（微信小程序码）
        if (options && options.scene) {
            qrToken = decodeURIComponent(options.scene);
            isWxScan = true;
        }

        // 2. 尝试从 options.q 获取（扫普通链接二维码跳转小程序）
        if (!qrToken && options && options.q) {
            try {
                const url = decodeURIComponent(options.q);
                if (url.includes('t=')) {
                    qrToken = url.split('t=')[1].split('&')[0];
                    isWxScan = true;
                } else if (url.includes('scene=')) {
                    qrToken = url.split('scene=')[1].split('&')[0];
                    isWxScan = true;
                }
            } catch (err) {
                console.error('解析 options.q 失败:', err);
            }
        }

        // 3. 兜底：从微信启动参数 getLaunchOptionsSync 中获取
        if (!qrToken) {
            try {
                const launchOptions = wx.getLaunchOptionsSync();
                if (launchOptions && launchOptions.query) {
                    if (launchOptions.query.scene) {
                        qrToken = decodeURIComponent(launchOptions.query.scene);
                        isWxScan = true;
                    } else if (launchOptions.query.q) {
                        const url = decodeURIComponent(launchOptions.query.q);
                        if (url.includes('t=')) {
                            qrToken = url.split('t=')[1].split('&')[0];
                            isWxScan = true;
                        } else if (url.includes('scene=')) {
                            qrToken = url.split('scene=')[1].split('&')[0];
                            isWxScan = true;
                        }
                    }
                }
            } catch (err) {
                console.error('getLaunchOptionsSync 提取失败:', err);
            }
        }

        // 4. 如果是小程序内直接跳转进入（非微信扫一扫），尝试读取 options.t
        if (!qrToken && options && options.t) {
            qrToken = options.t;
            appName = decodeURIComponent(options.n || '未知网站');
        }

        // 5. 根据提取结果进行路由分发
        if (qrToken) {
            if (isWxScan) {
                this.setData({ loading: true });
                this.handleWxScan(qrToken);
            } else {
                this.setData({
                    qrToken: qrToken,
                    appName: appName
                });
            }
        } else {
            wx.showToast({ title: '参数错误', icon: 'none' });
            this._navTimer = setTimeout(() => {
                this._navTimer = null;
                const pages = getCurrentPages();
                if (pages.length > 1) {
                    wx.navigateBack();
                } else {
                    wx.reLaunch({ url: '/pages/index/index' });
                }
            }, 1500);
        }
    },

    async handleWxScan(qrToken: string) {
        try {
            // 步骤1：确保用户已授权登录
            this.setData({ loadingText: '正在登录...' });
            await ensureAuthorized();

            // 步骤2：检查是否有 token（已注册用户）
            const token = getToken();
            if (!token) {
                this.setData({ loading: false });
                wx.showModal({
                    title: '提示',
                    content: '您尚未注册，请先在小程序中完成注册后再扫码登录',
                    showCancel: false,
                    confirmText: '去登录',
                    success: () => {
                        wx.reLaunch({ url: '/pages/index/index' });
                    }
                });
                return;
            }

            // 步骤3：调用扫码接口
            this.setData({ loadingText: '正在验证二维码...' });
            const scanRes = await request<any>('/mp/auth/scan', 'POST', { qrToken });

            if (scanRes && scanRes.success) {
                this.setData({
                    loading: false,
                    qrToken: qrToken,
                    appName: scanRes.appName || '管理后台'
                });
            } else {
                this.setData({ loading: false });
                wx.showModal({
                    title: '扫码失败',
                    content: scanRes?.message || '二维码无效或已过期，请重新扫码',
                    showCancel: false,
                    confirmText: '返回首页',
                    success: () => {
                        wx.reLaunch({ url: '/pages/index/index' });
                    }
                });
            }
        } catch (err) {
            console.error('handleWxScan error:', err);
            this.setData({ loading: false });
            wx.showModal({
                title: '扫码失败',
                content: '网络错误或二维码已过期，请重新扫码',
                showCancel: false,
                confirmText: '返回首页',
                success: () => {
                    wx.reLaunch({ url: '/pages/index/index' });
                }
            });
        }
    },

    onUnload() {
        if (this._navTimer) {
            clearTimeout(this._navTimer);
            this._navTimer = null;
        }
    },

    async onConfirm() {
        try {
            wx.showLoading({ title: '正在登录...' });
            const res = await request<any>('/mp/auth/confirm', 'POST', {
                qrToken: this.data.qrToken
            });
            wx.hideLoading();

            if (res && res.success) {
                wx.showToast({ title: '登录成功' });
                if (this._navTimer) {
                    clearTimeout(this._navTimer);
                }
                this._navTimer = setTimeout(() => {
                    this._navTimer = null;
                    wx.reLaunch({ url: '/pages/index/index' });
                }, 1000);
            } else {
                wx.showToast({ title: res.message || '登录失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '网络错误', icon: 'none' });
        }
    },

    async onCancel() {
        wx.showLoading({ title: '正在取消...' });
        try {
            await request<any>('/mp/auth/reject', 'POST', {
                qrToken: this.data.qrToken
            });
        } catch (err) {
            console.error('Cancel request failed:', err);
        } finally {
            wx.hideLoading();
            wx.navigateBack();
        }
    }
});
