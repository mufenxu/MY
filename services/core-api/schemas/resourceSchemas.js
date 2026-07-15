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

const apiServerSchema = Joi.alternatives().try(
    Joi.string().uri(),
    Joi.object({
        name: nullableText(100),
        url: nullableText(500).required(),
        isActive: Joi.boolean().optional()
    }).unknown(true)
);

const imageResourceSchema = Joi.alternatives().try(
    Joi.string().uri(),
    Joi.object({
        key: nullableText(100).required(),
        url: nullableText(500).required(),
        description: nullableText(1000)
    }).unknown(true)
);

const cdnSchema = Joi.alternatives().try(
    Joi.string().uri(),
    Joi.object({
        name: nullableText(100),
        url: nullableText(500).required(),
        isActive: Joi.boolean().optional()
    }).unknown(true)
);

exports.globalResourceSchema = Joi.object({
    apiServers: Joi.array().items(apiServerSchema).required(),
    images: Joi.array().items(imageResourceSchema).required(),
    cdns: Joi.array().items(cdnSchema).required(),
    constants: Joi.array().items(Joi.object({
        key: Joi.string().required(),
        value: Joi.any().required(),
        type: Joi.string().valid('string', 'number', 'boolean', 'json').default('string'),
        description: nullableText(1000)
    })).default([])
});

exports.userResourceSchema = Joi.object({
    servers: Joi.array().items(resourceItemSchema).required(),
    domains: Joi.array().items(resourceItemSchema).required(),
    updatedAt: Joi.number().optional()
});
