import { nextTick, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchWithTimeout as platformFetchWithTimeout } from '@/utils/runtime';
import { createSequentialPoller as defaultPollerFactory } from '@/utils/sequentialPoller';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

/**
 * 微信扫码绑定域：二维码创建、状态轮询、绑定与解绑。
 *
 * `refreshUserInfo` 由调用方注入（绑定成功后要刷新用户信息，该函数属于用户域）；
 * `renderQrcodeToElement` 同样注入，它与试卷分享共用同一份实现。
 * `fetchWithTimeout` 与 `createSequentialPoller` 默认取平台实现，仅测试时覆盖。
 */
export function useWechatBinding({
    adminApi,
    isConsoleMode,
    getScanLoginConfig,
    renderQrcodeToElement,
    refreshUserInfo = async () => {},
    message = ElMessage,
    messageBox = ElMessageBox,
    fetchWithTimeout = platformFetchWithTimeout,
    createSequentialPoller = defaultPollerFactory,
} = {}) {
    const bindDialog = reactive({
        visible: false,
        qrToken: '',
        pollToken: '',
        statusText: '正在获取二维码...'
    });
    let bindPoller = null;
    let bindPollErrorCount = 0;
    let bindCreateController = null;
    let bindCreateSequence = 0;

    const startBindPolling = () => {
        stopBindPolling();
        bindPoller = createSequentialPoller(async (signal) => {
            const res = await fetchWithTimeout(
                `${getScanLoginConfig().apiBase}/qrcode/status?qrToken=${encodeURIComponent(bindDialog.qrToken)}&pollToken=${encodeURIComponent(bindDialog.pollToken)}`,
                { cache: 'no-store', signal },
                8000,
            );
            const payload = await res.json();
            if (!res.ok || payload.code !== 0) {
                throw new Error(payload.message || '二维码状态获取失败');
            }
            bindPollErrorCount = 0;
            const data = payload.data || payload;

            if (data.status === 'scanned') {
                bindDialog.statusText = '已扫码，请在手机确认';
            } else if (data.status === 'confirmed') {
                sessionStorage.removeItem('bind_qr_token');
                sessionStorage.removeItem('bind_qr_poll_token');
                bindDialog.statusText = '验证成功，正在绑定...';
                await doBind(data.tempAuthCode);
                return false;
            } else if (data.status === 'expired' || data.status === 'cancelled') {
                sessionStorage.removeItem('bind_qr_token');
                sessionStorage.removeItem('bind_qr_poll_token');
                bindDialog.statusText = '二维码已过期，请刷新';
                return false;
            }
            return true;
        }, {
            interval: 2000,
            onError: () => {
                bindPollErrorCount += 1;
                if (bindPollErrorCount >= 3) {
                    bindDialog.statusText = '二维码状态获取失败，请刷新后重试';
                    return false;
                }
                return true;
            },
        });
        bindPoller.start();
    };

    const stopBindPolling = () => {
        bindPoller?.stop();
        bindPoller = null;
    };

    const stopBindCreation = () => {
        bindCreateSequence += 1;
        bindCreateController?.abort();
        bindCreateController = null;
    };

    const stopBindRequests = () => {
        stopBindPolling();
        stopBindCreation();
    };

    const doBind = async (tempAuthCode) => {
        try {
            const res = await adminApi.bindWechat(tempAuthCode);
            if (res.data.code === 0) {
                message.success('绑定成功');
                bindDialog.visible = false;
                refreshUserInfo();
            } else {
                bindDialog.statusText = res.data.message;
                message.error(res.data.message);
            }
        } catch (err) {
            message.error(err.response?.data?.message || '绑定失败');
            bindDialog.statusText = '绑定失败';
        }
    };

    const initBindQrcode = async () => {
        stopBindRequests();
        bindPollErrorCount = 0;

        if (!getScanLoginConfig().enabled) {
            bindDialog.statusText = '扫码绑定未开启';
            return;
        }

        const requestSequence = bindCreateSequence;
        const controller = new AbortController();
        bindCreateController = controller;

        const oldQrToken = sessionStorage.getItem('bind_qr_token') || '';

        try {
            const requestBody = {
                intent: 'admin_bind',
            };
            if (oldQrToken) {
                requestBody.oldQrToken = oldQrToken;
            }
            const res = await fetchWithTimeout(`${getScanLoginConfig().apiBase}/qrcode/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });
            const payload = await res.json();
            if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
            const data = payload.data || payload;
            if (res.ok && payload.code === 0 && data.qrToken && data.pollToken) {
                bindDialog.qrToken = data.qrToken;
                bindDialog.pollToken = data.pollToken;
                sessionStorage.setItem('bind_qr_token', data.qrToken);
                sessionStorage.setItem('bind_qr_poll_token', data.pollToken);

                const codeContent = data.qrCodeText || `miniprogram-login://scan?qrToken=${data.qrToken}`;

                nextTick(async () => {
                    try {
                        if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                        await renderQrcodeToElement(document.getElementById('bind-qrcode'), codeContent, 180);
                        if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
                    } catch (err) {
                        console.error('Render bind QR code error:', err);
                        bindDialog.statusText = '二维码生成失败，请刷新后重试';
                    }
                });

                bindDialog.statusText = '请在小程序“我的 -> 扫码登录电脑端”中扫码';
                startBindPolling();
            } else {
                bindDialog.statusText = '二维码获取失败: ' + ((payload && payload.message) || '未知错误');
            }
        } catch (err) {
            if (controller.signal.aborted || requestSequence !== bindCreateSequence) return;
            bindDialog.statusText = '网络请求失败，请稍后重试';
        } finally {
            if (bindCreateController === controller) {
                bindCreateController = null;
            }
        }
    };

    const openBindDialog = () => {
        if (readFlag(isConsoleMode)) {
            message.info('个人题库身份使用扫码登录，无需单独绑定微信');
            return;
        }
        if (!getScanLoginConfig().enabled) {
            message.warning('扫码绑定暂未开启');
            return;
        }
        bindDialog.visible = true;
        bindDialog.statusText = '正在获取二维码...';
        // Clear old code
        nextTick(() => {
            if (document.getElementById('bind-qrcode')) {
                document.getElementById('bind-qrcode').innerHTML = '';
            }
        });
        initBindQrcode();
    };

    const unbindWechat = async () => {
        if (readFlag(isConsoleMode)) {
            return;
        }
        try {
            await messageBox.confirm('确定解除与微信的绑定吗？解除后将无法使用扫码登录。', '提示', {
                confirmButtonText: '确定解绑',
                cancelButtonText: '取消',
                type: 'warning'
            });

            const res = await adminApi.unbindWechat();
            if (res.data.code === 0) {
                message.success('解绑成功');
                refreshUserInfo();
            }
        } catch (err) {
            if (err !== 'cancel') {
                message.error(err.response?.data?.message || '解绑失败');
            }
        }
    };

    return {
        bindDialog,
        openBindDialog,
        stopBindRequests,
        unbindWechat,
    };
}
