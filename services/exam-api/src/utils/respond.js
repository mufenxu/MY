'use strict';

const contract = require('../../../../packages/api-contract');

// 传输语义由 HTTP 状态码表达，业务语义由 code 表达；这里只做状态 → code 的兜底映射。
const CODE_BY_STATUS = {
    400: 'VALIDATION_FAILED',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    412: 'PRECONDITION_FAILED',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    428: 'PRECONDITION_REQUIRED',
    429: 'RATE_LIMITED',
    502: 'UPSTREAM_FAILED',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
};

function codeForStatus(statusCode) {
    return CODE_BY_STATUS[statusCode] || 'INTERNAL_ERROR';
}

/**
 * 统一错误响应（错误契约见 docs/api-specification.md）。
 *
 * 同时保留 `error` 与 `message` 两个字符串字段，是因为：
 *   - `apps/exam-admin` 读 `data.message`；
 *   - `apps/core-admin`、`apps/admin-console`、两个小程序读 `data.error`。
 * 新增的 `ok` / `code` / `details` / `requestId` 是增量字段，不改变任何既有读取点。
 * 成功响应仍然由 `utils/response.js` 的 `success()` 输出 `{ code: 0, data, message }`，
 * 因为 exam-admin 有多处 `res.data.code === 0` 判断，本轮不动。
 */
function fail(res, options = {}) {
    const {
        code = 'INTERNAL_ERROR',
        message,
        details = null,
        status,
        retryAfter,
        requestId,
    } = options;

    const registry = contract.getErrorCode(code);
    const httpStatus = Number(status || (registry && registry.http) || 500);
    const text = message || (registry && registry.zh) || '请求失败，请稍后再试。';

    const body = {
        ok: false,
        success: false,
        code,
        error: text,
        message: text,
        requestId: requestId || (res.req && res.req.id) || undefined,
    };

    if (details) body.details = Array.isArray(details) ? details : [details];
    if (retryAfter) body.retryAfter = retryAfter;
    if (options.stack && process.env.NODE_ENV !== 'production') body.stack = String(options.stack);

    return res.status(httpStatus).json(body);
}

module.exports = { fail, codeForStatus };
