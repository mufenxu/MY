/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误，返回统一格式的响应
 */
const { AppError } = require('../utils/errors');
const logger = require('../config/logger');
const contract = require('../../../../packages/api-contract');
const { fail, codeForStatus } = require('../utils/respond');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    // 默认值
    let statusCode = Number(err.statusCode || err.status) || 500;
    let message = err.message || '服务器内部错误';
    // 只认已登记的字符串 code：'ENOENT' 这类系统错误码不是契约码。
    let code = typeof err.code === 'string' && contract.getErrorCode(err.code) ? err.code : null;
    let details = err.details || null;

    // Mongoose 验证错误
    if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        code = 'VALIDATION_FAILED';
        details = Object.entries(err.errors).map(([field, error]) => ({
            field,
            message: error && error.message ? error.message : '字段不合法',
        }));
        message = details.map((item) => item.message).join('; ');
    }

    // Mongoose CastError（无效 ObjectId 等）
    if (err.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_PARAMETER';
        message = `无效的参数值: ${String(err.value).slice(0, 64)}`;
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        statusCode = 409;
        code = 'DUPLICATE_KEY';
        const field = Object.keys(err.keyValue || {}).join(', ');
        message = field ? `数据重复: ${field} 已存在` : '数据已存在，不能重复创建。';
    }

    // JSON 解析错误
    if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        code = 'INVALID_JSON';
        message = '请求体 JSON 格式无效';
    }

    if (!code) code = codeForStatus(statusCode);

    // 非预期错误（编程错误）：只留日志，不把原文交给客户端
    if (!(err instanceof AppError) && statusCode >= 500) {
        logger.error({ err, method: req.method, url: req.originalUrl, requestId: req.id }, '未预期的服务器错误');
        message = '服务器内部错误';
        details = null;
    } else if (statusCode >= 500) {
        message = '服务器内部错误';
        details = null;
    }

    return fail(res, {
        status: statusCode,
        code,
        message,
        details,
        requestId: req.id,
        stack: err.stack,
    });
}

module.exports = errorHandler;
