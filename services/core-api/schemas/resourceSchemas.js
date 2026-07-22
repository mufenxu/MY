const Joi = require('joi');

const nullableText = (max = 500) => Joi.string().allow('', null).max(max);

const dateText = Joi.string()
    .allow('', null)
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .messages({ 'string.pattern.base': '{{#label}} must be in YYYY-MM-DD format' });

const noticeDays = Joi.alternatives().try(
    Joi.number().integer().min(0).max(3650),
    Joi.string().allow('', null).max(20)
);

const resourceItemSchema = Joi.object({
    name: nullableText(200),
    host: nullableText(255),
    ip: nullableText(128),
    pointsTo: nullableText(255),
    region: nullableText(100),
    registrar: nullableText(200),
    siteUrl: nullableText(500),
    username: nullableText(255),
    password: nullableText(500),
    email: nullableText(320),
    config: Joi.any().optional(),
    note: nullableText(1000),
    registeredAt: dateText.optional(),
    expiresAt: dateText.optional(),
    advanceNoticeDays: noticeDays.optional(),
    renewPeriod: nullableText(50)
}).unknown(true);

exports.userResourceSchema = Joi.object({
    servers: Joi.array().items(resourceItemSchema).required(),
    domains: Joi.array().items(resourceItemSchema).required(),
    updatedAt: Joi.number().optional()
});
