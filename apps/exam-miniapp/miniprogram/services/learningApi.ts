import { request } from '../utils/request';
import { authApi } from './authApi';
import { buildQuery } from './shared';
import {
    AiAnalysisStatus,
    AiQuestionAnalysisPayload,
    AiQuestionAnalysisResult,
    ConsoleProfile,
    ExamHistoryItem,
    ExamResult,
    StudyReport,
    UserProfile,
    UserSummary,
    WrongQuestionCategory,
    WrongQuestionState,
} from './types';

const AI_ANALYSIS_TIMEOUT_MS = 45_000;

export const learningApi = {
    getAiAnalysisStatus: async () => {
        await authApi.ensureAuth();
        return request<AiAnalysisStatus>({
            url: '/api/user/ai/status',
            showError: false,
        });
    },

    generateQuestionAiAnalysis: async (data: AiQuestionAnalysisPayload) => {
        await authApi.ensureAuth();
        return request<AiQuestionAnalysisResult>({
            url: '/api/user/ai/question-analysis',
            method: 'POST',
            data,
            showError: false,
            timeout: AI_ANALYSIS_TIMEOUT_MS,
        });
    },

    previewDemoExam: (data: { categoryId: string; answers: Record<string, string[]> }) => {
        return request<ExamResult>({
            url: '/demo/exam/preview-submit',
            method: 'POST',
            data,
        });
    },

    submitExam: async (data: { categoryId: string; answers: Record<string, string[]> }) => {
        await authApi.ensureAuth();
        return request<ExamResult>({ url: '/exam/submit', method: 'POST', data });
    },

    getLatestExamResult: async (categoryId: string) => {
        await authApi.ensureAuth();
        return request<ExamResult>({ url: `/exam/latest${buildQuery({ categoryId })}` });
    },

    updateUserProfile: async (data: { nickname?: string; avatarUrl?: string }) => {
        await authApi.ensureAuth();
        return request<UserProfile>({
            url: '/api/user/profile',
            method: 'POST',
            data,
        });
    },

    getUserSummary: async () => {
        await authApi.ensureAuth();
        return request<UserSummary>({ url: '/api/user/summary' });
    },

    getStudyReport: async () => {
        await authApi.ensureAuth();
        return request<StudyReport>({ url: '/api/user/study-report' });
    },

    getWrongQuestions: async (options: { includeMastered?: boolean } = {}) => {
        await authApi.ensureAuth();
        return request<WrongQuestionCategory[]>({
            url: `/wrong-questions${buildQuery({ includeMastered: options.includeMastered ? 'true' : undefined })}`,
        });
    },

    getWrongQuestionsByCategory: async (categoryId: string, options: { includeMastered?: boolean } = {}) => {
        await authApi.ensureAuth();
        return request<WrongQuestionCategory>({
            url: `/wrong-questions/${categoryId}${buildQuery({ includeMastered: options.includeMastered ? 'true' : undefined })}`,
        });
    },

    updateWrongQuestionState: async (
        questionId: string,
        data: {
            categoryId?: string;
            status?: 'needsReview' | 'mastered';
            favorite?: boolean;
            note?: string;
            answerResult?: 'correct' | 'wrong';
        },
    ) => {
        await authApi.ensureAuth();
        return request<WrongQuestionState>({
            url: `/wrong-questions/${questionId}/state`,
            method: 'POST',
            data,
            showError: false,
        });
    },

    getUserExamHistory: async () => {
        await authApi.ensureAuth();
        return request<ExamHistoryItem[]>({ url: '/api/user/exam-history' });
    },

    getConsoleProfile: async () => {
        await authApi.ensureAuth();
        return request<ConsoleProfile>({ url: '/api/user/console-profile' });
    },
};
