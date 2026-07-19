const axios = require('axios');
const qs = require('querystring');
const PlatformConfig = require('../models/PlatformConfig');
const logger = require('./logger');

function getRequestTimeoutMs() {
    const parsed = Number.parseInt(process.env.MX_REQUEST_TIMEOUT_MS || '10000', 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1000), 14000) : 10000;
}

function appendClientTradeNo(data, value, envKey, fallbackField) {
    if (!value) return;
    const field = String(process.env[envKey] || fallbackField).trim();
    if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)) {
        data[field] = String(value);
    }
}

// 敏感字段脱敏
function sanitizeLogData(data) {
    const sensitive = ['key', 'pass', 'password', 'secretKey', 'token'];
    const sanitized = { ...data };
    sensitive.forEach(k => {
        if (sanitized[k]) sanitized[k] = sanitized[k].substring(0, 3) + '***';
    });
    return sanitized;
}

/**
 * 动态获取指定平台（如 mx）的最新配置
 */
async function getPlatformConfig(platformCode = 'mx') {
    const config = await PlatformConfig.findOne({ platformCode, status: true });
    if (!config) {
        throw new Error(`平台通道 [${platformCode}] 未配置或已被停用。请前往管理后台 -> 服务商管理 中设置。`);
    }
    return config;
}

const querystring = require('querystring');

async function platformRequest(url, data) {
    try {
        // 严格过滤掉所有 null, undefined 或空字符串，防止触发服务器端的 empty() 校验错误
        const cleanData = {};
        Object.keys(data).forEach(key => {
            // 只过滤掉 null 和 undefined，保留空字符串和空格字符串
            // 因为某些接口要求字段必须存在且可能检查 empty()
            if (data[key] !== null && data[key] !== undefined) {
                cleanData[key] = String(data[key]);
            }
        });

        const postData = querystring.stringify(cleanData);
        logger.debug(`[Platform Request] URL: ${url}, Data: ${JSON.stringify(sanitizeLogData(cleanData))}`);

        const response = await axios.post(url, postData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.62 Safari/537.36'
            },
            timeout: getRequestTimeoutMs()
        });

        let resData = response.data;
        logger.debug(`[Platform Response] ${typeof resData === 'object' ? JSON.stringify(resData).substring(0, 500) : String(resData).substring(0, 500)}`);

        if (typeof resData === 'string') {
            try {
                resData = JSON.parse(resData);
            } catch (e) {
                // Ignore
            }
        }
        return resData;
    } catch (error) {
        logger.error(`[Platform Network Error] ${error.message}`);
        if (error.response) {
            logger.error(`[Platform Error Response] Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data).substring(0, 500)}`);
        }
        const wrapped = new Error(`连接远程服务器失败: ${error.message}`);
        wrapped.code = error.code || 'UPSTREAM_REQUEST_FAILED';
        wrapped.statusCode = error.response?.status;
        wrapped.outcomeUnknown = !error.response
            || ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code)
            || Number(error.response?.status) >= 500;
        throw wrapped;
    }
}

/**
 * 1. 查课 (获取账号的课程列表)
 * @param {String} school 学校
 * @param {String} user 账号/手机号
 * @param {String} pass 密码
 * @param {Object} category 数据库中的分类对象，包含 queryplat (通道名) 等信息
 */
