const PlatformConfig = require('../models/PlatformConfig');
const SECRET_MASK = '********';

function maskConfig(config) {
    return { ...config, secretKey: config?.secretKey ? SECRET_MASK : '' };
}

/**
 * 获取完整的平台配置清单 (后台用)
 */
exports.getAllConfigs = async (req, res) => {
    try {
        let configs = await PlatformConfig.find().sort({ createTime: -1 }).lean();
        if (!configs) configs = [];
        res.json({ code: 200, data: configs.map(maskConfig) });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
};

/**
 * 更新或新增平台配置 (后台用)
 */
exports.saveConfig = async (req, res) => {
    try {
        const { platformCode, name, url, uid, secretKey, status, remark } = req.body;
        
        const normalizedName = String(name || '').trim();
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(platformCode || '')) || !normalizedName || !url) {
            return res.status(400).json({ code: 400, message: '平台标识符和接口URL必填' });
        }

        let normalizedUrl;
        try {
            normalizedUrl = new URL(String(url));
        } catch {
            return res.status(400).json({ code: 400, message: '接口URL格式无效' });
        }
        if (!['http:', 'https:'].includes(normalizedUrl.protocol) || normalizedUrl.username || normalizedUrl.password) {
            return res.status(400).json({ code: 400, message: '接口URL仅支持不含凭据的 HTTP(S) 地址' });
        }
        if (String(secretKey || '').length > 2048 || String(uid || '').length > 256 || String(name || '').length > 100) {
            return res.status(400).json({ code: 400, message: '平台配置字段长度超出限制' });
        }

        const update = {
            name: normalizedName,
            url: normalizedUrl.toString().replace(/\/$/, ''),
            uid: String(uid || '').trim(),
            remark: String(remark || '').trim().slice(0, 500)
        };
        if (typeof status === 'boolean') update.status = status;
        if (secretKey !== undefined && secretKey !== SECRET_MASK) update.secretKey = secretKey;

        await PlatformConfig.findOneAndUpdate(
            { platformCode },
            update,
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );

        res.json({ code: 200, message: '平台配置已生效' });
    } catch (e) {
        res.status(500).json({ code: 500, message: '平台配置保存失败' });
    }
};

/**
 * 删除配置
 */
exports.deleteConfig = async (req, res) => {
    try {
        const platformCode = String(req.params.platformCode || '');
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(platformCode)) {
            return res.status(400).json({ code: 400, message: '平台标识符无效' });
        }
        await PlatformConfig.deleteOne({ platformCode });
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.status(500).json({ code: 500, message: '平台配置删除失败' });
    }
};
