/**
 * 公共工具函数
 * 集中管理项目中复用的工具方法
 */

/**
 * 转义正则表达式特殊字符，防止 ReDoS 攻击
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
