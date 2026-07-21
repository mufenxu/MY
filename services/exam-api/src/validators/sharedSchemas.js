const Joi = require('joi');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': '无效的 ID 格式',
});

const createMajorCategoryFields = {
    name: Joi.string().max(200).required().messages({
        'any.required': '大分类名称不能为空',
    }),
    sortOrder: Joi.number().integer().optional(),
    showOnHome: Joi.boolean().optional(),
};

const updateMajorCategoryFields = {
    name: Joi.string().max(200).optional(),
    sortOrder: Joi.number().integer().optional(),
    showOnHome: Joi.boolean().optional(),
};

const createCategoryFields = {
    name: Joi.string().max(200).required().messages({
        'any.required': '分类名称不能为空',
    }),
    description: Joi.string().allow('').max(300).optional(),
    count: Joi.number().integer().min(0).optional(),
    duration: Joi.number().integer().min(0).optional(),
    passingScore: Joi.number().integer().min(0).max(100).optional(),
    isPublished: Joi.boolean().optional(),
    majorCategoryId: Joi.string().allow(null, '').optional(),
};

const updateCategoryFields = {
    name: Joi.string().max(200).optional(),
    description: Joi.string().allow('').max(300).optional(),
    count: Joi.number().integer().min(0).optional(),
    duration: Joi.number().integer().min(0).optional(),
    passingScore: Joi.number().integer().min(0).max(100).optional(),
    isPublished: Joi.boolean().optional(),
    majorCategoryId: Joi.string().allow(null, '').optional(),
};

const batchQuestion = Joi.object({
    _id: objectId.optional(),
    type: Joi.string().valid('single', 'multiple', 'judge', 'fill').required(),
    content: Joi.string().required(),
    options: Joi.array().items(Joi.object({
        label: Joi.string().required(),
        value: Joi.string().required(),
    })).optional(),
    answer: Joi.array().items(Joi.string()).min(1).required(),
    analysis: Joi.string().allow('').optional(),
});

const batchUpdateQuestionFields = {
    questions: Joi.array().items(batchQuestion).required(),
};

const generateAiAnalysisFields = {
    limit: Joi.number().integer().min(1).max(50).default(10),
    forceRefresh: Joi.boolean().default(false),
    questionIds: Joi.array().items(objectId).max(50).default([]),
};

const createPaperShareFields = {
    permission: Joi.string().valid('view', 'edit').default('view'),
    expiresAt: Joi.date().iso().allow(null).optional(),
    maxAcceptCount: Joi.number().integer().min(0).max(10000).default(0),
    note: Joi.string().max(200).allow('').optional(),
};

module.exports = {
    batchUpdateQuestionFields,
    createCategoryFields,
    createMajorCategoryFields,
    createPaperShareFields,
    generateAiAnalysisFields,
    objectId,
    updateCategoryFields,
    updateMajorCategoryFields,
};
