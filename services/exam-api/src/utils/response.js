/**
 * 统一响应格式帮助函数
 *
 * 成功体保持 `{ code: 0, data, message }` 不变：exam-admin 与两个小程序里
 * 有多处 `res.data.code === 0` 判断，本轮不动成功契约。
 * 失败体走 `respond.fail()`，统一为
 * `{ ok:false, success:false, code, error, message, requestId, details? }`。
 */
const { fail, codeForStatus } = require('./respond');

function success(res, data = null, message = 'success') {
    return res.json({ code: 0, data, message });
}

function error(res, statusCode, message) {
    return fail(res, {
        status: statusCode,
        code: codeForStatus(statusCode),
        message,
    });
}

module.exports = { success, error };
