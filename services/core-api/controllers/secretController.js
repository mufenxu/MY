const secretService = require('../services/secretService');

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
        if (!key || !value) {
            return res.status(400).json({ success: false, error: '缺少必填参数 key 或 value' });
        }

        // 调用服务更新
        const username = req.user && (req.user.userId || req.user._id || req.user.id) || 'unknown';
        await secretService.setSecret(key, value, username);

        res.json({ success: true, message: '密钥更新成功并且已即刻生效' });
    } catch (err) {
        next(err);
    }
};

exports.deleteSecret = async (req, res, next) => {
    try {
        const { key } = req.params;
        if (!key) {
            return res.status(400).json({ success: false, error: '缺少密钥键名' });
        }

        const username = req.user && (req.user.userId || req.user._id || req.user.id) || 'unknown';
        await secretService.deleteSecret(key, username);

        res.json({ success: true, message: '密钥已被移除，系统已降级回退至 .env 本地配置' });
    } catch (err) {
        next(err);
    }
};
