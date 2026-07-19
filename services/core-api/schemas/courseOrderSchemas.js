const Joi = require('joi');

// 查课请求验证
const queryCourseSchema = Joi.object({
    school: Joi.string().allow('').max(100).optional(),
    user: Joi.string().required().max(100).messages({
        'any.required': '请输入账号',
        'string.empty': '账号不能为空',
        'string.max': '账号长度不能超过100个字符'
    }),
    pass: Joi.string().required().max(100).messages({
        'any.required': '请输入密码',
        'string.empty': '密码不能为空',
        'string.max': '密码长度不能超过100个字符'
    }),
    categoryId: Joi.string().required().messages({
        'any.required': '请选择网课平台',
        'string.empty': '网课平台不能为空'
    })
});

// 提交订单验证
const submitOrderSchema = Joi.object({
    school: Joi.string().allow('').max(100).optional(),
    user: Joi.string().required().max(100).messages({
        'any.required': '请输入账号',
        'string.empty': '账号不能为空'
    }),
    pass: Joi.string().required().max(100).messages({
        'any.required': '请输入密码',
        'string.empty': '密码不能为空'
    }),
    categoryId: Joi.string().required().messages({
        'any.required': '请选择网课平台'
    }),
    courseList: Joi.array().items(Joi.object({
        id: Joi.alternatives().try(Joi.string().allow(''), Joi.number()).optional(),
        kcid: Joi.alternatives().try(Joi.string().allow(''), Joi.number()).optional(),
        name: Joi.string().allow('').optional(),
        kcname: Joi.string().allow('').optional()
    }).unknown(true)).min(1).max(20).required().messages({
        'array.min': '请至少选择一门课程',
        'array.max': '单次最多提交20门课程',
        'any.required': '请选择课程'
    }),
    duration: Joi.number().integer().min(1).max(365).optional(),
    idempotencyKey: Joi.string().trim().min(16).max(128).optional()
});

module.exports = {
    queryCourseSchema,
    submitOrderSchema
};
