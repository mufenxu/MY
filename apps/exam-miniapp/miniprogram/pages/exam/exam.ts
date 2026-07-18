import { api, AiQuestionAnalysisPayload, LibraryScope, Question } from '../../services/api';
import { buildPageUrl, promptLogin } from '../../utils/auth';
import { getNavBarInfo } from '../../utils/nav';
import { hasUsefulProgress } from '../../utils/progress';
import { groupQuestionsByType } from '../../utils/question';

type StudyMode = 'exam' | 'practice' | 'recite';
type ReciteLevel = 'known' | 'fuzzy' | 'unknown';
type ReciteMasteryMap = Record<string, ReciteLevel>;
type ReciteClassMap = Record<string, string>;
type ReciteReviewMap = Record<string, number>;
type SwiperQuestion = { question: Question; originalIndex: number };
type GroupedQuestionSummary = {
    type: string;
    typeName: string;
    items: { questionId: string; originalIndex: number }[];
};

const MIN_FOOTER_BOTTOM_PADDING_PX = 20;
const FOOTER_BOTTOM_EXTRA_GAP_PX = 8;
const FOOTER_SPACER_EXTRA_PX = 24;
const PROGRESS_SAVE_DEBOUNCE_MS = 800;

const RECITE_CLASS_MAP: Record<ReciteLevel, string> = {
    known: 'mastery-known',
    fuzzy: 'mastery-fuzzy',
    unknown: 'mastery-unknown',
};

function normalizeMode(mode?: string): StudyMode {
    if (mode === 'practice' || mode === 'recite') {
        return mode;
    }
    return 'exam';
}

function normalizeSourceType(sourceType?: string): LibraryScope {
    return sourceType === 'my' || sourceType === 'personal' ? 'personal' : 'demo';
}

function getQuestionFetchMode(mode: StudyMode): 'exam' | 'practice' {
    return mode === 'recite' ? 'practice' : mode;
}

