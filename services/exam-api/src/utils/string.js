/**
 * 通用字符串工具函数
 */

/**
 * 转义正则表达式特殊字符
 * @param {string} input - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(input = '') {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
