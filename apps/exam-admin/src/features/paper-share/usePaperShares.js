import { nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

/**
 * 试卷分享域：分享弹窗表单、二维码渲染调度、分享记录列表与撤销、试卷分析弹窗。
 *
 * 状态（shareDialog / analysisDialog）由调用方持有并注入，因为同一批 state 被
 * Dialog States 段与多处 computed 共享；本 composable 只负责行为。
 * `renderQrcodeToElement` 同样注入：它与 Bind Logic 共用同一份实现。
 */
export function usePaperShares({
    adminApi,
    shareDialog,
    analysisDialog,
    isDemoManage,
    renderQrcodeToElement,
    message = ElMessage,
    messageBox = ElMessageBox,
} = {}) {
    const resetShareForm = () => {
        Object.assign(shareDialog.form, {
            permission: 'view',
            expireMode: '7d',
            customExpiresAt: '',
            maxAcceptEnabled: false,
            maxAcceptCount: 0,
            note: ''
        });
        shareDialog.result = null;
        shareDialog.selectedShareId = '';
    };

    const buildShareExpiresAt = () => {
        const mode = shareDialog.form.expireMode;
        if (mode === 'forever') return null;
        if (mode === 'custom') {
            return shareDialog.form.customExpiresAt || null;
        }

        const daysMap = {
            '1d': 1,
            '7d': 7,
            '30d': 30
        };
        const days = daysMap[mode] || 7;
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    };

    const renderShareQrcode = (scrollToResult = false) => {
        nextTick(async () => {
            const el = document.getElementById('paper-share-qrcode');
            if (!el || !shareDialog.result) return;
            const text = shareDialog.result.shareUrl || shareDialog.result.shareCode;
            try {
                await renderQrcodeToElement(el, text, 180);
                if (scrollToResult) {
                    document.querySelector('.share-result-panel')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                    });
                }
            } catch (err) {
                console.error('Render share QR code error:', err);
                message.error('二维码生成失败，请复制分享链接');
            }
        });
    };

    const getPaperShareIdentity = (share) => String(share?._id || share?.shareCode || '');

    const selectPaperShare = (share) => {
        if (!share) return;
        shareDialog.result = { ...share };
        shareDialog.selectedShareId = getPaperShareIdentity(share);
        renderShareQrcode(true);
    };

    const getPaperShareRowClass = ({ row }) => (
        shareDialog.selectedShareId && getPaperShareIdentity(row) === shareDialog.selectedShareId
            ? 'is-selected-share'
            : ''
    );

    const loadPaperShares = async () => {
        if (!shareDialog.category?._id) return;
        shareDialog.loading = true;
        try {
            const res = await adminApi.listPaperShares(shareDialog.category._id);
            shareDialog.shares = res.data.data || [];
        } catch (err) {
            message.error('加载分享记录失败');
        } finally {
            shareDialog.loading = false;
        }
    };

    const openShareDialog = async (exam) => {
        if (readFlag(isDemoManage)) {
            message.warning('示例题库不支持分享');
            return;
        }
        if (exam?.readOnly) {
            message.warning('只读试卷不能继续分享');
            return;
        }

        shareDialog.category = exam;
        shareDialog.visible = true;
        resetShareForm();
        shareDialog.shares = [];
        await loadPaperShares();
    };

    const openCategoryAnalysis = async (exam) => {
        if (!exam?._id) return;

        analysisDialog.category = exam;
        analysisDialog.visible = true;
        analysisDialog.loading = true;
        analysisDialog.data = null;

        try {
            const res = await adminApi.getCategoryAnalysis(exam._id);
            analysisDialog.data = res.data.data;
        } catch (err) {
            console.error('Load category analysis error:', err);
            message.error(err.response?.data?.message || '加载试卷分析失败');
        } finally {
            analysisDialog.loading = false;
        }
    };

    const createPaperShare = async () => {
        if (!shareDialog.category?._id) return;
        const expiresAt = buildShareExpiresAt();
        if (shareDialog.form.expireMode === 'custom' && !expiresAt) {
            message.warning('请选择自定义过期时间');
            return;
        }

        shareDialog.saving = true;
        try {
            const res = await adminApi.createPaperShare(shareDialog.category._id, {
                permission: shareDialog.form.permission,
                expiresAt,
                maxAcceptCount: shareDialog.form.maxAcceptEnabled
                    ? Number(shareDialog.form.maxAcceptCount || 0)
                    : 0,
                note: shareDialog.form.note || ''
            });
            shareDialog.result = res.data.data;
            shareDialog.selectedShareId = getPaperShareIdentity(shareDialog.result);
            message.success('分享已生成');
            await loadPaperShares();
            renderShareQrcode();
        } catch (err) {
            message.error(err.response?.data?.message || '生成分享失败');
        } finally {
            shareDialog.saving = false;
        }
    };

    const copyText = async (text, successText = '已复制') => {
        const value = String(text || '');
        if (!value) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(value);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            message.success(successText);
        } catch (err) {
            message.error('复制失败，请手动复制');
        }
    };

    const revokePaperShare = async (share) => {
        try {
            await messageBox.confirm('撤销后该分享码将不能继续被接收，确定撤销吗？', '撤销分享', { type: 'warning' });
            await adminApi.revokePaperShare(share._id);
            message.success('分享已撤销');
            await loadPaperShares();
        } catch (err) {
            if (err !== 'cancel') {
                message.error(err.response?.data?.message || '撤销失败');
            }
        }
    };

    return {
        resetShareForm,
        buildShareExpiresAt,
        renderShareQrcode,
        getPaperShareIdentity,
        selectPaperShare,
        getPaperShareRowClass,
        loadPaperShares,
        openShareDialog,
        openCategoryAnalysis,
        createPaperShare,
        copyText,
        revokePaperShare,
    };
}
