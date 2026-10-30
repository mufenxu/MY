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
                    // 之前这里只把 message 拼成一句话，字段路径全丢了；
                    // 于是同样的 400，core-api 有 details[]、exam-api 没有，
                    // exam-admin 无法高亮出错字段。字段名带来源前缀，避免
                    // body 与 query 里同名参数分不清。
                    errors.push(
                        ...error.details.map((d) => ({
                            field: [source, ...(Array.isArray(d.path) ? d.path : [d.path])]
                                .filter((part) => part !== undefined && part !== '')
                                .join('.'),
                            message: d.message,
                        })),
                    );
                } else {
                    // 用经过验证和清洗的值替换原始值
                    req[source] = value;
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.map((item) => item.message).join('; '), errors);
        }

        next();
    };
}

module.exports = validate;
