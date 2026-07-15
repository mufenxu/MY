const Joi = require('joi');

const qrToken = Joi.string().pattern(/^[0-9a-f]{48}$/).messages({
    'string.pattern.base': '二维码参数无效',
});

const pollToken = Joi.string().pattern(/^[0-9a-f]{48}$/).messages({
    'string.pattern.base': '轮询参数无效',
});

const createQrCode = {
    body: Joi.object({
        intent: Joi.string().valid('manage_login', 'admin_login', 'console_login', 'admin_bind').required().messages({
            'any.required': 'intent 不能为空',
            'any.only': 'intent 不支持',
        }),
        oldQrToken: qrToken.empty('').optional(),
    }),
};

const wechatAuth = {
    body: Joi.object({
        tempAuthCode: Joi.string().required().messages({
            'any.required': 'tempAuthCode 不能为空',
        }),
    }),
};

const getQrCodeStatus = {
    query: Joi.object({
        qrToken: qrToken.required().messages({
            'any.required': 'qrToken 不能为空',
        }),
        pollToken: pollToken.required().messages({
            'any.required': 'pollToken 不能为空',
        }),
    }),
};

module.exports = {
    createQrCode,
    getQrCodeStatus,
    wechatAuth,
};
