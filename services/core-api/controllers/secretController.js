const secretService = require('../services/secretService');
const logAudit = require('../utils/auditLogger');

exports.getAllSecrets = async (req, res, next) => {
    try {
        const result = await secretService.getAllSecrets();
        res.json({ success: true, result });
    } catch (err) {
        next(err);
    }
};

exports.updateSecret = async (req, res, next) => {
    try {
        const { key, value } = req.body;
        if (!secretService.isAdminConfigurableSecret(key)) {
            return res.status(400).json({ success: false, error: '不支持的密钥名称' });
        }
        if (typeof value !== 'string' || !value || value.length > 16384) {
            return res.status(400).json({ success: false, error: '密钥内容必须为 1-16384 个字符' });
        }

        // 调用服务更新
        const username = req.user && (req.user.userId || req.user._id || req.user.id) || 'unknown';
        await secretService.setSecret(key, value, username);
        await logAudit(req, {
            action: 'SECRET_UPDATE',
            targetId: key,
            payload: { source: 'database' }
        });

        res.json({ success: true, message: '密钥更新成功并且已即刻生效' });
    } catch (err) {
        next(err);
    }
};

exports.deleteSecret = async (req, res, next) => {
    try {
        const { key } = req.params;
        if (!secretService.isAdminConfigurableSecret(key)) {
            return res.status(400).json({ success: false, error: '不支持的密钥名称' });
        }

        const username = req.user && (req.user.userId || req.user._id || req.user.id) || 'unknown';
        await secretService.deleteSecret(key, username);
        await logAudit(req, {
            action: 'SECRET_DELETE',
            targetId: key,
            payload: { fallback: 'environment' }
        });

        res.json({ success: true, message: '密钥已被移除，系统已降级回退至 .env 本地配置' });
    } catch (err) {
        next(err);
    }
};
