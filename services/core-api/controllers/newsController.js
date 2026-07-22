const axios = require('axios');
const AppConfig = require('../models/AppConfig');
const logger = require('../utils/logger');
const { getExternalHttpOptions, isExternalHttpTimeout } = require('../utils/externalHttp');

exports.getDailyNews = async (req, res) => {
    try {
        // 检查功能开关
        const config = await AppConfig.findOne({ key: 'feature_visibility' });
        if (config && config.value && config.value.daily_news && config.value.daily_news.enabled === false) {
            return res.json({
                code: 200,
                message: "Prototype mode",
                data: {
                    news: [
                        "昨晚梦见自己变成了一行代码，因为找不到闭合括号被困了一晚上。",
                        "今天的运动量已达标：从床走到电脑前，准备开始新一轮的摸鱼。",
                        "刚刚跟 AI 助手倾诉了半个小时的工作压力，结果它给我推了本佛经。",
                        "如果把每次修Bug当作打怪升级，那我已经是修仙界的满级扫地僧了。",
                        "‘今天中午吃什么’已经超越了所有科学问题，成为每天困扰我的第一大难题。",
                        "为了养生，今天特地把泡面里的红烧牛肉调料包换成了几粒枸杞。"
                    ],
                    tip: "以上内容纯属开发者的日常碎碎念与精神状态观察记录。本小本本目前处于放飞自我的测试模式，暂无任何有营养的内容。",
                    date: new Date().toISOString().split('T')[0],
                    isMaintenance: true
                }
            });
        }

        const response = await axios.get(
            'https://60s.viki.moe/v2/60s',
            getExternalHttpOptions(),
        );
        // The API returns structure like: { code: 200, message: "...", data: { news: [...], tip: "...", date: "..." } }
        res.json(response.data);
    } catch (error) {
        const timedOut = isExternalHttpTimeout(error);
        logger.warn('Daily news upstream request failed', {
            code: error.code,
            status: error.response?.status,
        });
        res.status(timedOut ? 504 : 502).json({
            success: false,
            code: timedOut ? 'NEWS_UPSTREAM_TIMEOUT' : 'NEWS_UPSTREAM_UNAVAILABLE',
            error: timedOut ? '每日资讯服务响应超时' : '每日资讯服务暂时不可用',
            requestId: req.id,
        });
    }
};
