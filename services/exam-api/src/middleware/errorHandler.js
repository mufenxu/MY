/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误，返回统一格式的响应
 */
const { AppError } = require('../utils/errors');
const logger = require('../config/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    // 默认值
    let statusCode = err.statusCode || 500;
    let message = err.message || '服务器内部错误';

    // Mongoose 验证错误
    if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        const messages = Object.values(err.errors).map((e) => e.message);
        message = messages.join('; ');
    }

    // Mongoose CastError（无效 ObjectId 等）
    if (err.name === 'CastError') {
        statusCode = 400;
        message = `无效的参数值: ${err.value}`;
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {}).join(', ');
        message = `数据重复: ${field} 已存在`;
    }

    // JSON 解析错误
    if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        message = '请求体 JSON 格式无效';
    }

    // 非预期错误（编程错误），隐藏详细信息
    if (!(err instanceof AppError) && statusCode === 500) {
        logger.error({ err, method: req.method, url: req.originalUrl }, '未预期的服务器错误');
        message = '服务器内部错误';
    }

    res.status(statusCode).json({
        code: statusCode,
        message,
    });
}

module.exports = errorHandler;

