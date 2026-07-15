/**
 * Admin/manage API Joi schemas
 */
const Joi = require('joi');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': '无效的 ID 格式',
});
const scopeType = Joi.string().valid('admin', 'demo', 'personal', 'all').optional();

const idParam = {
    params: Joi.object({
        id: objectId.required(),
    }),
    query: Joi.object({
        scopeType,
    }),
};

const openidParam = {
    params: Joi.object({
        openid: Joi.string().required(),
    }),
};

const paginationQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(1000).default(20),
        pageSize: Joi.number().integer().min(1).max(1000).optional(),
        categoryId: objectId.optional(),
        userId: Joi.string().optional(),
        keyword: Joi.string().optional(),
        all: Joi.string().valid('true', 'false').optional(),
        scopeType,
    }),
};

const createQuestion = {
    body: Joi.object({
        type: Joi.string().valid('single', 'multiple', 'judge', 'fill').required().messages({
            'any.only': '题目类型必须是 single/multiple/judge/fill 之一',
        }),
        content: Joi.string().required().messages({
            'any.required': '题目内容不能为空',
        }),
        options: Joi.array().items(
            Joi.object({
                label: Joi.string().required(),
                value: Joi.string().required(),
            }),
        ).optional(),
        answer: Joi.array().items(Joi.string()).min(1).required().messages({
            'array.min': '至少需要一个答案',
        }),
        analysis: Joi.string().allow('').optional(),
        categoryId: Joi.string().required().messages({
            'any.required': '所属分类不能为空',
        }),
        scopeType,
    }),
};

const updateQuestion = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        type: Joi.string().valid('single', 'multiple', 'judge', 'fill').optional(),
        content: Joi.string().optional(),
        options: Joi.array().items(
            Joi.object({
                label: Joi.string().required(),
                value: Joi.string().required(),
            }),
        ).optional(),
        answer: Joi.array().items(Joi.string()).min(1).optional(),
        analysis: Joi.string().allow('').optional(),
        categoryId: Joi.string().optional(),
        scopeType,
    }),
};

const batchUpdateQuestions = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        questions: Joi.array().items(
            Joi.object({
                _id: objectId.optional(),
                type: Joi.string().valid('single', 'multiple', 'judge', 'fill').required(),
                content: Joi.string().required(),
                options: Joi.array().items(Joi.object({
                    label: Joi.string().required(),
                    value: Joi.string().required(),
                })).optional(),
                answer: Joi.array().items(Joi.string()).min(1).required(),
                analysis: Joi.string().allow('').optional(),
            }),
        ).required(),
        scopeType,
    }),
};

const generateAiAnalyses = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        limit: Joi.number().integer().min(1).max(50).default(10),
        forceRefresh: Joi.boolean().default(false),
        questionIds: Joi.array().items(objectId).max(50).default([]),
        scopeType,
    }),
};

const deleteExamResults = {
    body: Joi.object({
        ids: Joi.array().items(objectId).min(1).required().messages({
            'array.min': '至少需要一个 ID',
        }),
    }),
};

const deleteUsers = {
    body: Joi.object({
        openids: Joi.array().items(Joi.string()).min(1).required().messages({
            'array.min': '至少需要一个 openid',
        }),
    }),
};

const updateUserAssignments = {
    params: Joi.object({
        openid: Joi.string().required(),
    }),
    body: Joi.object({
        majorCategoryIds: Joi.array().items(objectId).default([]),
        categoryIds: Joi.array().items(objectId).default([]),
    }),
};

const createCategory = {
    body: Joi.object({
        name: Joi.string().max(200).required().messages({
            'any.required': '分类名称不能为空',
        }),
        description: Joi.string().allow('').max(300).optional(),
        count: Joi.number().integer().min(0).optional(),
        duration: Joi.number().integer().min(0).optional(),
        passingScore: Joi.number().integer().min(0).max(100).optional(),
        isPublished: Joi.boolean().optional(),
        majorCategoryId: Joi.string().allow(null, '').optional(),
        scopeType,
    }),
};

const updateCategory = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        name: Joi.string().max(200).optional(),
        description: Joi.string().allow('').max(300).optional(),
        count: Joi.number().integer().min(0).optional(),
        duration: Joi.number().integer().min(0).optional(),
        passingScore: Joi.number().integer().min(0).max(100).optional(),
        isPublished: Joi.boolean().optional(),
        majorCategoryId: Joi.string().allow(null, '').optional(),
        scopeType,
    }),
};

const createMajorCategory = {
    body: Joi.object({
        name: Joi.string().max(200).required().messages({
            'any.required': '大分类名称不能为空',
        }),
        sortOrder: Joi.number().integer().optional(),
        showOnHome: Joi.boolean().optional(),
        scopeType,
    }),
};

const updateMajorCategory = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        name: Joi.string().max(200).optional(),
        sortOrder: Joi.number().integer().optional(),
        showOnHome: Joi.boolean().optional(),
        scopeType,
    }),
};

const createPaperShare = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        permission: Joi.string().valid('view', 'edit').default('view'),
        expiresAt: Joi.date().iso().allow(null).optional(),
        maxAcceptCount: Joi.number().integer().min(0).max(10000).default(0),
        note: Joi.string().max(200).allow('').optional(),
        scopeType,
    }),
};

const feedbackQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        status: Joi.string().valid('open', 'replied', 'closed').optional(),
        keyword: Joi.string().trim().max(100).allow('').optional(),
    }),
};

const personalCategoryQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        keyword: Joi.string().trim().max(100).allow('').optional(),
        ownerStudyId: Joi.string().trim().max(32).allow('').optional(),
        publishStatus: Joi.string().valid('all', 'published', 'hidden').default('all'),
        source: Joi.string().valid('all', 'owned', 'shared').default('all'),
    }),
};

const personalCategoryQuestionsQuery = {
    params: Joi.object({
        id: objectId.required(),
    }),
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(200).default(50),
    }),
};

const replyFeedback = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        replyContent: Joi.string().trim().max(2000).required().messages({
            'any.required': '回复内容不能为空',
        }),
        closeAfterReply: Joi.boolean().default(false),
    }),
};

const updateFeedbackStatus = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object({
        status: Joi.string().valid('open', 'closed').required(),
    }),
};

module.exports = {
    idParam,
    openidParam,
    paginationQuery,
    createQuestion,
    updateQuestion,
    batchUpdateQuestions,
    generateAiAnalyses,
    deleteExamResults,
    deleteUsers,
    updateUserAssignments,
    createCategory,
    updateCategory,
    createMajorCategory,
    updateMajorCategory,
    createPaperShare,
    feedbackQuery,
    personalCategoryQuery,
    personalCategoryQuestionsQuery,
    replyFeedback,
    updateFeedbackStatus,
};