async function queryCourses(school, user, pass, category) {
    const platformId = category.getnoun;
    const channel = category.queryplat || 'mx';
    const config = await getPlatformConfig(channel);
    
    let url = '';
    let data = {};

    if (channel === 'mx') {
        // 根据 URL 自动判断是 api.php 还是 apisub.php
        const isApiSub = config.url.includes('apisub.php');
        url = isApiSub ? config.url : `${config.url}/api.php?act=get`;
        
        if (isApiSub) {
            data = {
                act: 'get',
                cid: String(platformId || ''),
                userinfo: `${user} ${pass}`,
            };
        } else {
            // 对接 api.php，严格遵循 ckjk.php 逻辑，且把 act 放入 body 以防万一
            data = {
                act: 'get',
                uid: String(config.uid || ''),
                key: String(config.secretKey || ''),
                user: String(user || ''),
                pass: String(pass || ''),
                platform: String(platformId || ''), // 这里对应您的“查课参数 125”
                school: String(school || '默认'),    // 必须有值，否则报“所有项目不能为空”
                kcid: ''                          // 显式提供空字符串
            };
        }
    } else if (channel === 'joker') {
        url = `${config.url}/api.php?act=getcourse`;
        data = {
            act: 'getcourse',
            token: String(config.secretKey || ''), 
            school: String(school || ''),
            account: String(user || ''),
            password: String(pass || ''),
            ptid: String(platformId || ''),
            sift: '1',
            check: '1'
        };
    } else {
        throw new Error(`暂不支持的查询通道: ${channel}`);
    }

    logger.info(`[Platform Query] Channel: ${channel}, URL: ${url}, User: ${user}`);
    const res = await platformRequest(url, data);
    logger.debug('[Platform Result]', { resultPreview: JSON.stringify(res).substring(0, 300) });

    // 统计：查课次数 +1 (如果当前为 0，则初始化为 31)
    if (res && (res.code == 1 || Array.isArray(res) || res.data)) {
        const config = await PlatformConfig.findOne({ platformCode: channel });
        if (config && config.queryCount === 0) {
            await PlatformConfig.updateOne({ platformCode: channel }, { $set: { queryCount: 31 } });
        } else {
            await PlatformConfig.updateOne({ platformCode: channel }, { $inc: { queryCount: 1 } });
        }
    }

    return res;
}

/**
 * 2. 提交刷课订单
 */
async function submitOrder(options) {
    const { category } = options;
    const channel = category.docking || 'mx';
    const config = await getPlatformConfig(channel);
    const platformId = category.noun;

    let url = '';
    let data = {};

    if (channel === 'mx') {
        url = `${config.url}/api.php?act=add`;
        data = {
            act: 'add',
            uid: String(config.uid || ''),
            key: String(config.secretKey || ''),
            platform: String(platformId || ''), // 这里对应您的“交单参数 10”
            user: String(options.user || ''),
            pass: String(options.pass || ''),
            kcname: String(options.courseName || ''),
            kcid: String(options.courseId || ''),
            school: String(options.school || '默认'), // 必须有值
            shichang: String(options.duration || ''),
            score: String(options.score || '')
        };
        appendClientTradeNo(data, options.clientTradeNo, 'MX_CLIENT_TRADE_NO_FIELD', 'trade_no');
    } else if (channel === 'joker') {
        url = `${config.url}/api.php?act=submitcourse`;
        data = {
            act: 'submitcourse',
            token: String(config.secretKey || ''),
            ptid: String(platformId || ''),
            school: String(options.school || ''),
            account: String(options.user || ''),
            password: String(options.pass || ''),
            kcname: String(options.courseName || ''),
            kcid: String(options.courseId || '')
        };
        appendClientTradeNo(data, options.clientTradeNo, 'JOKER_CLIENT_TRADE_NO_FIELD', 'client_order_no');
    }

    logger.info(`[Platform Submit] Channel: ${channel}, URL: ${url}, User: ${options.user}, Course: ${options.courseName}`);
    const res = await platformRequest(url, data);
    logger.debug('[Platform Submit Result]', { result: JSON.stringify(res).substring(0, 300) });

    // 统计：下单数 +1 (如果当前为 0，则初始化为 2)
    if (res && (res.code == 0 || res.code == 1 || res.id)) {
        const config = await PlatformConfig.findOne({ platformCode: channel });
        if (config && config.orderCount === 0) {
            await PlatformConfig.updateOne({ platformCode: channel }, { $set: { orderCount: 2 } });
        } else {
            await PlatformConfig.updateOne({ platformCode: channel }, { $inc: { orderCount: 1 } });
        }
    }

    return res;
}

/**
 * 3. 获取实时进度（模拟原网站刷新行为：uporder -> delay -> orderlist）
 */
