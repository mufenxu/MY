import { api, AiQuestionAnalysisPayload, Question } from '../../services/api';
import { getNavBarInfo } from '../../utils/nav';
import { groupQuestionsByType } from '../../utils/question';

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
        title: '考试结果',
        questions: [] as Question[],
        groupedQuestions: [] as { type: string; typeName: string; items: { questionId: string; originalIndex: number }[] }[],
        currentIndex: 0,
        answers: {} as Record<string, string[]>, // { questionId: [values] }
        results: {} as Record<string, boolean>, // { questionId: isCorrect }
        loading: true,
        showAnswerSheet: false,
        isAnalysisVisible: true, // Always show analysis in review
        mode: 'review',
        statusBarHeight: 0,
        capsuleTop: 0,
        capsuleHeight: 0,
        navBarHeight: 0,
        // Mock timer data to prevent errors in wxml
        timeLeft: 0,
        timerStr: '',
        showResumeModal: false,
        canUseAiAnalysis: false,
        canGenerateAiAnalysis: false,
        aiAnalysisByQuestionId: {} as Record<string, string>,
        aiAnalysisLoadingByQuestionId: {} as Record<string, boolean>,
    },

    onLoad(options: any) {
        // 使用公共导航栏函数
        const navInfo = getNavBarInfo();
        this.setData({
            statusBarHeight: navInfo.statusBarHeight,
            capsuleTop: navInfo.menuButtonTop,
            capsuleHeight: navInfo.menuButtonHeight,
            navBarHeight: navInfo.navBarHeight
        });
        this.loadAiAnalysisStatus();

        // Try to get data from options (URL params)
        if (options.data) {
            try {
                const data = JSON.parse(decodeURIComponent(options.data));
                this.initData(data);
            } catch (e) {
                console.error('Parse data failed', e);
                wx.showToast({ title: '加载数据失败', icon: 'none' });
            }
        } else {
            // Try event channel
            const eventChannel = this.getOpenerEventChannel();
            if (eventChannel && typeof eventChannel.on === 'function') {
                eventChannel.on('acceptDataFromOpenerPage', (data: any) => {
                    this.initData(data);
                });
            }
        }
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

    initData(data: any) {
        if (!data || !data.details) {
            this.setData({ loading: false });
            return;
        }

        // Map review data to questions and answers
        const questions: Question[] = [];
        const answers: Record<string, string[]> = {};
        const results: Record<string, boolean> = {};

        data.details.forEach((item: any) => {
            if (item.question) {
                // Inject correct answer into question object for display
                if (item.correctAnswer) {
                    item.question.answer = Array.isArray(item.correctAnswer) ? item.correctAnswer : [item.correctAnswer];
                }

                questions.push(item.question);

                // Ensure user answer is in the correct format (array of strings)
                let userAns: string[] = [];
                if (item.userAnswer) {
                    userAns = Array.isArray(item.userAnswer) ? item.userAnswer : [item.userAnswer];
                    answers[item.question._id] = userAns;
                }

                // Determine correctness
                // Priority 1: Use backend provided isCorrect flag if available
                if (typeof item.isCorrect === 'boolean') {
                    results[item.question._id] = item.isCorrect;
                } else {
                    // Priority 2: Compare user answer with correct answer
                    const correctAns = item.question.answer || [];
                    // Simple array comparison (assuming sorted or order matters, usually for multiple choice order doesn't matter but let's sort to be safe)
                    const sortedUser = [...userAns].sort();
                    const sortedCorrect = [...correctAns].sort();

                    const isCorrect = sortedUser.length === sortedCorrect.length &&
                        sortedUser.every((val, index) => val === sortedCorrect[index]);

                    results[item.question._id] = isCorrect;
                }
            }
        });

        const groupedQuestions = groupQuestionsByType(questions as any);
        this.setData({
            questions,
            groupedQuestions,
            answers,
            results,
            loading: false,
            title: data.categoryName ? `${data.categoryName} - 解析` : '试卷解析'
        });
    },

    onPrev() {
        if (this.data.currentIndex > 0) {
            this.setData({
                currentIndex: this.data.currentIndex - 1
            });
        }
    },

    onNext() {
        if (this.data.currentIndex < this.data.questions.length - 1) {
            this.setData({
                currentIndex: this.data.currentIndex + 1
            });
        }
    },

    onToggleAnswerSheet() {
        this.setData({
            showAnswerSheet: !this.data.showAnswerSheet
        });
    },

    onJumpToQuestion(e: any) {
        const { index } = e.currentTarget.dataset;
        this.setData({
            currentIndex: index,
            showAnswerSheet: false
        });
    },

    // Empty handlers for events bound in WXML that are not needed in review mode
    onAnswerChange() { },
    onConfirmAnswer() { },
    onSubmit() {
        wx.navigateBack();
    },
    onResumeConfirm() { },
    onResumeCancel() { }
});
