const Joi = require('joi');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': '无效的 ID 格式',
});
const shareCode = Joi.string().trim().uppercase().replace(/[\s-]/g, '').pattern(/^[A-Z0-9]{6,16}$/).messages({
    'string.pattern.base': '分享码格式不正确',
});

const paginationQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(1000).default(20),
        pageSize: Joi.number().integer().min(1).max(1000).optional(),
        categoryId: objectId.optional(),
        majorCategoryId: objectId.optional(),
    }),
};

const idParam = {
    params: Joi.object({
        id: objectId.required(),
    }),
};

const wechatAuth = {
    body: Joi.object({
        tempAuthCode: Joi.string().required().messages({
            'any.required': 'tempAuthCode 不能为空',
        }),
    }),
};

const createMajorCategory = {
    body: Joi.object({
        name: Joi.string().max(200).required().messages({
            'any.required': '大分类名称不能为空',
        }),
        sortOrder: Joi.number().integer().optional(),
        showOnHome: Joi.boolean().optional(),
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
    }),
};

const createQuestion = {
    body: Joi.object({
        type: Joi.string().valid('single', 'multiple', 'judge', 'fill').required(),
        content: Joi.string().required(),
        options: Joi.array().items(
            Joi.object({
                label: Joi.string().required(),
                value: Joi.string().required(),
            }),
        ).optional(),
        answer: Joi.array().items(Joi.string()).min(1).required(),
        analysis: Joi.string().allow('').optional(),
        categoryId: objectId.required(),
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
        categoryId: objectId.optional(),
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

const feedbackQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        status: Joi.string().valid('open', 'replied', 'closed').optional(),
    }),
};

const createFeedback = {
    body: Joi.object({
        category: Joi.string().valid('bug', 'feature', 'content', 'account', 'other').default('other'),
        title: Joi.string().trim().max(100).required().messages({
            'any.required': '反馈标题不能为空',
        }),
        content: Joi.string().trim().max(2000).required().messages({
            'any.required': '反馈内容不能为空',
        }),
        contact: Joi.string().trim().max(120).allow('').optional(),
    }),
};

module.exports = {
    paginationQuery,
    idParam,
    wechatAuth,
    createMajorCategory,
    updateMajorCategory,
    createCategory,
    updateCategory,
    createQuestion,
    updateQuestion,
    batchUpdateQuestions,
    generateAiAnalyses,
    createPaperShare,
    previewPaperShare,
    acceptPaperShare,
    feedbackQuery,
    createFeedback,
};