function getFooterLayoutInfo() {
    const systemInfo = wx.getSystemInfoSync() as any;
    const windowWidth = Number(systemInfo.windowWidth) || 375;
    const rpxToPx = windowWidth / 750;
    const safeArea = systemInfo.safeArea;
    const screenHeight = Number(systemInfo.screenHeight) || 0;
    const safeAreaBottom = safeArea ? Number(safeArea.bottom) || screenHeight : screenHeight;
    const safeAreaInsetBottom = screenHeight > 0
        ? Math.max(screenHeight - safeAreaBottom, 0)
        : 0;
    const footerBottomPadding = Math.ceil(Math.max(
        MIN_FOOTER_BOTTOM_PADDING_PX,
        safeAreaInsetBottom + FOOTER_BOTTOM_EXTRA_GAP_PX
    ));
    const footerTopPadding = Math.ceil(14 * rpxToPx);
    const footerButtonHeight = Math.ceil(80 * rpxToPx);

    return {
        footerBottomPadding,
        footerSpacerHeight: footerTopPadding + footerButtonHeight + footerBottomPadding + FOOTER_SPACER_EXTRA_PX,
    };
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
    _reciteQueue: [] as number[],
    _reciteMastery: {} as ReciteMasteryMap,
    _reciteReviewTimes: {} as ReciteReviewMap,
    _skipSaveOnExit: false,

    data: {
        title: '',
        categoryId: '',
        questions: [] as Question[],
        totalCount: 0,
        groupedQuestions: [] as GroupedQuestionSummary[],
        swiperQuestions: [] as SwiperQuestion[],
        swiperCurrent: 0,
        currentIndex: 0,
        answers: {} as Record<string, string[]>,
        loading: true,
        showAnswerSheet: false,
        isAnalysisVisible: false,
        duration: 0,
        timeLeft: 0,
        timerStr: '',
        timerId: 0 as number,
        mode: 'exam' as StudyMode,
        sourceType: 'demo' as LibraryScope,
        saveTimer: 0 as any,
        statusBarHeight: 0,
        capsuleTop: 0,
        capsuleHeight: 0,
        navBarHeight: 0,
        showResumeModal: false,
        pendingProgress: null as any,
        reciteMasteryClassMap: {} as ReciteClassMap,
        reciteKnownCount: 0,
        reciteFuzzyCount: 0,
        reciteUnknownCount: 0,
        recitePendingCount: 0,
        reciteReviewedCount: 0,
        footerBottomPadding: MIN_FOOTER_BOTTOM_PADDING_PX,
        footerSpacerHeight: 92,
        canUseAiAnalysis: false,
        canGenerateAiAnalysis: false,
        aiAnalysisByQuestionId: {} as Record<string, string>,
        aiAnalysisLoadingByQuestionId: {} as Record<string, boolean>,
    },

    async onLoad(options: any) {
        const mode = normalizeMode(options.mode);
        const sourceType = normalizeSourceType(options.sourceType);
        const navInfo = getNavBarInfo();
        const footerLayout = getFooterLayoutInfo();

        this.setData({
            statusBarHeight: navInfo.statusBarHeight,
            capsuleTop: navInfo.menuButtonTop,
            capsuleHeight: navInfo.menuButtonHeight,
            navBarHeight: navInfo.navBarHeight,
            footerBottomPadding: footerLayout.footerBottomPadding,
            footerSpacerHeight: footerLayout.footerSpacerHeight,
            title: options.title ? decodeURIComponent(options.title) : (mode === 'recite' ? 'Recite' : 'Exam'),
            categoryId: options.categoryId,
            duration: Number(options.duration) || 0,
            mode,
            sourceType,
            showResumeModal: false,
            pendingProgress: null,
        });
        this._skipSaveOnExit = false;
        this.loadAiAnalysisStatus();

        if (sourceType === 'personal' && !api.isLoggedIn()) {
            await promptLogin({
                message: '登录后才能练习你自己创建的题库并同步进度，是否前往登录？',
                nextUrl: buildPageUrl('/pages/exam/exam', {
                    categoryId: options.categoryId,
                    title: options.title,
                    duration: options.duration,
                    mode,
                    sourceType: options.sourceType || 'my',
                }),
            });
            this.setData({ loading: false });
            return;
        }

        await this.fetchQuestions(options.categoryId, mode, sourceType);

        if (options.restart === '1') {
            this.clearSavedProgress();
            if (mode === 'exam' && Number(options.duration) > 0) {
                this.startTimer(Number(options.duration));
            }
            return;
        }

        const hasProgress = await this.checkProgress();
        if (hasProgress && options.resume === '1') {
            await this.onResumeConfirm();
            return;
        }

        if (!hasProgress && mode === 'exam' && Number(options.duration) > 0) {
            this.startTimer(Number(options.duration));
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

    onHide() {
        this.saveProgress(true);
    },

    onUnload() {
        if (this.data.timerId) {
            clearInterval(this.data.timerId);
        }
        if (this.data.saveTimer) {
            clearTimeout(this.data.saveTimer);
        }
        this.saveProgress(true);
    },

    buildSwiperState(currentIndex: number, sourceQuestions?: Question[]) {
        const questions = sourceQuestions || this.data.questions;
        if (questions.length === 0) {
            return { currentIndex: 0, swiperCurrent: 0, swiperQuestions: [] as SwiperQuestion[] };
        }

        const safeIndex = Math.min(Math.max(currentIndex, 0), questions.length - 1);
        const windowSize = Math.min(3, questions.length);
        const start = Math.min(Math.max(safeIndex - 1, 0), questions.length - windowSize);
        const swiperQuestions = questions
            .slice(start, start + windowSize)
            .map((question, offset) => ({ question, originalIndex: start + offset }));

        return {
            currentIndex: safeIndex,
            swiperCurrent: safeIndex - start,
            swiperQuestions,
        };
    },

    buildReciteInitialState(questions: Question[]) {
        const queue = questions.map((_question, index) => index);
        this._reciteQueue = queue;
        this._reciteMastery = {};
        this._reciteReviewTimes = {};
        return {
            currentIndex: queue.length > 0 ? queue[0] : 0,
            reciteMasteryClassMap: {},
            reciteKnownCount: 0,
            reciteFuzzyCount: 0,
            reciteUnknownCount: 0,
            recitePendingCount: queue.length,
            reciteReviewedCount: 0,
            isAnalysisVisible: false,
        };
    },

    async fetchQuestions(categoryId: string, mode: StudyMode, sourceType: LibraryScope) {
        try {
            const fetchMode = getQuestionFetchMode(mode);
            const questions = sourceType === 'personal'
                ? await api.getMyQuestions(categoryId, fetchMode)
                : await api.getQuestions(categoryId, fetchMode);
            const groupedQuestions = groupQuestionsByType(questions as any);

            const nextData: Record<string, any> = {
                questions,
                totalCount: questions.length,
                groupedQuestions,
                loading: false,
            };

            if (mode === 'recite') {
                Object.assign(nextData, this.buildReciteInitialState(questions));
            }

            Object.assign(nextData, this.buildSwiperState(nextData.currentIndex || 0, questions));

            this.setData(nextData);
        } catch (error) {
            console.error(error);
            wx.showToast({ title: '加载题目失败', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    async checkProgress() {
        if (this.data.sourceType === 'personal' && !api.isLoggedIn()) {
            return false;
        }

        try {
            const progress = this.data.sourceType === 'personal'
                ? await api.getProgress(this.data.categoryId, this.data.mode)
                : api.getLocalProgress(this.data.categoryId, this.data.mode);
            if (progress && hasUsefulProgress(progress)) {
                this.setData({
                    showResumeModal: true,
                    pendingProgress: progress,
                });
                return true;
            }
        } catch (error) {
            console.error('Check progress failed', error);
        }
        return false;
    },

    buildProgressPayload() {
        return {
            categoryId: this.data.categoryId,
            mode: this.data.mode,
            currentIndex: this.data.currentIndex,
            answers: this.data.answers,
            timeLeft: this.data.timeLeft || 0,
            questionCount: this.data.totalCount,
            reciteQueue: this.data.mode === 'recite' ? this._reciteQueue : [],
            reciteMastery: this.data.mode === 'recite' ? this._reciteMastery : {},
            reciteReviewTimes: this.data.mode === 'recite' ? this._reciteReviewTimes : {},
        };
    },

    persistProgress(payload: any) {
        if (!hasUsefulProgress(payload)) {
            return;
        }

        if (this.data.sourceType === 'personal') {
            if (!api.isLoggedIn()) {
                return;
            }
            api.saveProgress(payload).catch((error) => console.error('Save progress failed', error));
            return;
        }

        api.saveLocalProgress(payload);
    },

    saveProgress(immediate = false) {
        if (this._skipSaveOnExit) {
            return;
        }

        if (this.data.saveTimer) {
            clearTimeout(this.data.saveTimer);
        }

        const persist = () => {
            this.persistProgress(this.buildProgressPayload());
            this.setData({ saveTimer: 0 });
        };

        if (immediate) {
            persist();
            return;
        }

        const saveTimer = setTimeout(persist, PROGRESS_SAVE_DEBOUNCE_MS);
        this.setData({ saveTimer });
    },

    clearSavedProgress() {
        if (this.data.saveTimer) {
            clearTimeout(this.data.saveTimer);
            this.setData({ saveTimer: 0 });
        }

        if (this.data.sourceType === 'personal') {
            if (api.isLoggedIn()) {
                api.clearProgress(this.data.categoryId, this.data.mode).catch((error) => console.error(error));
            }
            return;
        }

        api.clearLocalProgress(this.data.categoryId, this.data.mode);
    },

    startTimer(durationMinutes: number, initialSeconds?: number) {
        if (!durationMinutes || durationMinutes <= 0) {
            return;
        }

        if (this.data.timerId) {
            clearInterval(this.data.timerId);
        }

        let timeLeft = initialSeconds && initialSeconds > 0 ? initialSeconds : durationMinutes * 60;
        this.setData({ timeLeft, timerStr: this.formatTime(timeLeft) });

        const timerId = setInterval(() => {
            timeLeft -= 1;
            if (timeLeft <= 0) {
                clearInterval(timerId);
                this.setData({ timeLeft: 0, timerStr: '00:00' });
                this.autoSubmit();
                return;
            }

            this.setData({ timeLeft, timerStr: this.formatTime(timeLeft) });
            if (timeLeft % 30 === 0) {
                this.saveProgress();
            }
        }, 1000);

        this.setData({ timerId });
    },

    formatTime(seconds: number) {
        const minutes = Math.floor(seconds / 60);
        const restSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${restSeconds.toString().padStart(2, '0')}`;
    },

    autoSubmit() {
        wx.showToast({ title: '考试时间到，自动交卷', icon: 'none' });
        this.onSubmit(true);
    },

    onAnswerChange(e: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
        const { value } = e.detail;
        const { questions, currentIndex, mode } = this.data;
        const currentQuestion = questions[currentIndex];
        if (!currentQuestion) {
            return;
        }

        const updateData: Record<string, any> = {
            [`answers.${currentQuestion._id}`]: value,
        };

        if (mode === 'practice' && (currentQuestion.type === 'single' || currentQuestion.type === 'judge')) {
            updateData.isAnalysisVisible = true;
        }

        this.setData(updateData);
        this.saveProgress();
    },

    onSwiperChange(e: WechatMiniprogram.SwiperChange) {
        if (this.data.mode === 'recite') {
            return;
        }

        if (e.detail.source === 'touch') {
            const swiperQuestion = this.data.swiperQuestions[e.detail.current];
            if (!swiperQuestion) {
                return;
            }
            const newIndex = swiperQuestion.originalIndex;
            this.setData({
                ...this.buildSwiperState(newIndex),
                isAnalysisVisible: this.shouldShowAnalysis(newIndex),
            });
            this.saveProgress();
        }
    },

    moveInReciteQueue(step: number) {
        const reciteQueue = this._reciteQueue;
        const { currentIndex } = this.data;
        if (reciteQueue.length === 0) {
            return;
        }

        const currentPos = reciteQueue.indexOf(currentIndex);
        if (currentPos < 0) {
            this.setData({
                ...this.buildSwiperState(reciteQueue[0]),
                isAnalysisVisible: false,
            });
            this.saveProgress();
            return;
        }

        const nextPos = currentPos + step;
        if (nextPos < 0 || nextPos >= reciteQueue.length) {
            return;
        }

        this.setData({
            ...this.buildSwiperState(reciteQueue[nextPos]),
            isAnalysisVisible: false,
        });
        this.saveProgress();
    },

    onPrev() {
        if (this.data.mode === 'recite') {
            this.moveInReciteQueue(-1);
            return;
        }

        if (this.data.currentIndex > 0) {
            const newIndex = this.data.currentIndex - 1;
            this.setData({
                ...this.buildSwiperState(newIndex),
                isAnalysisVisible: this.shouldShowAnalysis(newIndex),
            });
            this.saveProgress();
        }
    },

    onNext() {
        if (this.data.mode === 'recite') {
            this.moveInReciteQueue(1);
            return;
        }

        if (this.data.currentIndex < this.data.totalCount - 1) {
            const newIndex = this.data.currentIndex + 1;
            this.setData({
                ...this.buildSwiperState(newIndex),
                isAnalysisVisible: this.shouldShowAnalysis(newIndex),
            });
            this.saveProgress();
        }
    },

    onToggleAnswerSheet() {
        this.setData({
            showAnswerSheet: !this.data.showAnswerSheet,
        });
    },

    onToggleAnalysis() {
        this.setData({
            isAnalysisVisible: !this.data.isAnalysisVisible,
        });
    },

    onJumpToQuestion(e: WechatMiniprogram.TouchEvent) {
        const { index } = e.currentTarget.dataset as { index: number };
        this.setData({
            ...this.buildSwiperState(index),
            showAnswerSheet: false,
            isAnalysisVisible: this.shouldShowAnalysis(index),
        });
        this.saveProgress();
    },

    onConfirmAnswer() {
        this.setData({
            isAnalysisVisible: true,
        });
    },

    shouldShowAnalysis(index: number): boolean {
        const { mode, questions, answers } = this.data;

        if (mode === 'recite' || mode !== 'practice') {
            return false;
        }

        const question = questions[index];
        if (!question) {
            return false;
        }

        const userAnswer = answers[question._id];
        if (!userAnswer || userAnswer.length === 0) {
            return false;
        }

        return question.type === 'single' || question.type === 'judge' || question.type === 'multiple';
    },

    getReciteRepeatDelay(level: ReciteLevel, reviewTimes: number): number {
        if (level === 'unknown') {
            return 1;
        }

        if (level === 'fuzzy') {
            return 3;
        }

        return reviewTimes <= 1 ? 8 : -1;
    },

    countReciteLevels(reciteMastery: ReciteMasteryMap) {
        let knownCount = 0;
        let fuzzyCount = 0;
        let unknownCount = 0;

        Object.values(reciteMastery).forEach((level) => {
            if (level === 'known') {
                knownCount += 1;
                return;
            }

            if (level === 'fuzzy') {
                fuzzyCount += 1;
                return;
            }

            unknownCount += 1;
        });

        return {
            reciteKnownCount: knownCount,
            reciteFuzzyCount: fuzzyCount,
            reciteUnknownCount: unknownCount,
        };
    },

    async finishReciteSession() {
        const { totalCount, reciteKnownCount, reciteReviewedCount } = this.data;
        const masteryPercent = totalCount > 0
            ? Math.round((reciteKnownCount / totalCount) * 100)
            : 0;

        this._skipSaveOnExit = true;
        this.clearSavedProgress();

        await wx.showModal({
            title: '背题完成',
            content: `掌握度 ${masteryPercent}%\n待复习 0 题\n今日复习 ${reciteReviewedCount} 次`,
            showCancel: false,
            confirmText: '完成',
        });

        if (getCurrentPages().length > 1) {
            wx.navigateBack();
            return;
        }

        wx.switchTab({
            url: '/pages/index/index',
        });
    },

    onReciteMark(e: WechatMiniprogram.TouchEvent) {
        if (this.data.mode !== 'recite') {
            return;
        }

        const { level } = e.currentTarget.dataset as { level?: ReciteLevel };
        if (level !== 'known' && level !== 'fuzzy' && level !== 'unknown') {
            return;
        }

        const { questions, currentIndex } = this.data;
        const question = questions[currentIndex];
        if (!question) {
            return;
        }

        const questionId = question._id;
        this._reciteReviewTimes[questionId] = (this._reciteReviewTimes[questionId] || 0) + 1;
        const reviewTimes = this._reciteReviewTimes[questionId];
        this._reciteMastery[questionId] = level;

        const reciteQueue = this._reciteQueue;
        const currentPos = reciteQueue.indexOf(currentIndex);
        if (currentPos >= 0) {
            reciteQueue.splice(currentPos, 1);
        }

        const delay = this.getReciteRepeatDelay(level, reviewTimes);
        if (delay >= 0) {
            const insertAt = Math.min(reciteQueue.length, delay);
            reciteQueue.splice(insertAt, 0, currentIndex);
        }

        const recitePendingCount = new Set(reciteQueue).size;
        const reciteReviewedCount = this.data.reciteReviewedCount + 1;
        const reciteLevelCounts = this.countReciteLevels(this._reciteMastery);

        const updateData: Record<string, any> = {
            [`reciteMasteryClassMap.${questionId}`]: RECITE_CLASS_MAP[level],
            recitePendingCount,
            reciteReviewedCount,
            ...reciteLevelCounts,
        };

        if (reciteQueue.length === 0) {
            updateData.isAnalysisVisible = true;
            this.setData(updateData);
            this.finishReciteSession();
            return;
        }

        Object.assign(updateData, this.buildSwiperState(reciteQueue[0]));
        updateData.isAnalysisVisible = false;
        this.setData(updateData);
        this.saveProgress();
    },

    async onSubmit(isAuto = false) {
        if (this.data.mode === 'recite') {
            return;
        }

        const { answers, totalCount, sourceType } = this.data;
        let submitted = false;

        if (!isAuto) {
            const answeredCount = Object.keys(answers).length;
            if (answeredCount < totalCount) {
                const res = await wx.showModal({
                    title: '提示',
                    content: `还有 ${totalCount - answeredCount} 道题未作答，确认提交吗？`,
                    confirmText: '提交',
                    cancelText: '继续答题',
                });
                if (res.cancel) {
                    return;
                }
            }
        }

        if (this.data.timerId) {
            clearInterval(this.data.timerId);
        }

        wx.showLoading({ title: '提交中...' });

        try {
            const result = sourceType === 'personal'
                ? await api.submitExam({
                    categoryId: this.data.categoryId,
                    answers,
                })
                : await api.previewDemoExam({
                    categoryId: this.data.categoryId,
                    answers,
                });

            const fullResult = {
                ...result,
                categoryId: this.data.categoryId,
            };

            try {
                wx.setStorageSync(`exam_result_${this.data.categoryId}`, fullResult);
            } catch (error) {
                console.error('Failed to save result locally', error);
            }

            submitted = true;
            this._skipSaveOnExit = true;
            wx.redirectTo({
                url: `/pages/result/result?categoryId=${this.data.categoryId}`,
            });
        } catch (error) {
            wx.showToast({ title: '提交失败', icon: 'none' });
        } finally {
            wx.hideLoading();
            if (submitted) {
                this.clearSavedProgress();
            }
        }
    },

    buildReciteRestoreState(progress: any) {
        const questionCount = this.data.totalCount;
        const mastery = (progress.reciteMastery || {}) as ReciteMasteryMap;
        const reviewTimes = (progress.reciteReviewTimes || {}) as ReciteReviewMap;
        const queue = Array.isArray(progress.reciteQueue)
            ? progress.reciteQueue.filter((index: number) => index >= 0 && index < questionCount)
            : [];
        const reciteQueue = queue.length > 0 ? queue : this.data.questions.map((_question, index) => index);
        const reciteMasteryClassMap: ReciteClassMap = {};

        Object.keys(mastery).forEach((questionId) => {
            const level = mastery[questionId];
            if (RECITE_CLASS_MAP[level]) {
                reciteMasteryClassMap[questionId] = RECITE_CLASS_MAP[level];
            }
        });

        this._reciteQueue = reciteQueue;
        this._reciteMastery = mastery;
        this._reciteReviewTimes = reviewTimes;

        const reciteLevelCounts = this.countReciteLevels(mastery);
        const reciteReviewedCount = Object.values(reviewTimes).reduce((sum, value) => sum + (Number(value) || 0), 0);
        const currentIndex = Math.min(
            Math.max(Number(progress.currentIndex) || reciteQueue[0] || 0, 0),
            Math.max(questionCount - 1, 0)
        );

        return {
            ...this.buildSwiperState(currentIndex),
            answers: progress.answers || {},
            showResumeModal: false,
            isAnalysisVisible: false,
            reciteMasteryClassMap,
            recitePendingCount: new Set(reciteQueue).size,
            reciteReviewedCount,
            ...reciteLevelCounts,
        };
    },

    async onResumeConfirm() {
        const progress = this.data.pendingProgress;
        if (!progress) {
            return;
        }

        if (this.data.mode === 'recite') {
            this.setData(this.buildReciteRestoreState(progress));
            return;
        }

        const currentIndex = Math.min(
            Math.max(Number(progress.currentIndex) || 0, 0),
            Math.max(this.data.totalCount - 1, 0)
        );

        this.setData({
            ...this.buildSwiperState(currentIndex),
            answers: progress.answers || {},
            showResumeModal: false,
        });

        if (this.data.mode === 'practice') {
            this.setData({
                isAnalysisVisible: this.shouldShowAnalysis(currentIndex),
            });
        }

        if (this.data.mode === 'exam' && this.data.duration > 0) {
            this.startTimer(this.data.duration, progress.timeLeft);
        }
    },

    async onResumeCancel() {
        this.setData({ showResumeModal: false });
        this.clearSavedProgress();

        if (this.data.mode === 'exam' && this.data.duration > 0) {
            this.startTimer(this.data.duration);
        }
    },
});
