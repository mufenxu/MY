const Joi = require('joi');
const {
    batchUpdateQuestionFields,
    createCategoryFields,
    createMajorCategoryFields,
    createPaperShareFields,
    generateAiAnalysisFields,
    objectId,
    updateCategoryFields,
    updateMajorCategoryFields,
} = require('./sharedSchemas');
const shareCode = Joi.string().trim().uppercase().replace(/[\s-]/g, '').pattern(/^[A-Z0-9]{6,16}$/).messages({
    'string.pattern.base': '分享码格式不正确',
});
const qualityIssue = Joi.string().valid(
    'missing_analysis',
    'missing_answer',
    'insufficient_options',
    'duplicate_option_label',
    'empty_option',
    'answer_not_in_options',
    'single_answer_count',
    'duplicate_content',
    'stale_question',
).allow('').optional();

const paginationQuery = {
    query: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        pageSize: Joi.number().integer().min(1).max(100).optional(),
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
    body: Joi.object(createMajorCategoryFields),
};

const updateMajorCategory = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object(updateMajorCategoryFields),
};

const createCategory = {
    body: Joi.object(createCategoryFields),
};

const updateCategory = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object(updateCategoryFields),
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

const questionVersionList = {
    params: Joi.object({
        id: objectId.required(),
    }),
    query: Joi.object({
        page: Joi.number().integer().min(1).max(10000).default(1),
        limit: Joi.number().integer().min(1).max(50).default(20),
    }),
};

const questionVersionParam = {
    params: Joi.object({
        id: objectId.required(),
        revision: Joi.number().integer().min(1).required(),
    }),
};

const questionQuality = {
    query: Joi.object({
        categoryId: objectId.optional(),
        page: Joi.number().integer().min(1).max(1000).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        issue: qualityIssue,
        staleDays: Joi.number().integer().min(30).max(3650).default(365),
        scanLimit: Joi.number().integer().min(100).max(10000).default(2000),
    }),
};

const batchUpdateQuestions = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object(batchUpdateQuestionFields),
};

const generateAiAnalyses = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object(generateAiAnalysisFields),
};

const createPaperShare = {
    params: Joi.object({
        id: objectId.required(),
    }),
    body: Joi.object(createPaperShareFields),
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
    questionVersionList,
    questionVersionParam,
    questionQuality,
    batchUpdateQuestions,
    generateAiAnalyses,
    createPaperShare,
    previewPaperShare,
    acceptPaperShare,
    feedbackQuery,
    createFeedback,
};
