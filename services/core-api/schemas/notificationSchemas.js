const Joi = require('joi');

exports.notificationSchema = Joi.object({
    title: Joi.string().required().max(100),
    content: Joi.string().required().max(2000),
    level: Joi.string().valid('info', 'warning', 'error', 'success').default('info'),
    audience: Joi.string().valid('all', 'admin', 'user').default('all'),
    is_published: Joi.boolean().default(true)
});

exports.notificationUpdateSchema = Joi.object({
    title: Joi.string().max(100),
    content: Joi.string().max(2000),
    level: Joi.string().valid('info', 'warning', 'error', 'success'),
    audience: Joi.string().valid('all', 'admin', 'user'),
    is_published: Joi.boolean()
});
