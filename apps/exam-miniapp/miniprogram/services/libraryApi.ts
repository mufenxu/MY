import { request } from '../utils/request';
import { authApi } from './authApi';
import { buildQuery } from './shared';
import {
    Category,
    MajorCategory,
    Question,
    QuestionSearchParams,
    QuestionSearchResult,
} from './types';

const CACHE_TTL = 5 * 60 * 1000;
let majorCategoriesCache: { data: MajorCategory[]; timestamp: number } | null = null;
let categoriesCache: Record<string, { data: Category[]; timestamp: number }> = {};

export const libraryApi = {
    getMajorCategories: async () => {
        const now = Date.now();
        if (majorCategoriesCache && (now - majorCategoriesCache.timestamp < CACHE_TTL)) {
            return majorCategoriesCache.data;
        }
        const data = await request<MajorCategory[]>({ url: '/major-categories' });
        majorCategoriesCache = { data, timestamp: now };
        return data;
    },

    getCategories: async (majorCategoryId?: string) => {
        const now = Date.now();
        const cacheKey = `demo:${majorCategoryId || 'all'}`;
        if (categoriesCache[cacheKey] && (now - categoriesCache[cacheKey].timestamp < CACHE_TTL)) {
            return categoriesCache[cacheKey].data;
        }

        const url = majorCategoryId
            ? `/categories${buildQuery({ majorCategoryId })}`
            : '/categories';
        const data = await request<Category[]>({ url });
        categoriesCache[cacheKey] = { data, timestamp: now };
        return data;
    },

    getMyMajorCategories: async () => {
        await authApi.ensureAuth();
        return request<MajorCategory[]>({ url: '/my/major-categories' });
    },

    getMyCategories: async (majorCategoryId?: string) => {
        await authApi.ensureAuth();
        const url = majorCategoryId
            ? `/my/categories${buildQuery({ majorCategoryId })}`
            : '/my/categories';
        return request<Category[]>({ url });
    },

    getQuestions: (categoryId: string, mode: 'exam' | 'practice' = 'exam') => {
        return request<Question[]>({ url: `/questions${buildQuery({ categoryId, mode })}` });
    },

    getMyQuestions: async (categoryId: string, mode: 'exam' | 'practice' = 'exam') => {
        await authApi.ensureAuth();
        return request<Question[]>({ url: `/my/questions${buildQuery({ categoryId, mode })}` });
    },

    searchQuestions: (params: QuestionSearchParams) => {
        const { keyword, majorCategoryId, categoryId, searchScope, page = 1, limit = 20 } = params;
        const query = buildQuery({ keyword, majorCategoryId, categoryId, searchScope, page, limit });
        return request<QuestionSearchResult>({ url: `/question-search${query}` });
    },

    searchMyQuestions: async (params: QuestionSearchParams) => {
        await authApi.ensureAuth();
        const { keyword, majorCategoryId, categoryId, searchScope, page = 1, limit = 20 } = params;
        const query = buildQuery({ keyword, majorCategoryId, categoryId, searchScope, page, limit });
        return request<QuestionSearchResult>({ url: `/my/question-search${query}` });
    },

    clearLibraryCache: () => {
        categoriesCache = {};
        majorCategoriesCache = null;
    },
};
