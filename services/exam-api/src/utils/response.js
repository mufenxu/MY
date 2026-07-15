/**
 * 统一响应格式帮助函数
 */

function success(res, data = null, message = 'success') {
    return res.json({ code: 0, data, message });
}

function error(res, statusCode, message) {
    return res.status(statusCode).json({ code: statusCode, message });
}

module.exports = { success, error };
