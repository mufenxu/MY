const AppConfig = require('../models/AppConfig');
const asyncHandler = require('../middleware/asyncHandler');

const setNoStoreHeaders = (res) => {
    res.set({
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        'Edge-Cache-Control': 'no-store'
    });
};

exports.getAppConfig = asyncHandler(async (req, res) => {
    const { key } = req.params;
    setNoStoreHeaders(res);

    const config = await AppConfig.findOne({ key }).lean();
    res.json({
        success: true,
        result: config ? config.value : null,
        updateTime: config ? config.updateTime : null
    });
});

exports.saveAppConfig = asyncHandler(async (req, res) => {
    const { key, value, remark, description } = req.body;
    const nextRemark = remark !== undefined ? remark : description;
    setNoStoreHeaders(res);

    if (!key) {
        return res.status(400).json({ success: false, error: 'Key is required' });
    }
    if (value === undefined) {
        return res.status(400).json({ success: false, error: 'Value is required' });
    }

    const update = {
        value,
        updateTime: Date.now()
    };
    if (nextRemark !== undefined) update.remark = nextRemark;

    const config = await AppConfig.findOneAndUpdate(
        { key },
        { $set: update },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true
        }
    ).lean();

    res.json({
        success: true,
        message: '配置已保存',
        result: config.value,
        updateTime: config.updateTime
    });
});

// Public method for mini-program to get specific config
exports.getPublicAppConfig = asyncHandler(async (req, res) => {
    const { key } = req.params;
    setNoStoreHeaders(res);

    const allowedKeys = ['feature_visibility', 'turnstile_config'];
    if (!allowedKeys.includes(key)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const config = await AppConfig.findOne({ key }).lean();
    res.json({
        success: true,
        result: config ? config.value : null,
        updateTime: config ? config.updateTime : null
    });
});
