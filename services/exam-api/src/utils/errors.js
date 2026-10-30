/**
 * 自定义错误类
 * 支持在控制器中 throw，由全局错误处理中间件统一捕获
 */

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    /**
     * @param {string} message 面向用户的合并文案
     * @param {Array<{field: string, message: string}>} [details] 逐字段明细，
     *   由 errorHandler 原样放进响应体的 `details[]`（core-api 一直是这个形状）。
     */
    constructor(message = '请求参数无效', details = []) {
        super(message, 400);
        if (Array.isArray(details) && details.length > 0) {
            this.details = details;
        }
    }
}

class AuthError extends AppError {
    constructor(message = '认证失败') {
        super(message, 401);
    }
}

class ForbiddenError extends AppError {
    constructor(message = '无权限访问') {
        super(message, 403);
    }
}

class NotFoundError extends AppError {
    constructor(message = '资源不存在') {
        super(message, 404);
    }
}

module.exports = {
    AppError,
    ValidationError,
    AuthError,
    ForbiddenError,
    NotFoundError,
};
