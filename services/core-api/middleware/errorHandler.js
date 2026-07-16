const logger = require('../utils/logger');

/**
 * 增强的错误处理中间件
 * - 添加请求 ID 便于追踪
 * - 区分开发/生产环境错误信息
 * - 结构化错误响应
 */
const errorHandler = (err, req, res, next) => {
    const requestId = req.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // 确定状态码
    const statusCode = err.statusCode || err.status || 500;

    // 记录错误日志
    logger.error(`[${requestId}] ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        statusCode
    });

    // 根据环境返回不同级别的错误信息
    const isProduction = process.env.NODE_ENV === 'production';

    const response = {
        success: false,
        error: isProduction && statusCode === 500
            ? '服务器内部错误，请稍后重试'
            : (err.message || 'Server Error'),
        requestId
    };

    // 开发环境返回更多调试信息
    if (!isProduction) {
        response.stack = err.stack;
        response.details = err.details || null;
    }

    res.status(statusCode).json(response);
};

module.exports = errorHandler;
