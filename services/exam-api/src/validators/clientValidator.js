/**
 * Joi schemas for client APIs
 */
const Joi = require('joi');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'categoryId format is invalid',
});
const shareCode = Joi.string().trim().uppercase().replace(/[\s-]/g, '').pattern(/^[A-Z0-9]{6,16}$/).messages({
    'string.pattern.base': '分享码格式不正确',
});

const getQuestions = {
    query: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        mode: Joi.string().valid('exam', 'practice').optional(),
    }),
};

const getCategories = {
    query: Joi.object({
        majorCategoryId: objectId.optional(),
    }),
};

const questionSearch = {
    query: Joi.object({
        keyword: Joi.string().allow('').max(100).optional(),
        majorCategoryId: objectId.optional(),
        categoryId: objectId.optional(),
        searchScope: Joi.string().valid('all', 'content', 'option', 'analysis').optional(),
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(50).optional(),
    }),
};

const submitExam = {
    body: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        answers: Joi.object().required().messages({
            'any.required': 'answers is required',
        }),
        attemptId: Joi.string().guid({ version: ['uuidv4'] }).optional(),
    }),
};

const startExamAttempt = {
    body: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        restart: Joi.boolean().default(false),
        requestId: Joi.string().guid({ version: ['uuidv4'] }).when('restart', {
            is: true,
            then: Joi.required(),
            otherwise: Joi.optional(),
        }),
    }),
};

const getLatestResult = {
    query: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
    }),
};

const saveProgress = {
    body: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        mode: Joi.string().valid('exam', 'practice', 'recite').default('exam'),
        currentIndex: Joi.number().integer().min(0).optional(),
        answers: Joi.object().optional(),
        timeLeft: Joi.number().integer().min(0).optional(),
        questionCount: Joi.number().integer().min(0).optional(),
        reciteQueue: Joi.array().items(Joi.number().integer().min(0)).optional(),
        reciteMastery: Joi.object().optional(),
        reciteReviewTimes: Joi.object().optional(),
        updateTime: Joi.date().iso().optional(),
        attemptId: Joi.string().guid({ version: ['uuidv4'] }).optional(),
    }),
};

const getProgress = {
    query: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        mode: Joi.string().valid('exam', 'practice', 'recite').default('exam'),
    }),
};

const clearProgress = {
    body: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
        mode: Joi.string().valid('exam', 'practice', 'recite').default('exam'),
        attemptId: Joi.string().guid({ version: ['uuidv4'] }).optional(),
    }),
};

const userLogin = {
    body: Joi.object({
        code: Joi.string().required().messages({
            'any.required': 'code is required',
        }),
    }),
};

const updateProfile = {
    body: Joi.object({
        nickname: Joi.string().max(100).allow('').optional(),
        avatarUrl: Joi.string().allow('').optional(),
    }),
};

const scanLoginQrCode = {
    body: Joi.object({
        qrToken: Joi.string().pattern(/^(?:[0-9a-f]{16}|[0-9a-f]{48})$/).required().messages({
            'any.required': 'qrToken is required',
            'string.pattern.base': 'qrToken is invalid',
        }),
    }),
};

const getExamHistory = {
    query: Joi.object({
        limit: Joi.number().integer().min(1).max(100).optional(),
    }),
};

const getUserSummary = {
    query: Joi.object({}),
};

const getStudyReport = {
    query: Joi.object({}),
};

const getWrongQuestions = {
    query: Joi.object({
        includeMastered: Joi.string().valid('true', 'false').optional(),
    }),
};

const wrongQuestionsByCategory = {
    params: Joi.object({
        categoryId: objectId.required().messages({
            'any.required': 'categoryId is required',
        }),
    }),
    query: Joi.object({
        includeMastered: Joi.string().valid('true', 'false').optional(),
    }),
};

const wrongQuestionState = {
    params: Joi.object({
        questionId: objectId.required().messages({
            'any.required': 'questionId is required',
        }),
    }),
    body: Joi.object({
        categoryId: objectId.optional(),
        status: Joi.string().valid('needsReview', 'mastered').optional(),
        favorite: Joi.boolean().optional(),
        note: Joi.string().max(500).allow('').optional(),
        answerResult: Joi.string().valid('correct', 'wrong').optional(),
    }).min(1),
};

const reviewQueue = {
    query: Joi.object({
        limit: Joi.number().integer().min(1).max(100).default(30),
        categoryId: objectId.optional(),
    }),
};

const reviewSummary = {
    query: Joi.object({}),
};

const reviewRating = {
    params: Joi.object({
        questionId: objectId.required().messages({
            'any.required': 'questionId is required',
        }),
    }),
    body: Joi.object({
        categoryId: objectId.optional(),
        rating: Joi.string().valid('unknown', 'fuzzy', 'known').required(),
    }),
};

const aiQuestionAnalysis = {
    body: Joi.object({
        questionId: objectId.required().messages({
            'any.required': 'questionId is required',
        }),
        forceRefresh: Joi.boolean().default(false),
    }),
};

const previewPaperShare = {
    query: Joi.object({
        shareCode: shareCode.required(),
    }),
};

const acceptPaperShare = {
    body: Joi.object({
        shareCode: shareCode.required(),
    }),
};

module.exports = {
    getQuestions,
    getCategories,
    questionSearch,
    submitExam,
    startExamAttempt,
    getLatestResult,
    saveProgress,
    getProgress,
    clearProgress,
    userLogin,
    updateProfile,
    scanLoginQrCode,
    getUserSummary,
    getStudyReport,
    getExamHistory,
    getWrongQuestions,
    wrongQuestionsByCategory,
    wrongQuestionState,
    reviewQueue,
    reviewSummary,
    reviewRating,
    aiQuestionAnalysis,
    previewPaperShare,
    acceptPaperShare,
};
