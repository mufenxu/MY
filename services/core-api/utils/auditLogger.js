const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

/**
 * 统一审计日志记录工具
 * 所有写操作和敏感读操作都应通过此函数记录审计日志。
 *
 * @param {Object} req - Express 请求对象（用于提取 IP、UserAgent、requestId）
 * @param {Object} options
 * @param {string} options.action - 操作类型，如 'LOGIN_SUCCESS', 'USER_UPDATE', 'SETTING_CHANGE'
 * @param {string} [options.targetId] - 操作目标 ID
 * @param {Object} [options.payload] - 额外数据
 * @param {string} [options.result='success'] - 操作结果 'success' | 'failure'
 * @param {string} [options.actorId] - 操作者 ID（默认从 req.user 中取）
 */
const logAudit = async (req, { action, targetId, payload, result = 'success', actorId }) => {
    try {
        await AuditLog.create({
            actorOpenid: actorId || req.user?._id || 'system',
            action,
            targetId: targetId || '',
            payload: payload || {},
            result,
            ip: req.ip || req.connection?.remoteAddress || '',
            userAgent: (req.headers?.['user-agent'] || '').substring(0, 256),
            requestId: req.id || '',
        });
    } catch (err) {
        // 审计日志写入失败不应中断业务流程，但需要记录错误
        logger.error(`[Audit] Failed to write audit log: ${action}`, err);
    }
};

module.exports = logAudit;
