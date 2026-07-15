/**
 * Joi 请求参数验证中间件工厂
 * 支持验证 body、query、params
 */
const { ValidationError } = require('../utils/errors');

/**
 * 创建验证中间件
 * @param {Object} schema - Joi schema 对象，key 为 body/query/params
 * @returns {Function} Express 中间件
 */
function validate(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const source of ['body', 'query', 'params']) {
            if (schema[source]) {
                const { error, value } = schema[source].validate(req[source], {
                    abortEarly: false,
                    stripUnknown: true,
                    allowUnknown: false,
                });
                if (error) {
                    errors.push(
                        ...error.details.map((d) => d.message),
                    );
                } else {
                    // 用经过验证和清洗的值替换原始值
                    req[source] = value;
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '));
        }

        next();
    };
}

module.exports = validate;
