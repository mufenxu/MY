const Joi = require('joi');

exports.notifyConfigSchema = Joi.object({
    emailEnabled: Joi.boolean().default(false),
    smtpHost: Joi.string().hostname().allow('').max(255),
    smtpPort: Joi.alternatives().try(
        Joi.number().integer().min(1).max(65535),
        Joi.string().pattern(/^\d{1,5}$/)
    ).allow(''),
    smtpUser: Joi.string().email().allow('').max(320),
    smtpPass: Joi.string().allow('').max(1024),
    toList: Joi.string().allow('').max(4000),
    qywxEnabled: Joi.boolean().default(false),
    qywxApiKey: Joi.string().allow('').max(1024),
    qywxToUser: Joi.string().allow('').max(2000),
    qywxToParty: Joi.string().allow('').max(2000),
    qywxToTag: Joi.string().allow('').max(2000),
    qywxAgentId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(''),
    advanceDays: Joi.alternatives().try(Joi.string(), Joi.number().integer().min(0).max(3650)).allow('')
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
