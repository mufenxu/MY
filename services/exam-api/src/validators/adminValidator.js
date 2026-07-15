/**
 * 管理员相关接口的 Joi 验证 schema。
 */
const Joi = require('joi');

const MIN_ADMIN_PASSWORD_LENGTH = 12;

const strongPassword = Joi.string()
    .min(MIN_ADMIN_PASSWORD_LENGTH)
    .max(128)
    .custom((value, helpers) => {
        const hasLower = /[a-z]/.test(value);
        const hasUpper = /[A-Z]/.test(value);
        const hasNumber = /\d/.test(value);
        const hasSymbol = /[^A-Za-z0-9]/.test(value);

        if (!hasLower || !hasUpper || !hasNumber || !hasSymbol) {
            return helpers.error('password.weak');
        }

        return value;
    });

const login = {
    body: Joi.object({
        username: Joi.string().trim().required().messages({
            'string.empty': '用户名不能为空',
            'any.required': '用户名不能为空',
        }),
        password: Joi.string().max(128).required().messages({
            'string.empty': '密码不能为空',
            'string.max': '密码长度不能超过 128 位',
            'any.required': '密码不能为空',
        }),
    }),
};

const changePassword = {
    body: Joi.object({
        oldPassword: Joi.string().max(128).required().messages({
            'string.max': '旧密码长度不能超过 128 位',
            'any.required': '请填写旧密码',
        }),
        newPassword: strongPassword.required().messages({
            'string.min': `新密码长度不能少于 ${MIN_ADMIN_PASSWORD_LENGTH} 位`,
            'string.max': '新密码长度不能超过 128 位',
            'password.weak': '新密码需包含大写字母、小写字母、数字和特殊符号',
            'any.required': '请填写新密码',
        }),
    }),
};

const wechatAuth = {
    body: Joi.object({
        tempAuthCode: Joi.string().required().messages({
            'any.required': 'tempAuthCode 不能为空',
        }),
    }),
};

module.exports = { login, changePassword, wechatAuth };
