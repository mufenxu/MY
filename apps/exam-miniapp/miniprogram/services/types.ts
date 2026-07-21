export type LibraryScope = 'demo' | 'personal';

export interface Question {
    _id: string;
    type: 'single' | 'multiple' | 'judge' | 'fill';
    content: string;
    options: { label: string; value: string }[];
    answer: string[];
    analysis?: string;
    analysisSource?: 'manual' | 'ai';
    aiAnalysis?: string;
    aiAnalysisUpdatedAt?: string;
    scopeType?: LibraryScope;
    ownerOpenid?: string | null;
}

export interface AiAnalysisStatus {
    enabled: boolean;
    canUseAiAnalysis: boolean;
    canGenerateAiAnalysis?: boolean;
    model?: string;
}

export interface AiQuestionAnalysisPayload {
    questionId: string;
    forceRefresh?: boolean;
}

export interface AiQuestionAnalysisResult {
    analysis: string;
    model: string;
    createdAt: string;
    updatedAt?: string;
    persisted?: boolean;
    stored?: boolean;
    generated?: boolean;
}

export interface MajorCategory {
    _id: string;
    name: string;
    sortOrder: number;
    showOnHome?: boolean;
    scopeType?: LibraryScope;
    ownerOpenid?: string | null;
}

export interface Category {
    _id: string;
    name: string;
    count: number;
    duration: number;
    passingScore: number;
    isPublished?: boolean;
    majorCategoryId?: MajorCategory | string | null;
    scopeType?: LibraryScope;
    ownerOpenid?: string | null;
    librarySource?: 'owned' | 'assigned' | 'shared';
}

export interface QuestionSearchParams {
    keyword?: string;
    majorCategoryId?: string;
    categoryId?: string;
    searchScope?: 'all' | 'content' | 'option' | 'analysis';
    page?: number;
    limit?: number;
}

export interface QuestionSearchItem extends Question {
    categoryId: string;
    categoryName: string;
    majorCategoryId?: string;
    majorCategoryName?: string;
    matchFields?: ('content' | 'option' | 'analysis')[];
    matchSummary?: string;
    pinyinHighlightRanges?: {
        content?: { start: number; end: number }[];
        analysis?: { start: number; end: number }[];
        options?: Record<string, { start: number; end: number }[]>;
    };
}

export interface QuestionSearchResult {
    list: QuestionSearchItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export interface ExamResult {
    _id: string;
    userId?: string;
    categoryId?: string | Category;
    categoryName?: string;
    score: number;
    correctCount: number;
    totalCount: number;
    answers?: Record<string, string[]>;
    details?: Array<{
        question: Question;
        userAnswer: string[] | null;
        correctAnswer: string[];
        isCorrect: boolean;
    }>;
    createTime?: string;
    scopeType?: LibraryScope;
    ownerOpenid?: string | null;
}

export interface ExamProgress {
    categoryId: string;
    mode: string;
    currentIndex: number;
    answers: Record<string, string[]>;
    timeLeft?: number;
    deadlineAt?: string;
    attemptId?: string;
    questionCount?: number;
    reciteQueue?: number[];
    reciteMastery?: Record<string, 'known' | 'fuzzy' | 'unknown'>;
    reciteReviewTimes?: Record<string, number>;
    isCleared?: boolean;
    updateTime: string;
}

export type ProgressPayload = {
    categoryId: string;
    mode: string;
    currentIndex: number;
    answers: any;
    timeLeft?: number;
    deadlineAt?: string;
    attemptId?: string;
    questionCount?: number;
    reciteQueue?: number[];
    reciteMastery?: Record<string, string>;
    reciteReviewTimes?: Record<string, number>;
    isCleared?: boolean;
    updateTime?: string;
};

export interface ExamAttempt {
    attemptId: string;
    startedAt: string | null;
    deadlineAt: string | null;
    durationSeconds: number;
    serverNow: string;
    submissionGraceSeconds: number;
    expired: boolean;
    canSubmit: boolean;
}

export interface WrongQuestionCategory {
    categoryId: string;
    categoryName: string;
    questions: (Question & {
        userAnswer: string[];
        answeredAt: string;
        state?: WrongQuestionState;
    })[];
}

export interface ExamHistoryItem {
    id: string;
    title: string;
    score: number;
    time: string;
}

export interface WrongQuestionState {
    status: 'needsReview' | 'mastered';
    favorite: boolean;
    note: string;
    wrongCount: number;
    correctStreak: number;
    masteredAt?: string | null;
    lastWrongAt?: string | null;
    lastCorrectAt?: string | null;
    reviewStage: number;
    reviewIntervalDays: number;
    reviewEase: number;
    reviewCount: number;
    lapseCount: number;
    lastReviewedAt?: string | null;
    dueAt?: string | null;
}

export type ReviewRating = 'unknown' | 'fuzzy' | 'known';

export interface ReviewQuestion extends Question {
    categoryId: string;
    categoryName: string;
    state: WrongQuestionState;
}

export interface ReviewQueue {
    questions: ReviewQuestion[];
    dueCount: number;
}

export interface ReviewSummary {
    dueCount: number;
    scheduledCount: number;
    masteredCount: number;
    reviewedTodayCount: number;
}

export interface StudyReport {
    summary: {
        examCount: number;
        passCount: number;
        passRate: number;
        bestScore: number;
        averageScore: number;
        accuracy: number;
        totalQuestions: number;
        totalCorrect: number;
    };
    trendData: {
        dates: string[];
        counts: number[];
        averageScores: number[];
    };
    weakCategories: Array<{
        categoryId: string;
        categoryName: string;
        examCount: number;
        averageScore: number;
        wrongRate: number;
        wrongQuestions: number;
        totalQuestions: number;
        lastExamAt: string;
    }>;
    recentResults: Array<{
        id: string;
        title: string;
        score: number;
        correctCount: number;
        totalCount: number;
        time: string;
    }>;
}

export interface LoginResult {
    openid: string;
    token: string;
    nickname: string;
    avatarUrl: string;
}

export interface UserProfile {
    nickname: string;
    avatarUrl: string;
}

export interface UserSummary {
    examCount: number;
    passCount: number;
    bestScore: number;
    averageScore: number;
}

export interface ConsoleProfile {
    hasConsoleAccount: boolean;
    role: string;
    displayName: string;
    categoryCount: number;
    consolePath: string;
}

export interface ScanLoginSession {
    qrToken: string;
    qrCodeMode?: 'scheme' | 'link' | 'wxacode';
    qrCodeText?: string;
    qrCodeImage?: string;
    status: 'pending' | 'scanned' | 'confirmed' | 'consumed' | 'expired' | 'cancelled';
    intent: 'manage_login' | 'admin_login' | 'console_login' | 'admin_bind';
    title: string;
    description: string;
    confirmText: string;
    createTime?: string;
    requestIp?: string;
    expiresAt?: string;
    unavailable?: boolean;
}

export interface PaperShareInfo {
    shareCode: string;
    shareCodeText?: string;
    permission: 'view' | 'edit';
    permissionLabel?: string;
    expiresAt?: string | null;
    state?: string;
}

export interface PaperSharePreview {
    share: PaperShareInfo;
    sourceCategory: {
        _id: string;
        name: string;
        count: number;
        duration: number;
        passingScore: number;
    } | null;
    alreadyAccepted: boolean;
    importedCategory?: Category | null;
}

export interface AcceptPaperShareResult {
    created: boolean;
    share: PaperShareInfo;
    category: Category;
}
