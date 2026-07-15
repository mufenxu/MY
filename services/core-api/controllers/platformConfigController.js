const PlatformConfig = require('../models/PlatformConfig');

/**
 * 获取完整的平台配置清单 (后台用)
 */
exports.getAllConfigs = async (req, res) => {
    try {
        let configs = await PlatformConfig.find().sort({ createTime: -1 }).lean();
        // 如果一条都没有，先初始化一条默认的 mx 平台作为占位保护
        if (!configs || configs.length === 0) {
            const defaultConfig = new PlatformConfig({
                platformCode: 'mx',
                name: '蜜雪 (MX平台)',
                url: 'http://example.com',
                uid: '12345',
                secretKey: 'abcdefg',
                status: true
            });
            await defaultConfig.save();
            configs = [defaultConfig.toObject()];
        }
        res.json({ code: 200, data: configs });
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
        
        if (!platformCode || !url) {
            return res.status(400).json({ code: 400, message: '平台标识符和接口URL必填' });
        }

        await PlatformConfig.findOneAndUpdate(
            { platformCode },
            { name, url, uid, secretKey, status, remark },
            { upsert: true, new: true }
        );

        res.json({ code: 200, message: '平台配置已生效' });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
};

/**
 * 删除配置
 */
exports.deleteConfig = async (req, res) => {
    try {
        const { platformCode } = req.params;
        await PlatformConfig.deleteOne({ platformCode });
        res.json({ code: 200, message: '删除成功' });
    } catch (e) {
        res.status(500).json({ code: 500, message: e.message });
    }
};
