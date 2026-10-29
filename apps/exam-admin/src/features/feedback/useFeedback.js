import { reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

function readFlag(source) {
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    return Boolean(source);
}

export function useFeedback({
    adminApi,
    isConsoleMode,
    beginViewRequest,
    finishViewRequest,
    quietRequestConfig,
    loadFeedbackSummary = async () => {},
    isFeedbackReplyUnread = () => false,
    message = ElMessage,
    messageBox = ElMessageBox,
} = {}) {
    const feedbacks = reactive({ list: [], total: 0, page: 1, limit: 20 });
    const feedbackFilter = reactive({
        status: '',
        keyword: '',
    });
    const feedbackCreateDialog = reactive({
        visible: false,
        saving: false,
    });
    const feedbackCreateForm = reactive({
        category: 'bug',
        title: '',
        content: '',
        contact: '',
    });
    const feedbackDetailDialog = reactive({
        visible: false,
        saving: false,
        item: null,
    });
    const feedbackReplyForm = reactive({
        replyContent: '',
        closeAfterReply: false,
    });

    const loadFeedbacks = async (page = 1) => {
        const controller = beginViewRequest('feedbacks');
        try {
            const res = await adminApi.listFeedbacks({
                page,
                limit: feedbacks.limit,
                status: feedbackFilter.status || undefined,
                keyword: readFlag(isConsoleMode) ? undefined : (feedbackFilter.keyword || undefined),
            }, quietRequestConfig(controller));
            if (controller.signal.aborted) return;
            if (res.data.code === 0) {
                feedbacks.list = res.data.data.list || [];
                feedbacks.total = res.data.data.total || 0;
                feedbacks.page = res.data.data.page || page;
                feedbacks.limit = res.data.data.limit || feedbacks.limit;
                await loadFeedbackSummary();
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            message.error('加载反馈失败');
        } finally {
            finishViewRequest('feedbacks', controller);
        }
    };

    const openFeedbackCreateDialog = () => {
        if (!readFlag(isConsoleMode)) return;
        Object.assign(feedbackCreateForm, {
            category: 'bug',
            title: '',
            content: '',
            contact: '',
        });
        feedbackCreateDialog.visible = true;
    };

    const submitFeedback = async () => {
        if (!readFlag(isConsoleMode)) return;
        if (!feedbackCreateForm.title.trim() || !feedbackCreateForm.content.trim()) {
            message.warning('请填写反馈标题和详细说明');
            return;
        }

        try {
            feedbackCreateDialog.saving = true;
            const res = await adminApi.createFeedback({
                category: feedbackCreateForm.category,
                title: feedbackCreateForm.title.trim(),
                content: feedbackCreateForm.content.trim(),
                contact: feedbackCreateForm.contact.trim(),
            });
            if (res.data.code === 0) {
                message.success('反馈已提交');
                feedbackCreateDialog.visible = false;
                await loadFeedbacks(1);
                await loadFeedbackSummary();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '提交反馈失败');
        } finally {
            feedbackCreateDialog.saving = false;
        }
    };

    const openFeedbackDetail = async (item) => {
        feedbackDetailDialog.item = item;
        feedbackReplyForm.replyContent = item.replyContent || '';
        feedbackReplyForm.closeAfterReply = false;
        feedbackDetailDialog.visible = true;

        if (isFeedbackReplyUnread(item)) {
            try {
                const res = await adminApi.markFeedbackReplyRead(item._id);
                if (res.data.code === 0) {
                    const readAt = res.data.data?.replyReadAt || new Date().toISOString();
                    item.replyReadAt = readAt;
                    if (feedbackDetailDialog.item?._id === item._id) {
                        feedbackDetailDialog.item.replyReadAt = readAt;
                    }
                    await loadFeedbackSummary();
                }
            } catch (err) {
                // Reading the detail should not be blocked by a best-effort read receipt update.
            }
        }
    };

    const replyFeedback = async () => {
        if (readFlag(isConsoleMode) || !feedbackDetailDialog.item?._id) return;
        if (!feedbackReplyForm.replyContent.trim()) {
            message.warning('请输入回复内容');
            return;
        }

        try {
            feedbackDetailDialog.saving = true;
            const res = await adminApi.replyFeedback(feedbackDetailDialog.item._id, {
                replyContent: feedbackReplyForm.replyContent.trim(),
                closeAfterReply: feedbackReplyForm.closeAfterReply,
            });
            if (res.data.code === 0) {
                message.success('回复已保存');
                feedbackDetailDialog.visible = false;
                await loadFeedbacks(feedbacks.page);
                await loadFeedbackSummary();
            }
        } catch (err) {
            message.error(err.response?.data?.message || '保存回复失败');
        } finally {
            feedbackDetailDialog.saving = false;
        }
    };

    const closeFeedback = async (item) => {
        if (readFlag(isConsoleMode) || !item?._id) return;

        try {
            await messageBox.confirm('确定关闭这条反馈吗？关闭后仍可查看历史回复。', '关闭反馈', {
                type: 'warning',
                confirmButtonText: '确认关闭',
                cancelButtonText: '取消',
            });
            const res = await adminApi.updateFeedbackStatus(item._id, { status: 'closed' });
            if (res.data.code === 0) {
                message.success('反馈已关闭');
                feedbackDetailDialog.visible = false;
                await loadFeedbacks(feedbacks.page);
                await loadFeedbackSummary();
            }
        } catch (err) {
            if (err !== 'cancel') {
                message.error(err.response?.data?.message || '关闭反馈失败');
            }
        }
    };

    return {
        feedbacks,
        feedbackFilter,
        feedbackCreateDialog,
        feedbackCreateForm,
        feedbackDetailDialog,
        feedbackReplyForm,
        loadFeedbacks,
        openFeedbackCreateDialog,
        submitFeedback,
        openFeedbackDetail,
        replyFeedback,
        closeFeedback,
    };
}
