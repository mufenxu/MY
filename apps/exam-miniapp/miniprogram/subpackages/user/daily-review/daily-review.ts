import {
    api,
    AiQuestionAnalysisPayload,
    Question,
    ReviewQuestion,
    ReviewRating,
} from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';

function buildAiQuestionAnalysisPayload(
    question: Question,
    forceRefresh = false,
): AiQuestionAnalysisPayload {
    return {
        questionId: question._id,
        forceRefresh,
    };
}

function getErrorMessage(error: any, fallback: string) {
    return error && error.message ? error.message : fallback;
}

Page({
    data: {
        questions: [] as ReviewQuestion[],
        answers: {} as Record<string, string[]>,
        loading: true,
        rating: false,
        showAnalysis: false,
        completedCount: 0,
        initialDueCount: 0,
        remainingDueCount: 0,
        navBarHeight: 0,
        menuButtonTop: 0,
        menuButtonHeight: 0,
        canUseAiAnalysis: false,
        canGenerateAiAnalysis: false,
        aiAnalysisByQuestionId: {} as Record<string, string>,
        aiAnalysisLoadingByQuestionId: {} as Record<string, boolean>,
    },

    async onLoad() {
        const navInfo = getNavBarInfo();
        this.setData({
            navBarHeight: navInfo.navBarHeight,
            menuButtonTop: navInfo.menuButtonTop,
            menuButtonHeight: navInfo.menuButtonHeight,
        });

        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能同步复习计划，是否前往登录？',
                nextUrl: buildPageUrl('/subpackages/user/daily-review/daily-review'),
            });
            this.setData({ loading: false });
            return;
        }

        await Promise.all([
            this.loadAiAnalysisStatus(),
            this.loadQueue(true),
        ]);
    },

    async loadAiAnalysisStatus() {
        try {
            const status = await api.getAiAnalysisStatus();
            this.setData({
                canUseAiAnalysis: Boolean(status.enabled && status.canUseAiAnalysis),
                canGenerateAiAnalysis: Boolean(status.enabled && status.canGenerateAiAnalysis),
            });
        } catch (error) {
            console.warn('Load AI analysis status failed', error);
        }
    },

    async loadQueue(resetProgress: boolean) {
        this.setData({ loading: true });
        try {
            const result = await api.getReviewQueue({ limit: 30 });
            const nextData: Record<string, any> = {
                questions: result.questions || [],
                initialDueCount: resetProgress ? result.dueCount : this.data.initialDueCount,
                remainingDueCount: result.dueCount,
                loading: false,
                showAnalysis: false,
                answers: {},
            };
            if (resetProgress) {
                nextData.completedCount = 0;
            }
            this.setData(nextData);
        } catch (error) {
            console.error('Load review queue failed', error);
            wx.showToast({ title: '复习计划加载失败', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    onAnswerChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
        const question = this.data.questions[0];
        if (!question) {
            return;
        }

        this.setData({
            [`answers.${question._id}`]: e.detail.value,
        });
    },

    onRevealAnswer() {
        this.setData({ showAnalysis: true });
    },

    async onRate(e: WechatMiniprogram.BaseEvent) {
        const question = this.data.questions[0];
        const rating = e.currentTarget.dataset.rating as ReviewRating;
        if (!question || this.data.rating || !['unknown', 'fuzzy', 'known'].includes(rating)) {
            return;
        }

        this.setData({ rating: true });
        try {
            await api.rateReviewQuestion(question._id, {
                categoryId: question.categoryId,
                rating,
            });
            const remainingQuestions = this.data.questions.slice(1);
            const completedCount = this.data.completedCount + 1;
            this.setData({
                questions: remainingQuestions,
                completedCount,
                remainingDueCount: Math.max(this.data.remainingDueCount - 1, 0),
                showAnalysis: false,
                answers: {},
            });

            if (remainingQuestions.length === 0 && this.data.remainingDueCount > 0) {
                await this.loadQueue(false);
            } else if (remainingQuestions.length === 0) {
                await this.refreshSummary();
            }
        } catch (error) {
            wx.showToast({
                title: getErrorMessage(error, '复习结果保存失败'),
                icon: 'none',
            });
        } finally {
            this.setData({ rating: false });
        }
    },

    async refreshSummary() {
        try {
            const summary = await api.getReviewSummary();
            this.setData({ remainingDueCount: summary.dueCount });
        } catch (error) {
            console.warn('Refresh review summary failed', error);
        }
    },

    async onAiAnalysisRequest(e: WechatMiniprogram.CustomEvent<{ question: Question; forceRefresh?: boolean }>) {
        const detail = e.detail || {};
        const question = detail.question;
        const questionId = question && question._id;
        if (!question || !questionId || this.data.aiAnalysisLoadingByQuestionId[questionId]) {
            return;
        }

        this.setData({ [`aiAnalysisLoadingByQuestionId.${questionId}`]: true });
        try {
            const result = await api.generateQuestionAiAnalysis(buildAiQuestionAnalysisPayload(
                question,
                Boolean(detail.forceRefresh),
            ));
            this.setData({ [`aiAnalysisByQuestionId.${questionId}`]: result.analysis });
        } catch (error) {
            wx.showToast({ title: getErrorMessage(error, 'AI解析失败'), icon: 'none' });
        } finally {
            this.setData({ [`aiAnalysisLoadingByQuestionId.${questionId}`]: false });
        }
    },

    onRetry() {
        this.loadQueue(true);
    },

    onBack() {
        wx.navigateBack();
    },
});
