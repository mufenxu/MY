const config = require('../config');
const { success } = require('../utils/response');

exports.getRuntimeConfig = (req, res) => {
    success(res, {
        scanLogin: {
            enabled: config.scanLogin.enabled,
            apiBase: config.scanLogin.apiBase,
        },
        aiCaptcha: {
            enabled: config.aiCaptcha.enabled,
            region: config.aiCaptcha.region,
            prefix: config.aiCaptcha.prefix,
            sceneId: config.aiCaptcha.sceneId,
        },
        console: {
            loginPath: '/login',
        },
    });
};
