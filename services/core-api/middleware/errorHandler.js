'use strict';

const logger = require('../utils/logger');
const contract = require('../../../packages/api-contract');
const { fail } = require('../utils/respond');

const CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,63}$/;

// 只认已登记的字符串 code；数字 code（如 Mongo 的 11000）不能直接当契约码用。
function resolveRegisteredCode(value) {
    if (typeof value !== 'string' || !CODE_SHAPE.test(value)) return null;
    return contract.getErrorCode(value) ? value : null;
}

function defaultCodeForStatus(status) {
    if (status === 400) return 'INVALID_PARAMETER';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 412) return 'PRECONDITION_FAILED';
    if (status === 413) return 'PAYLOAD_TOO_LARGE';
    if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
    if (status === 428) return 'PRECONDITION_REQUIRED';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 502) return 'UPSTREAM_FAILED';
    if (status === 503) return 'SERVICE_UNAVAILABLE';
    if (status === 504) return 'GATEWAY_TIMEOUT';
    return 'INTERNAL_ERROR';
}

/**
 * 全局错误处理。
 *
 * 与改造前的差异（都属行为修正，不改协议）：
 * - Mongoose 的 CastError / ValidationError / 11000 分别映射为 400 / 400 / 409，
 *   不再统一落到 500（非法 ObjectId 曾经被记成服务故障）。
 * - JSON 解析失败与请求体过大映射为 400 / 413，而不是 500。
 * - 5xx 一律使用注册表里的通用文案，绝不回传原始 message。
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
    const requestId = req.id || `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    let statusCode = Number(err.statusCode || err.status) || 500;
    let code = resolveRegisteredCode(err.code);
    let message = err.message || '服务器内部错误';
    let details = err.details || null;

    if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        code = 'INVALID_JSON';
        message = '请求体不是合法的 JSON。';
    } else if (err.type === 'entity.too.large') {
        statusCode = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = '提交的内容过大。';
    } else if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        code = 'VALIDATION_FAILED';
        details = Object.entries(err.errors).map(([field, error]) => ({
            field,
            message: error && error.message ? error.message : '字段不合法',
        }));
        message = details.map((item) => item.message).join('；') || '提交的内容不合法。';
    } else if (err.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_PARAMETER';
        message = `无效的参数值: ${String(err.value).slice(0, 64)}`;
    } else if (err.code === 11000) {
        statusCode = 409;
        code = 'DUPLICATE_KEY';
        const field = Object.keys(err.keyValue || {}).join(', ');
        message = field ? `数据重复: ${field} 已存在` : '数据已存在，不能重复创建。';
    }

    if (!code) code = defaultCodeForStatus(statusCode);
    // statusCode 与注册表不一致时以注册表为准，避免同一 code 出现两种传输语义。
    const registry = contract.getErrorCode(code);
    if (registry && registry.http !== statusCode && statusCode < 500) {
        statusCode = registry.http;
    }

    logger.error(`[${requestId}] ${err.message}`, {
        code,
        stack: err.stack,
        path: req.path,
        method: req.method,
        statusCode,
    });

    // 5xx 不回传原始 message（可能是上游地址、连接串、内部路径）。
    if (statusCode >= 500) {
        message = (registry && registry.zh) || '服务器内部错误，请稍后重试。';
        details = null;
    }

    return fail(res, {
        status: statusCode,
        code,
        message,
        details,
        requestId,
        stack: err.stack,
    });
};

module.exports = errorHandler;
