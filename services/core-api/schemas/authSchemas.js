const Joi = require('joi');

const loginSchema = Joi.object({
    username: Joi.string().required().messages({
        'string.empty': '用户名不能为空',
        'any.required': '请输入用户名'
    }),
    password: Joi.string().required().messages({
        'string.empty': '密码不能为空',
        'any.required': '请输入密码'
    }),
    captchaToken: Joi.string().allow(null, '').optional()
});

const wechatLoginSchema = Joi.object({
    code: Joi.string().required().messages({
        'any.required': 'Code is required'
    }),
    userInfo: Joi.object({
        nickName: Joi.string().optional(),
        avatarUrl: Joi.string().optional(),
        gender: Joi.number().optional(),
        country: Joi.string().optional(),
        province: Joi.string().optional(),
        city: Joi.string().optional(),
        language: Joi.string().optional()
    }).optional()
});

module.exports = {
    loginSchema,
    wechatLoginSchema
};
