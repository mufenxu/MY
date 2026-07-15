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
    constructor(message = '请求参数无效') {
        super(message, 400);
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
