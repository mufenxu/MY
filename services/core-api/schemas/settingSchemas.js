const Joi = require('joi');

exports.notifyConfigSchema = Joi.object({
    provider: Joi.string().valid('wechat', 'email', 'sms', 'none').required(),
    webhookUrl: Joi.string().uri().allow(''),
    secret: Joi.string().allow('')
});

exports.adminInfoSchema = Joi.object({
    newUsername: Joi.string().min(3).max(30).allow(''),
    currentPassword: Joi.string().allow(''),
    newPassword: Joi.string().min(8).max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .message('密码必须包含大小写字母和数字，且长度在8-128之间')
        .allow('')
});

exports.cronConfigSchema = Joi.object({
    type: Joi.string().valid('due_reminder', 'todo_reminder', 'ct8_task').required(),
    enabled: Joi.boolean().required(),
    schedule: Joi.string().required() // 可以加 cron 表达式校验，这里简单限制为 string
});

exports.appConfigSchema = Joi.object({
    key: Joi.string().required(),
    value: Joi.any().required(),
    remark: Joi.string().allow(''),
    description: Joi.string().allow('')
});
