const Joi = require('joi');

const updateMeSchema = Joi.object({
    nickName: Joi.string().max(50).optional().messages({
        'string.max': '昵称最长50个字符'
    }),
    avatarUrl: Joi.string().uri().allow('').optional().messages({
        'string.uri': '头像地址格式不正确'
    })
});

const updateUserSchema = Joi.object({
    role: Joi.string().valid('user', 'admin', 'super_admin').optional().messages({
        'any.only': '无效的角色类型'
    }),
    status: Joi.string().valid('active', 'banned', 'disabled').optional().messages({
        'any.only': '无效的状态'
    }),
    nickName: Joi.string().max(50).optional().messages({
        'string.max': '昵称最长50个字符'
    }),
    permissions: Joi.array().items(Joi.string()).optional().messages({
        'array.base': '权限必须是数组'
    })
});

module.exports = {
    updateMeSchema,
    updateUserSchema
};
