/**
 * 考试相关工具函数
 */

/**
 * 判断用户答案是否正确
 * @param {string[]} userAnswer - 用户答案数组
 * @param {string[]} trueAnswer - 正确答案数组
 * @returns {boolean}
 */
function isCorrect(userAnswer, trueAnswer) {
    if (!userAnswer || !Array.isArray(userAnswer)) return false;
    if (userAnswer.length !== trueAnswer.length) return false;
    const sorted1 = [...userAnswer].sort();
    const sorted2 = [...trueAnswer].sort();
    return sorted1.every((v, i) => v === sorted2[i]);
}

/**
 * 异步控制器包装器，消除手动 try/catch
 * @param {Function} fn - 异步控制器函数
 * @returns {Function} Express 中间件
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = { isCorrect, asyncHandler };
