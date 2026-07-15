/**
 * API 响应包装函数
 * 用于规范化后端 API 的返回格式
 */

/**
 * 成功响应包装
 * @param {Object} res - Express 响应对象
 * @param {any} data - 返回的数据负载
 * @param {string} [message] - 成功提示信息
 * @returns {Object} JSON 响应
 */
exports.sendSuccess = (res, data = null, message = '操作成功') => {
    return res.status(200).json({
        success: true,
        message,
        data
    });
};

/**
 * 错误响应包装
 * @param {Object} res - Express 响应对象
 * @param {string} error - 错误信息
 * @param {number} [statusCode=500] - HTTP 状态码
 * @returns {Object} JSON 响应
 */
exports.sendError = (res, error = '服务器内部错误', statusCode = 500) => {
    return res.status(statusCode).json({
        success: false,
        error
    });
};
