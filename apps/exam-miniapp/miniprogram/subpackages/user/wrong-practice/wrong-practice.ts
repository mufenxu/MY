import { api, AiQuestionAnalysisPayload, Question } from '../../../services/api';
import { buildPageUrl, promptLogin } from '../../../utils/auth';
import { getNavBarInfo } from '../../../utils/nav';
import { groupQuestionsByType } from '../../../utils/question';

function normalizeAnswer(value: any): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean).sort();
    }
    if (value === undefined || value === null) {
        return [];
    }
    const text = String(value).trim();
    return text ? [text] : [];
}

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
    _syncedAnswerQuestionIds: {} as Record<string, boolean>,

    data: {
        title: '错题练习',
        categoryId: '',
        questions: [] as any[],
        groupedQuestions: [] as { type: string; typeName: string; items: { question: any; originalIndex: number }[] }[],
        currentIndex: 0,
        answers: {} as Record<string, string[]>,
        loading: true,
        isAnalysisVisible: false,
        showAnswerSheet: false,
        statusBarHeight: 0,
        capsuleTop: 0,
        capsuleHeight: 0,
        navBarHeight: 0,
        noteDialogVisible: false,
        noteDraft: '',
        syncingState: false,
        canUseAiAnalysis: false,
        canGenerateAiAnalysis: false,
        aiAnalysisByQuestionId: {} as Record<string, string>,
        aiAnalysisLoadingByQuestionId: {} as Record<string, boolean>,
    },

    async onLoad(options: any) {
        const { categoryId, title } = options;

        const navInfo = getNavBarInfo();
        this.setData({
            categoryId,
            title: decodeURIComponent(title || '错题练习'),
            statusBarHeight: navInfo.statusBarHeight,
            capsuleTop: navInfo.menuButtonTop,
            capsuleHeight: navInfo.menuButtonHeight,
            navBarHeight: navInfo.navBarHeight,
        });

        if (!api.isLoggedIn()) {
            await promptLogin({
                message: '登录后可继续错题练习，是否前往登录？',
                nextUrl: buildPageUrl('/subpackages/user/wrong-practice/wrong-practice', {
                    categoryId,
                    title,
                }),
            });
            this.setData({ loading: false });
            return;
        }

        this.loadAiAnalysisStatus();
        this.loadWrongQuestions(categoryId);
    },

    async loadAiAnalysisStatus() {
        if (!api.isLoggedIn()) {
            return;
        }

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

    async onAiAnalysisRequest(e: WechatMiniprogram.CustomEvent<{ question: Question; forceRefresh?: boolean }>) {
        const detail = e.detail || {};
        const question = detail.question;
        const questionId = question && question._id;
        if (!question || !questionId || this.data.aiAnalysisLoadingByQuestionId[questionId]) {
            return;
        }

        this.setData({
            [`aiAnalysisLoadingByQuestionId.${questionId}`]: true,
        });

        try {
            const result = await api.generateQuestionAiAnalysis(buildAiQuestionAnalysisPayload(
                question,
                Boolean(detail.forceRefresh),
            ));
            this.setData({
                [`aiAnalysisByQuestionId.${questionId}`]: result.analysis,
            });
        } catch (error) {
            wx.showToast({
                title: getErrorMessage(error, 'AI解析失败'),
                icon: 'none',
            });
        } finally {
            this.setData({
                [`aiAnalysisLoadingByQuestionId.${questionId}`]: false,
            });
        }
    },

    async loadWrongQuestions(categoryId: string) {
        this.setData({ loading: true });
        this._syncedAnswerQuestionIds = {};
        try {
            const result = await api.getWrongQuestionsByCategory(categoryId);

            if (result && result.questions) {
                const questions = result.questions.map((question: any) => ({
                    ...question,
                    state: {
                        status: 'needsReview',
                        favorite: false,
                        note: '',
                        wrongCount: 0,
                        correctStreak: 0,
                        ...(question.state || {}),
                    },
                }));
                const groupedQuestions = groupQuestionsByType(questions);
                this.setData({
                    questions,
                    groupedQuestions,
                    title: result.categoryName || this.data.title,
                });
            }
        } catch (error) {
            console.error('Load wrong practice failed', error);
            wx.showToast({ title: '加载失败', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    onBack() {
        wx.navigateBack();
    },

    onAnswerChange(e: any) {
        const { value } = e.detail;
        const { questions, currentIndex, answers } = this.data;
        const currentQuestion = questions[currentIndex];
        if (!currentQuestion) return;

        const newAnswers = { ...answers, [currentQuestion._id]: value };

        let isAnalysisVisible = this.data.isAnalysisVisible;
        if (currentQuestion.type === 'single' || currentQuestion.type === 'judge') {
            isAnalysisVisible = true;
        }

        this.setData({
            answers: newAnswers,
            isAnalysisVisible,
        });

        if (isAnalysisVisible) {
            this.syncCurrentAnswerState();
        }
    },

    onConfirmAnswer() {
        this.setData({ isAnalysisVisible: true });
        this.syncCurrentAnswerState();
    },

    onPrev() {
        this.syncCurrentAnswerState();
        if (this.data.currentIndex > 0) {
            const newIndex = this.data.currentIndex - 1;
            this.setData({
                currentIndex: newIndex,
                isAnalysisVisible: this.shouldShowAnalysis(newIndex),
            });
        }
    },

    onNext() {
        const { currentIndex, questions } = this.data;
        this.syncCurrentAnswerState();

        if (currentIndex < questions.length - 1) {
            const newIndex = currentIndex + 1;
            this.setData({
                currentIndex: newIndex,
                isAnalysisVisible: this.shouldShowAnalysis(newIndex),
            });
        }
    },

    onFinish() {
        this.syncCurrentAnswerState();
        wx.showToast({
            title: '练习完成',
            icon: 'success',
            duration: 1500,
        });
        setTimeout(() => {
            wx.navigateBack();
        }, 1500);
    },

    onToggleAnswerSheet() {
        this.setData({
            showAnswerSheet: !this.data.showAnswerSheet,
        });
    },

    onJumpToQuestion(e: any) {
        const { index } = e.currentTarget.dataset;
        this.setData({
            currentIndex: index,
            showAnswerSheet: false,
            isAnalysisVisible: this.shouldShowAnalysis(index),
        });
    },

    shouldShowAnalysis(index: number): boolean {
        const { questions, answers } = this.data;
        const question = questions[index];
        if (!question) return false;

        const userAnswer = answers[question._id];
        return !!(userAnswer && userAnswer.length > 0);
    },

    isCurrentAnswerCorrect() {
        const { questions, currentIndex, answers } = this.data;
        const question = questions[currentIndex];
        if (!question) return false;

        const userAnswer = normalizeAnswer(answers[question._id]);
        const correctAnswer = normalizeAnswer(question.answer);
        if (userAnswer.length === 0 || userAnswer.length !== correctAnswer.length) {
            return false;
        }

        return userAnswer.every((item, index) => item === correctAnswer[index]);
    },

    async syncCurrentAnswerState() {
        const { questions, currentIndex, answers, categoryId } = this.data;
        const question = questions[currentIndex];
        if (!question || !answers[question._id] || this._syncedAnswerQuestionIds[question._id]) {
            return;
        }

        this._syncedAnswerQuestionIds[question._id] = true;
        try {
            const state = await api.updateWrongQuestionState(question._id, {
                categoryId,
                answerResult: this.isCurrentAnswerCorrect() ? 'correct' : 'wrong',
            });
            this.updateQuestionState(question._id, state);
        } catch (error) {
            this._syncedAnswerQuestionIds[question._id] = false;
            console.error('Sync wrong question state failed', error);
        }
    },

    updateQuestionState(questionId: string, state: any) {
        const index = this.data.questions.findIndex((item: any) => item._id === questionId);
        if (index < 0) {
            return;
        }

        this.setData({
            [`questions[${index}].state`]: {
                ...(this.data.questions[index].state || {}),
                ...(state || {}),
            },
        });
    },

    async updateCurrentQuestionState(payload: any, successTitle = '已更新') {
        const { questions, currentIndex, categoryId } = this.data;
        const question = questions[currentIndex];
        if (!question || this.data.syncingState) {
            return;
        }

        this.setData({ syncingState: true });
        try {
            const state = await api.updateWrongQuestionState(question._id, {
                categoryId,
                ...payload,
            });
            this.updateQuestionState(question._id, state);
            wx.showToast({ title: successTitle, icon: 'success' });
        } catch (error) {
            console.error('Update wrong question state failed', error);
            wx.showToast({ title: '更新失败', icon: 'none' });
        } finally {
            this.setData({ syncingState: false });
        }
    },

    onToggleFavorite() {
        const question = this.data.questions[this.data.currentIndex];
        if (!question) return;
        const state = question.state || {};
        this.updateCurrentQuestionState({
            favorite: !state.favorite,
        }, state.favorite ? '已取消收藏' : '已收藏');
    },

    onMarkMastered() {
        this.updateCurrentQuestionState({ status: 'mastered' }, '已标记掌握');
    },

    onMarkNeedsReview() {
        this.updateCurrentQuestionState({ status: 'needsReview' }, '已加入复习');
    },

    onOpenNoteDialog() {
        const question = this.data.questions[this.data.currentIndex];
        this.setData({
            noteDialogVisible: true,
            noteDraft: question && question.state ? (question.state.note || '') : '',
        });
    },

    onCloseNoteDialog() {
        this.setData({
            noteDialogVisible: false,
            noteDraft: '',
        });
    },

    onNoteInput(e: WechatMiniprogram.Input) {
        this.setData({ noteDraft: e.detail.value });
    },

    async onSaveNote() {
        await this.updateCurrentQuestionState({ note: this.data.noteDraft }, '笔记已保存');
        this.onCloseNoteDialog();
    },

    noop() {
        // Stop mask click-through.
    },
});
