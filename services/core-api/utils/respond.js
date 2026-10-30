'use strict';

const contract = require('../../../packages/api-contract');

/**
 * 统一错误响应。
 *
 * 契约（HTTP >= 400 时生效）：
 *   { ok: false, success: false, code, error, message, details?, requestId, retryAfter? }
 *
 * 为什么同时保留 `error` 与 `message`、并把它们写成字符串：
 *   - `apps/core-admin` 全量读 `data.error`（字符串），
 *   - `apps/exam-admin` 读 `data.message`，
 *   - 两者都还有大量 `res.data.success` 判断。
 *   一次性改成 `error: { code, message }` 会让上述读取点显示 "[object Object]"。
 *   新字段 `ok` / `code` / `details` / `requestId` 是增量契约；等全部客户端切到
 *   `platform-browser-runtime` 的统一解析器后，再在 /v1 上收紧为嵌套 error 对象。
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
    const text = message
        || (registry && registry.zh)
        || '请求失败，请稍后再试。';

    const body = {
        ok: false,
        success: false,
        code,
        error: text,
        message: text,
        requestId: requestId || (res.req && res.req.id) || undefined,
    };

    if (details) {
        body.details = Array.isArray(details) ? details : [details];
    }
    if (retryAfter) {
        body.retryAfter = retryAfter;
    }
    // 仅非生产环境由 errorHandler 传入，方便本地定位；生产环境永远不带堆栈。
    if (options.stack && process.env.NODE_ENV !== 'production') {
        body.stack = String(options.stack);
    }

    return res.status(httpStatus).json(body);
}

/**
 * 统一成功响应。**只给新端点用**：
 * 存量成功体（`{ success: true, ... }` / `{ code: 200, data }`）保持不变，
 * 因为 4 个 Web 应用与 2 个小程序都在解析它们。
 */
function ok(res, data, meta = {}) {
    const body = { ok: true, success: true, data };
    if (meta && typeof meta === 'object') {
        if (meta.page) body.page = meta.page;
        if (meta.message) body.message = meta.message;
        if (meta.extra && typeof meta.extra === 'object') Object.assign(body, meta.extra);
    }
    if (res.req && res.req.id) body.requestId = res.req.id;
    return res.status(meta.status || 200).json(body);
}

module.exports = { fail, ok };
