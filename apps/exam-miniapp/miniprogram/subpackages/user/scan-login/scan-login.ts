import { api, PaperSharePreview, ScanLoginSession } from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';

function extractQrToken(raw: string) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const directMatch = text.match(/^[0-9a-f]{48}$/i);
    if (directMatch) {
        return directMatch[0].toLowerCase();
    }

    const queryMatch = text.match(/[?&](?:qrToken|t)=([0-9a-f]{48})/i);
    if (queryMatch) {
        return queryMatch[1].toLowerCase();
    }

    const schemeMatch = text.match(/qrToken=([0-9a-f]{48})/i);
    if (schemeMatch) {
        return schemeMatch[1].toLowerCase();
    }

    return '';
}

function extractSceneToken(raw: string) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const directMatch = text.match(/^[0-9a-f]{16}$/i);
    if (directMatch) {
        return directMatch[0].toLowerCase();
    }

    const sceneMatch = text.match(/(?:^|[?&])s=([0-9a-f]{16})(?:$|[&#])/i)
        || text.match(/(?:^|[?&])scene=([0-9a-f]{16})(?:$|[&#])/i)
        || text.match(/(?:^|[?&])scene=s%3D([0-9a-f]{16})(?:$|[&#])/i)
        || text.match(/s=([0-9a-f]{16})/i);
    if (sceneMatch) {
        return sceneMatch[1].toLowerCase();
    }

    return '';
}

function extractQrTokenFromOption(raw?: string) {
    let text = String(raw || '').trim();
    if (!text) return '';

    for (let index = 0; index < 3; index += 1) {
        const token = extractQrToken(text) || extractSceneToken(text);
        if (token) {
            return token;
        }

        let decoded = text;
        try {
            decoded = decodeURIComponent(text);
        } catch (error) {
            void error;
        }

        if (decoded === text) {
            break;
        }
        text = decoded;
    }

    return '';
}

function extractLaunchQrToken(options: Record<string, string>) {
    const candidates = [
        options.qrToken,
        options.t,
        options.scene,
        options.q,
    ];

    for (const candidate of candidates) {
        const token = extractQrTokenFromOption(candidate);
        if (token) {
            return token;
        }
    }

    return '';
}

function normalizeShareCode(value: string) {
    let text = String(value || '').trim();
    try {
        text = decodeURIComponent(text);
    } catch (error) {
        void error;
        // Keep the raw text when it is not a URI-encoded value.
    }
    return text.replace(/[\s-]/g, '').toUpperCase();
}

function extractShareCode(raw: string) {
    const text = String(raw || '').trim();
    if (!text) return '';

    const queryMatch = text.match(/[?&](?:shareCode|code)=([A-Z0-9-]{6,20})/i);
    if (queryMatch) {
        return normalizeShareCode(queryMatch[1]);
    }

    const schemeMatch = text.match(/(?:shareCode|code)=([A-Z0-9-]{6,20})/i);
    if (schemeMatch) {
        return normalizeShareCode(schemeMatch[1]);
    }

    const directCode = normalizeShareCode(text);
    if (/^[A-Z0-9]{6,16}$/.test(directCode)) {
        return directCode;
    }

    return '';
}

function getShareCategoryName(preview: PaperSharePreview | null) {
    return preview && preview.sourceCategory && preview.sourceCategory.name
        ? preview.sourceCategory.name
        : '试卷分享';
}

function getShareQuestionCount(preview: PaperSharePreview | null) {
    return preview && preview.sourceCategory ? preview.sourceCategory.count || 0 : 0;
}

function getShareSaveLocation(preview: PaperSharePreview | null) {
    const categoryName = preview && preview.importedCategory && preview.importedCategory.name
        ? preview.importedCategory.name
        : getShareCategoryName(preview);
    return categoryName
        ? `我的题库 / 来自分享 / ${categoryName}`
        : '我的题库 / 来自分享';
}

function getSessionDescription(session: ScanLoginSession) {
    if (session.intent === 'admin_bind') {
        return '确认后，将完成当前微信与管理员账号的绑定。';
    }

    return '确认后，电脑端将自动完成登录。';
}

function padTime(value: number) {
    return String(value).padStart(2, '0');
}

function formatSessionTime(value?: string) {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return '';
    }

    return `${padTime(date.getMonth() + 1)}-${padTime(date.getDate())} ${padTime(date.getHours())}:${padTime(date.getMinutes())}`;
}

function getErrorMessage(error: any, fallback: string) {
    if (error && typeof error.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }

    return fallback;
}

function getScanErrorState(error: any) {
    const message = getErrorMessage(error, '二维码校验失败，请刷新电脑端二维码后重试。');
    const statusCode = error && error.statusCode;

    if (message.includes('已使用')) {
        return {
            stateTone: 'warning',
            stateLabel: '已使用',
            stateTitle: '二维码已使用',
            statusText: '这张二维码已经完成过登录。请在电脑端刷新二维码后重新扫描。',
        };
    }

    if (message.includes('过期')) {
        return {
            stateTone: 'warning',
            stateLabel: '已过期',
            stateTitle: '二维码已过期',
            statusText: '为了保障账号安全，请在电脑端刷新二维码后重新扫描。',
        };
    }

    if (message.includes('其他微信') || statusCode === 409) {
        return {
            stateTone: 'warning',
            stateLabel: '已被占用',
            stateTitle: '请更换二维码',
            statusText: '这张二维码已被其他微信账号扫码。请在电脑端刷新二维码后重新扫描。',
        };
    }

    if (message.includes('不存在') || message.includes('失效') || message.includes('无效')) {
        return {
            stateTone: 'warning',
            stateLabel: '已失效',
            stateTitle: '二维码不可用',
            statusText: '这张二维码已失效。请回到电脑端刷新二维码后重新扫描。',
        };
    }

    if (message.includes('登录状态')) {
        return {
            stateTone: 'warning',
            stateLabel: '需要登录',
            stateTitle: '请重新登录小程序',
            statusText: '当前小程序登录状态已失效，请重新登录后再扫码确认。',
        };
    }

    return {
        stateTone: 'error',
        stateLabel: '校验失败',
        stateTitle: '暂时无法校验',
        statusText: message,
    };
}

function getConfirmErrorState(error: any) {
    const state = getScanErrorState(error);
    if (state.stateTone === 'error') {
        return {
            ...state,
            stateLabel: '确认失败',
            stateTitle: '暂时无法确认',
        };
    }

    return state;
}

function getUnavailableSessionState(session: ScanLoginSession) {
    const message = session.description || '二维码不可用，请重新扫码。';

    if (session.status === 'consumed') {
        return {
            stateTone: 'warning',
            stateLabel: '已使用',
            stateTitle: '二维码已使用',
            statusText: '这张二维码已经完成过登录。请在电脑端刷新二维码后重新扫描。',
        };
    }

    if (session.status === 'expired') {
        return {
            stateTone: 'warning',
            stateLabel: '已过期',
            stateTitle: '二维码已过期',
            statusText: '为了保障账号安全，请在电脑端刷新二维码后重新扫描。',
        };
    }

    if (session.status === 'scanned') {
        return {
            stateTone: 'warning',
            stateLabel: '已被占用',
            stateTitle: '请更换二维码',
            statusText: '这张二维码已被其他微信账号扫码。请在电脑端刷新二维码后重新扫描。',
        };
    }

    return {
        stateTone: 'warning',
        stateLabel: '已失效',
        stateTitle: session.title || '二维码不可用',
        statusText: message,
    };
}

Page({
    data: {
        isLogin: false,
        scanning: false,
        confirming: false,
        hasSession: false,
        confirmed: false,
        stateTone: 'idle',
        stateLabel: '扫码',
        stateTitle: '扫描二维码',
        statusText: '可以扫描电脑端登录二维码，也可以扫描试卷分享码接收题库。',
        qrToken: '',
        session: null as ScanLoginSession | null,
        sessionRequestTime: '',
        sessionRequestIp: '',
        shareCode: '',
        sharePreview: null as PaperSharePreview | null,
        shareSaveLocation: '',
        acceptingShare: false,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
    },

    onLoad(options: Record<string, string>) {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
            isLogin: api.isLoggedIn(),
        });

        const launchQrToken = extractLaunchQrToken(options);
        if (launchQrToken) {
            this.handleQrToken(launchQrToken);
            return;
        }

        if (options.shareCode) {
            const shareCode = extractShareCode(String(options.shareCode));
            if (shareCode) {
                this.handlePaperShareCode(shareCode);
            }
        }
    },

    onShow() {
        this.setData({
            isLogin: api.isLoggedIn(),
        });
    },

    onBack() {
        if (getCurrentPages().length > 1) {
            wx.navigateBack();
            return;
        }

        wx.switchTab({ url: '/pages/profile/profile' });
    },

    onDone() {
        this.onBack();
    },

    async onGoLogin() {
        const nextParams: Record<string, string> = {};
        if (this.data.qrToken) {
            nextParams.qrToken = this.data.qrToken;
        }
        if (this.data.shareCode) {
            nextParams.shareCode = this.data.shareCode;
        }

        await promptLogin({
            message: '请先登录小程序，再继续扫码操作。',
            nextUrl: buildPageUrl('/subpackages/user/scan-login/scan-login', nextParams),
        });
    },

    async onStartScan() {
        if (!api.isLoggedIn()) {
            await this.onGoLogin();
            return;
        }

        if (this.data.scanning) {
            return;
        }

        this.setData({
            scanning: true,
            confirming: false,
            hasSession: false,
            confirmed: false,
            session: null,
            sessionRequestTime: '',
            sessionRequestIp: '',
            qrToken: '',
            shareCode: '',
            sharePreview: null,
            shareSaveLocation: '',
            acceptingShare: false,
            stateTone: 'loading',
            stateLabel: '正在扫码',
            stateTitle: '打开相机',
            statusText: '请将手机摄像头对准电脑端登录二维码或试卷分享码。',
        });

        wx.scanCode({
            onlyFromCamera: true,
            success: async (res) => {
                const scanText = res.result || res.path || '';
                const qrToken = extractQrTokenFromOption(scanText);
                if (qrToken) {
                    await this.handleQrToken(qrToken);
                    return;
                }

                const shareCode = extractShareCode(scanText);
                if (shareCode) {
                    await this.handlePaperShareCode(shareCode);
                    return;
                }

                this.setData({
                    scanning: false,
                    stateTone: 'error',
                    stateLabel: '二维码无效',
                    stateTitle: '请重新扫描',
                    statusText: '未识别到有效的电脑端登录二维码或试卷分享码，请确认二维码来源后重试。',
                });
                wx.showToast({ title: '二维码无效', icon: 'none' });
            },
            fail: (error) => {
                console.error('scan login qrcode failed', error);
                this.setData({
                    scanning: false,
                    stateTone: 'idle',
                    stateLabel: '扫码',
                    stateTitle: '扫描二维码',
                    statusText: '已取消扫码。准备好后，可以重新扫描电脑端二维码或试卷分享码。',
                });
            },
        });
    },

    async handleQrToken(qrToken: string) {
        this.setData({
            scanning: true,
            qrToken,
            shareCode: '',
            sharePreview: null,
            shareSaveLocation: '',
            acceptingShare: false,
            confirmed: false,
            stateTone: 'loading',
            stateLabel: '校验中',
            stateTitle: '正在确认二维码',
            statusText: '二维码已识别，正在校验登录请求。',
        });

        try {
            const session = await api.scanLoginQrCode(qrToken);
            if (session.unavailable) {
                const state = getUnavailableSessionState(session);
                this.setData({
                    scanning: false,
                    hasSession: false,
                    confirmed: false,
                    session: null,
                    sessionRequestTime: '',
                    sessionRequestIp: '',
                    qrToken: '',
                    ...state,
                });
                return;
            }

            this.setData({
                scanning: false,
                hasSession: true,
                confirmed: false,
                qrToken,
                session,
                sessionRequestTime: formatSessionTime(session.createTime),
                sessionRequestIp: session.requestIp || '',
                stateTone: 'ready',
                stateLabel: '待确认',
                stateTitle: session.title || '登录确认',
                statusText: getSessionDescription(session),
            });
        } catch (error: any) {
            console.error('scan login validation failed', error);
            const state = getScanErrorState(error);
            this.setData({
                scanning: false,
                hasSession: false,
                confirmed: false,
                session: null,
                sessionRequestTime: '',
                sessionRequestIp: '',
                ...state,
            });
        }
    },

    async handlePaperShareCode(shareCode: string) {
        const normalizedShareCode = normalizeShareCode(shareCode);
        if (!normalizedShareCode) {
            return;
        }

        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '请先登录小程序，再接收试卷分享。',
                nextUrl: buildPageUrl('/subpackages/user/scan-login/scan-login', {
                    shareCode: normalizedShareCode,
                }),
            });
            return;
        }

        this.setData({
            scanning: true,
            confirming: false,
            hasSession: false,
            confirmed: false,
            session: null,
            sessionRequestTime: '',
            sessionRequestIp: '',
            qrToken: '',
            shareCode: normalizedShareCode,
            sharePreview: null,
            shareSaveLocation: '',
            acceptingShare: false,
            stateTone: 'loading',
            stateLabel: '识别中',
            stateTitle: '正在识别分享码',
            statusText: '二维码已识别，正在读取试卷分享信息。',
        });

        try {
            const preview = await api.previewPaperShare(normalizedShareCode);
            const alreadyAccepted = !!preview.alreadyAccepted;
            this.setData({
                scanning: false,
                sharePreview: preview,
                shareSaveLocation: getShareSaveLocation(preview),
                stateTone: alreadyAccepted ? 'success' : 'ready',
                stateLabel: alreadyAccepted ? '已接收' : '待接收',
                stateTitle: getShareCategoryName(preview),
                statusText: alreadyAccepted
                    ? '你已经接收过这份分享，回到首页即可练习。'
                    : `确认后会把这份试卷加入你的个人题库，共 ${getShareQuestionCount(preview)} 道题。`,
            });
        } catch (error: any) {
            console.error('preview paper share failed', error);
            const message = getErrorMessage(error, '分享码无效或已失效，请重新扫描。');
            this.setData({
                scanning: false,
                sharePreview: null,
                shareSaveLocation: '',
                stateTone: 'error',
                stateLabel: '分享码无效',
                stateTitle: '请重新扫描',
                statusText: message,
            });
            wx.showToast({ title: message, icon: 'none' });
        }
    },

    async onAcceptPaperShare() {
        const shareCode = this.data.shareCode;
        const sharePreview = this.data.sharePreview;
        if (!shareCode || this.data.acceptingShare) {
            return;
        }

        if (sharePreview && sharePreview.alreadyAccepted) {
            wx.switchTab({ url: '/pages/index/index' });
            return;
        }

        this.setData({
            acceptingShare: true,
            stateTone: 'loading',
            stateLabel: '接收中',
            stateTitle: getShareCategoryName(sharePreview),
            statusText: '正在把这份试卷加入你的个人题库。',
        });

        try {
            const result = await api.acceptPaperShare(shareCode);
            const nextPreview: PaperSharePreview = {
                share: result.share,
                sourceCategory: sharePreview && sharePreview.sourceCategory ? sharePreview.sourceCategory : null,
                alreadyAccepted: true,
                importedCategory: result.category,
            };

            this.setData({
                acceptingShare: false,
                scanning: false,
                sharePreview: nextPreview,
                shareSaveLocation: getShareSaveLocation(nextPreview),
                stateTone: 'success',
                stateLabel: result.created ? '接收成功' : '已接收',
                stateTitle: '已加入我的题库',
                statusText: result.created
                    ? `已保存到：${getShareSaveLocation(nextPreview)}。回到首页即可练习。`
                    : `你已经接收过这份分享，保存位置：${getShareSaveLocation(nextPreview)}。`,
            });
            wx.showToast({ title: result.created ? '接收成功' : '已接收', icon: 'success' });
        } catch (error: any) {
            console.error('accept paper share failed', error);
            const message = getErrorMessage(error, '接收分享失败，请稍后重试。');
            this.setData({
                acceptingShare: false,
                stateTone: 'error',
                stateLabel: '接收失败',
                stateTitle: getShareCategoryName(sharePreview),
                statusText: message,
            });
            wx.showToast({ title: message, icon: 'none' });
        }
    },

    async onConfirm() {
        if (!this.data.qrToken || this.data.confirming) {
            return;
        }

        this.setData({
            confirming: true,
            stateTone: 'loading',
            stateLabel: '确认中',
            stateTitle: this.data.session ? this.data.session.title : '正在确认',
            statusText: '正在安全确认，请稍候。',
        });

        try {
            const session = await api.confirmScanLogin(this.data.qrToken);
            if (session.unavailable) {
                const state = getUnavailableSessionState(session);
                this.setData({
                    confirming: false,
                    hasSession: false,
                    confirmed: false,
                    session: null,
                    sessionRequestTime: '',
                    sessionRequestIp: '',
                    qrToken: '',
                    ...state,
                });
                return;
            }

            this.setData({
                confirming: false,
                confirmed: true,
                session,
                sessionRequestTime: formatSessionTime(session.createTime),
                sessionRequestIp: session.requestIp || '',
                stateTone: 'success',
                stateLabel: '已确认',
                stateTitle: '操作已完成',
                statusText: '电脑端将自动继续，请回到电脑查看结果。',
            });
            wx.showToast({ title: '确认成功', icon: 'success' });
        } catch (error: any) {
            console.error('confirm scan login failed', error);
            const state = getConfirmErrorState(error);
            this.setData({
                confirming: false,
                confirmed: false,
                ...state,
            });
        }
    },
});