async function queryProgress(user, category, remoteOrderId) {
    const channel = category.docking || 'mx'; 
    const config = await getPlatformConfig(channel);
    const platformId = category.noun;

    if (channel === 'mx') {
        const baseUrl = config.url.split('/api.php')[0].split('/apisub.php')[0].replace(/\/$/, '');
        const apiUrl = `${baseUrl}/api.php`; // chadan/chadan2 统一走 api.php

        // 第一步：触发上游刷新 (直接用 api.php)
        try {
            const uporderUrl = `${baseUrl}/api.php?act=uporder&oid=${encodeURIComponent(remoteOrderId)}`;
            logger.debug(`[Platform Refresh] Triggering uporder: ${uporderUrl}`);
            const upRes = await axios.get(uporderUrl, { timeout: 10000 });
            const upData = upRes.data;
            logger.debug(`[Platform Refresh] uporder result: ${JSON.stringify(upData).substring(0, 200)}`);
            
            // 仅在同步成功时等待上游处理
            if (upData && upData.code == 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (err) {
            // uporder 失败不阻塞，跳过延迟直接查 chadan2
            logger.debug('[Platform Refresh] uporder failed (non-critical):', err.message);
        }

        // 第二步：使用 chadan2 获取实时进度 (完全匹配官方 jdjk.php 逻辑)
        logger.debug(`[Platform Progress] Querying via chadan2: ${remoteOrderId}`);
        const chadan2Url = `${apiUrl}?act=chadan2`;
        const chadan2Data = {
            username: String(user || ''),
            cid: String(platformId || ''),
            yid: String(remoteOrderId || '')
        };
        const res = await platformRequest(chadan2Url, chadan2Data);
        
        // 如果 chadan2 返回成功且有数据，直接返回
        if (res && res.code == 1 && res.data && res.data.length > 0) {
            return res;
        }

        // 第三步：备用方案，如果 chadan2 没拿到，尝试 orderlist (仅对带权号有效)
        logger.debug(`[Platform Progress] chadan2 failed, trying orderlist for: ${remoteOrderId}`);
        const listRes = await _queryViaOrderList(apiUrl, config, remoteOrderId);
        if (listRes && listRes.code == 1 && listRes.data && listRes.data.length > 0) {
            return listRes;
        }
        
        return res;

    } else if (channel === 'joker') {
        const url = `${config.url}/api.php?act=chadan2`;
        const data = {
            act: 'chadan2',
            username: String(user || ''),
            cid: String(platformId || ''),
            yid: String(remoteOrderId || ''),
            token: String(config.secretKey || '')
        };
        return await platformRequest(url, data);
    }

    return { code: 0, msg: `暂不支持的查询通道: ${channel}` };
}

/**
 * 3b. 获取实时进度（管理后台专用 —— 优先 oid + chadan2，失败则回退 orderlist）
 *     与小程序端的 queryProgress 完全隔离，不影响原有流程
 */
async function queryProgressEnhanced(user, category, remoteOid, remoteOrderId) {
    const channel = category.docking || 'mx';
    const config = await getPlatformConfig(channel);
    const platformId = category.noun;
    const orderId = remoteOid || remoteOrderId; // 优先使用 oid

    if (channel === 'mx') {
        const baseUrl = config.url.split('/api.php')[0].split('/apisub.php')[0].replace(/\/$/, '');
        const apiUrl = `${baseUrl}/api.php`; // chadan/chadan2 统一走 api.php

        // 第一步：触发上游刷新 (改为 api.php 以支持非登录状态)
        try {
            const uporderUrl = `${baseUrl}/api.php?act=uporder&oid=${encodeURIComponent(orderId)}`;
            logger.debug(`[Admin Refresh] Triggering uporder: ${uporderUrl}`);
            const upRes = await axios.get(uporderUrl, { timeout: 10000 });
            const upData = upRes.data;
            logger.debug(`[Admin Refresh] uporder result: ${JSON.stringify(upData).substring(0, 200)}`);
            
            // 仅在同步成功时等待上游处理
            if (upData && upData.code == 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (err) {
            // uporder 失败不阻塞，跳过延迟直接查 chadan2
            logger.debug('[Admin Refresh] uporder failed (non-critical):', err.message);
        }

        // 第二步：优先使用 chadan2 获取最新状态
        logger.debug(`[Admin Progress] Querying via chadan2: ${orderId}`);
        const chadan2Url = `${apiUrl}?act=chadan2`;
        const chadan2Data = {
            username: String(user || ''),
            cid: String(platformId || ''),
            yid: String(orderId || '')
        };
        const res = await platformRequest(chadan2Url, chadan2Data);

        if (res && res.code == 1 && res.data && Array.isArray(res.data) && res.data.length > 0) {
            return res;
        }

        // 三步：回退到 orderlist
        logger.debug('[Admin Progress] chadan2 failed, falling back to orderlist...');
        const fallbackResult = await _queryViaOrderList(apiUrl, config, orderId);
        return fallbackResult;
    } else if (channel === 'joker') {
        const url = `${config.url}/api.php?act=chadan2`;
        const data = {
            act: 'chadan2',
            username: String(user || ''),
            cid: String(platformId || ''),
            yid: String(orderId || ''),
            token: String(config.secretKey || '')
        };

        logger.debug(`[Admin Progress] joker, URL: ${url}, Order: ${orderId}`);
        const res = await platformRequest(url, data);
        logger.debug('[Admin Progress Result]', { result: JSON.stringify(res).substring(0, 300) });
        return res;
    }

    return { code: 0, msg: `暂不支持的查询通道: ${channel}` };
}

/**
 * 通过 api.php?act=orderlist 查询（管理后台回退用，带 uid/key 鉴权）
 */
async function _queryViaOrderList(apiUrl, config, remoteOrderId) {
    const url = `${apiUrl}?act=orderlist`;
    logger.debug(`[Admin Progress] Trying orderlist: ${url}, id: ${remoteOrderId}`);

    const authData = {
        act: 'orderlist',
        uid: String(config.uid || ''),
        key: String(config.secretKey || ''),
        'cx[yid]': String(remoteOrderId),
    };

    const res = await platformRequest(url, authData);
    logger.debug('[Admin Progress Result (orderlist)]', { result: JSON.stringify(res)?.substring(0, 500) });

    if (res && res.code == 1 && Array.isArray(res.data)) {
        const matched = res.data.find(o => o.yid === remoteOrderId || o.oid === remoteOrderId);
        if (matched) return _normalizeOrderListItem(matched);
    }

    // 过滤无效时拉全部列表匹配
    if (!res || res.code == 403 || (res.code == 1 && (!res.data || res.data.length === 0))) {
        logger.debug('[Admin Progress] Retrying orderlist without filter...');
        const fullRes = await platformRequest(url, {
            act: 'orderlist',
            uid: String(config.uid || ''),
            key: String(config.secretKey || ''),
        });
        if (fullRes && fullRes.code == 1 && Array.isArray(fullRes.data)) {
            const matched = fullRes.data.find(o => o.yid === remoteOrderId || o.oid === remoteOrderId);
            if (matched) return _normalizeOrderListItem(matched);
        }
    }

    return { code: 1, data: null };
}

/**
 * 将 orderlist 数据归一化为 chadan2 兼容格式（含补全字段）
 */
function _normalizeOrderListItem(item) {
    return {
        code: 1,
        data: [{
            id: item.oid || '',
            status: item.status || '',
            process: item.process || '',
            remarks: item.remarks || '',
            kcname: item.kcname || '',
            kcid: item.kcid || '',
            school: item.school || '',
            ptname: item.ptname || '',
            addtime: item.addtime || ''
        }]
    };
}

/**
 * 4. 补刷订单 (重新触发进度或修复异常)
 */
async function retryOrder(user, pass, remoteOrderId, channel = 'mx') {
    const config = await getPlatformConfig(channel);

    let url = '';
    let data = {};

    if (channel === 'mx') {
        url = `${config.url}/api.php?act=budan`;
        data = {
            act: 'budan',
            uid: String(config.uid || ''),
            key: String(config.secretKey || ''),
            id: String(remoteOrderId || '')
        };
    } else if (channel === 'joker') {
        url = `${config.url}/api.php?act=resetorder`;
        data = {
            act: 'resetorder',
            token: String(config.secretKey || ''),
            id: String(remoteOrderId || '')
        };
    }

    logger.info(`[Platform Retry] Channel: ${channel}, URL: ${url}, Order: ${remoteOrderId}`);
    const res = await platformRequest(url, data);
    logger.debug('[Platform Retry Result]', { result: JSON.stringify(res).substring(0, 300) });
    return res;
}

module.exports = {
    queryCourses,
    submitOrder,
    queryProgress,
    queryProgressEnhanced,
    retryOrder,
    getRequestTimeoutMs
};
