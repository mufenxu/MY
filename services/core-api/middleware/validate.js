'use strict';

const Joi = require('joi');
const AppError = require('../utils/AppError');

const SOURCES = ['body', 'query', 'params'];

const DEFAULT_OPTIONS = {
    abortEarly: false,
    // 未声明的字段直接丢弃，而不是留在 req.body 里等下一次重构被误用。
    stripUnknown: true,
    allowUnknown: false,
    convert: true,
};

function isJoiSchema(value) {
    if (!value) return false;
    if (typeof Joi.isSchema === 'function') return Joi.isSchema(value);
    return typeof value.validate === 'function';
}

function toValidationError(details) {
    const error = new AppError(details.map((item) => item.message).join('；') || '提交的内容不合法。', 400);
    error.code = 'VALIDATION_FAILED';
    error.details = details;
    return error;
}

function formatDetails(error) {
    return error.details.map((detail) => ({
        field: Array.isArray(detail.path) ? detail.path.join('.') : String(detail.path || ''),
        message: detail.message,
    }));
}

/**
 * Express 5 把 req.query 定义成只读 getter，直接赋值不会生效（严格模式下抛 TypeError）。
 * 这里对 query 采用原地替换，body/params 仍是普通属性可以直接赋值。
 */
function applyValue(req, source, value) {
    if (source === 'query') {
        for (const key of Object.keys(req.query)) delete req.query[key];
        Object.assign(req.query, value);
        return;
    }
    req[source] = value;
}

/**
 * 请求校验中间件工厂，支持两种写法：
 *
 * 1. 存量写法（core-api 现有 13 处）：`validate(joiSchema)` —— 只校验 body。
 * 2. 新写法：`validate({ body: s1, query: s2, params: s3 })` —— 三处来源都校验，
 *    与 `exam-api/src/middleware/validate.js` 的行为一致。
 *
 * 失败时抛 AppError(400, code=VALIDATION_FAILED, details[])，由 errorHandler 统一成
 * `{ ok:false, code:'VALIDATION_FAILED', details:[{field,message}], requestId }`。
 */
const validate = (schema, options = {}) => (req, res, next) => {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    const errors = [];

    if (isJoiSchema(schema)) {
        const { error, value } = schema.validate(req.body, settings);
        if (error) {
            errors.push(...formatDetails(error));
        } else {
            req.body = value;
        }
    } else {
        for (const source of SOURCES) {
            if (!schema || !schema[source]) continue;
            const { error, value } = schema[source].validate(req[source], settings);
            if (error) {
                errors.push(...formatDetails(error));
            } else {
                applyValue(req, source, value);
            }
        }
    }

    if (errors.length > 0) {
        return next(toValidationError(errors));
    }
    return next();
};

module.exports = validate;
