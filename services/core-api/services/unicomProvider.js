const crypto = require('crypto');
const AppError = require('../utils/AppError');

const VERSION = 'android@11.0800';
const HOST = 'https://m.client.10010.com';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc+CZK9bBA9IU+gZUOc6FUGu7y
O9WpTNB0PzmgFBh96Mg1WrovD1oqZ+eIF4LjvxKXGOdI79JRdve9NPhQo07+uqGQ
gE4imwNnRx7PFtCRryiIEcUoavuNtuRVoBAm6qdB0SrctgaqGfLgKvZHOnwTjyNq
jBUxzMeQlEC2czEMSwIDAQAB
-----END PUBLIC KEY-----`;
const METRICS = [
    ['balance', '剩余话费'], ['data', '剩余通用流量'],
    ['voice', '剩余语音'], ['points', '可用积分'],
];

function failure(code, message, status = 400) {
    return Object.assign(new AppError(message, status), { code });
}

function createLogin(phone) {
    const referenceAppIdDigit = () => String(crypto.randomInt(10));
    return {
        id: crypto.randomUUID(), phone,
        appId: referenceAppIdDigit()+'f'+referenceAppIdDigit()+'af'+referenceAppIdDigit()+referenceAppIdDigit()+'ad'+referenceAppIdDigit()+'912d306b5053abf90c7ebbb695887bc870ae0706d573c348539c26c5c0a878641fcc0d3e90acb9be1e6ef858a59af546f3c826988332376b7d18c8ea2398ee3a9c3db947e2471d32a49612',
        deviceId: crypto.randomBytes(16).toString('hex'),
        cookies: {}, stage: 'ready', resultToken: '', riskMobile: '', sentAt: 0,
    };
}

function encryptInput(value) {
    return crypto.publicEncrypt({ key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(value)).toString('base64');
}

async function request(state, url, body, json = false, options = {}) {
    const sessionCookies = !json && ['https://m.client.10010.com', 'https://mxx.client.10010.com'].includes(new URL(url).origin);
    let response;
    try {
        response = await fetch(url, {
            method: options.method || 'POST', redirect: 'manual', signal: AbortSignal.timeout(options.timeout || 20000),
            headers: {
                'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded',
                'User-Agent': `Mozilla/5.0 (Linux; Android 13; M2007J3SC) AppleWebKit/537.36 Chrome/107.0.0.0 Mobile Safari/537.36; unicom{version:${VERSION},desmobile:${state.phone}}`,
                'X-Requested-With': 'com.sinovatech.unicom.ui',
                ...(json ? { Origin: 'https://img.client.10010.com', Referer: 'https://img.client.10010.com/loginRisk/index.html', 'encrypt-key': '', 'scene-key': '' } : {}),
                ...(sessionCookies && Object.keys(state.cookies).length ? { Cookie: Object.entries(state.cookies).map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
                ...options.headers,
            },
            body: options.method === 'GET' ? undefined : json ? JSON.stringify(body) : new URLSearchParams(body),
        });
    } catch (error) {
        throw failure(error.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED', '联通请求未完成，请稍后重试。', error.name === 'TimeoutError' ? 504 : 502);
    }
    if (sessionCookies) {
        for (const line of response.headers.getSetCookie()) {
            const pair = line.split(';')[0], equal = pair.indexOf('=');
            if (equal > 0) state.cookies[pair.slice(0, equal)] = pair.slice(equal + 1);
        }
    }
    if (options.raw) return response;
    if (!response.ok) throw failure('UPSTREAM_FAILED', '联通服务暂不可用。', 502);
    try {
        const data = await response.json();
        if (data === 999999) throw failure('UNICOM_LOGIN_REQUIRED', '联通登录已失效，请重新登录。');
        if (!data || typeof data !== 'object') throw new Error();
        return data;
    } catch (error) {
        if (error.code === 'UNICOM_LOGIN_REQUIRED') throw error;
        throw failure('UPSTREAM_FAILED', '联通返回了无法识别的数据。', 502);
    }
}

function text(value) {
    return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
}

function resource(value) {
    const number = typeof value === 'number' ? String(value) : text(value);
    return number !== '' && Number.isFinite(Number(number)) ? number : null;
}

async function details(state) {
    // 官方本号查询不传 userNumber；该字段用于页面切换到其他号码。
    const data = await request(state, 'https://mxx.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune', { language: 'chinese' }, false, {
        headers: { Origin: 'https://imgxx.client.10010.com', Referer: 'https://imgxx.client.10010.com/yuliangchaxunsf/index.html' },
    });
    if (data.code === '0001') throw failure('UNICOM_LOGIN_REQUIRED', '联通登录已失效，请重新登录。');
    if (data.code !== '0000') throw failure('UPSTREAM_FAILED', '联通套餐与余量明细暂不可用。', 502);
    let nickname = null;
    try {
        const profile = await request(state, `${HOST}/mobileService/customer/query/myInfo/getData.htm?reqtime=${Date.now()}`, {}, false, { method: 'GET' });
        if (profile.rspCode === '0000') nickname = text(profile.infoData?.nickName) || null;
    } catch (error) {
        if (error.code === 'UNICOM_LOGIN_REQUIRED') throw error;
        // 资料接口单独不可用时仍展示已成功查询的套餐余量。
    }
    const groups = Array.isArray(data.unshared) ? data.unshared : [];
    return {
        queriedAt: Date.now(), nickname, packageName: text(data.packageName) || null,
        groups: [
            ['flow', 'unsharedFlowList', '套餐流量', 'MB'],
            ['voice', 'unsharedVoiceList', '套餐语音', '分钟'],
            ['sms', 'unsharedSmsList', '套餐短信', '条'],
        ].map(([id, type, title, unit]) => {
            const group = groups.find(item => item.type === type);
            return { id, title, unit, remaining: resource(group?.remainResource), used: resource(group?.userResource) };
        }),
    };
}

async function xinjiangActivities(state) {
    const origin = 'https://zy100.xj169.com';
    const entry = new URL(`${origin}/touchpoint/openapi/jumpHandRoom1G?source=155&type=02`);
    const bridge = new URL(`${HOST}/mobileService/openPlatform/openPlatLineNew.htm`);
    bridge.searchParams.set('to_url', entry.href);
    const redirect = await request(state, bridge.href, {}, false, { method: 'GET', raw: true, timeout: 15000 });
    const location = redirect.headers.get('location');
    const target = location ? new URL(location, bridge) : null;
    await redirect.body?.cancel();
    if (target?.origin !== origin || target.pathname !== entry.pathname || !target.searchParams.get('ticket')) {
        await overview(state);
        throw failure('UPSTREAM_FAILED', '新疆活动登录衔接暂不可用。', 502);
    }
    const ticket = target.searchParams.get('ticket');
    entry.searchParams.set('ticket', ticket);
    const options = { timeout: 15000, headers: {
        Referer: entry.href,
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 unicom{version:iphone_c@12.0701};ltst;OSVersion/16.2',
    } };
    const auth = await request(state, `${origin}/touchpoint/openapi/getTokenAndCity`, { ticket }, false, options);
    const identity = auth.result?.data || auth.data;
    if (String(auth.result?.code ?? auth.code) !== '0' || !identity || identity.phoneNum !== state.phone) {
        throw failure('UPSTREAM_FAILED', '新疆活动账号验证未成功，请稍后重试。', 502);
    }
    if (identity.provinceCode !== '89' || identity.loginFlag !== 'xjlt') {
        return { queriedAt: Date.now(), eligible: false, title: '新疆联通活动', records: [] };
    }
    if (!identity.token) throw failure('UPSTREAM_FAILED', '新疆活动登录衔接暂不可用。', 502);
    const page = await request(state, entry.href, {}, false, { ...options, method: 'GET', raw: true });
    if (!page.ok) throw failure('UPSTREAM_FAILED', '新疆活动页面暂不可用。', 502);
    const html = await page.text();
    const scriptPath = html.match(/<script[^>]+src\s*=\s*["']([^"'?]*drawAct\d{4}\/[^"'?]+\.js)(?:\?[^"']*)?["']/i)?.[1];
    const scriptUrl = scriptPath ? new URL(scriptPath, entry) : null;
    if (scriptUrl?.origin !== origin || !/^\/touchpoint\/pages\/js\/drawAct\d{4}\/[\w-]+\.js$/.test(scriptUrl.pathname)) {
        throw failure('UPSTREAM_FAILED', '当前新疆活动信息暂不可用。', 502);
    }
    const script = await request(state, scriptUrl.href, {}, false, { ...options, method: 'GET', raw: true });
    if (!script.ok) throw failure('UPSTREAM_FAILED', '当前新疆活动信息暂不可用。', 502);
    const source = await script.text();
    const activityId = source.match(/var\s+activityId\s*=\s*["']([\w-]{1,80})["']/)?.[1];
    if (!activityId) throw failure('UPSTREAM_FAILED', '当前新疆活动信息暂不可用。', 502);
    const records = await request(state, `${origin}/touchpoint/openapi/drawAct/getMyPrize`, { activityId }, false, {
        ...options, headers: { ...options.headers, userToken: identity.token },
    });
    if (!['0', 'SUCCESS'].includes(String(records.code)) || !Array.isArray(records.data)) {
        throw failure('UPSTREAM_FAILED', '新疆活动获奖记录暂不可用。', 502);
    }
    return {
        queriedAt: Date.now(), eligible: true, activityId,
        title: text(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]) || '新疆联通活动',
        records: records.data.map((row, index) => ({
            id: String(row.id ?? index), prizeName: text(row.prizeId) || '奖品名称暂不可用',
            drawnAt: resource(row.drawDate) && Number(row.drawDate) > 0 ? Number(row.drawDate) : null,
        })),
    };
}

function common(state) {
    const timestamp = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace(/[-T:]/g, '').replace(' ', '');
    return {
        isFirstInstall: '1', simCount: '1', yw_code: '', deviceOS: 'android13', netWay: 'Wifi',
        version: VERSION, deviceId: state.deviceId, keyVersion: '', provinceChanel: 'general',
        appId: state.appId, deviceModel: 'M2007J3SC', androidId: state.deviceId.slice(0, 16),
        deviceBrand: 'Xiaomi', timestamp,
    };
}

async function sendSms(state) {
    const data = await request(state, `${HOST}/mobileService/sendRadomNum.htm`, {
        mobile: encryptInput(state.phone), ...common(state), loginCodeLen: '6', deviceCode: state.deviceId,
        send_flag: '', resultToken: state.resultToken || '',
    });
    const code = String(data.rsp_code ?? data.code ?? '');
    if (['0000', '0'].includes(code)) {
        state.stage = 'sms_sent';
        state.sentAt = Date.now();
        return;
    }
    if (['ECS99998', 'ECS99999'].includes(code) || /安全验证|滑块|人机|ECS1164/.test(String(data.rsp_desc ?? data.dsc ?? '')) || data.needCaptcha) {
        if (typeof data.mobile !== 'string' || !data.mobile) throw failure('UNICOM_SECURITY_REQUIRED', '联通要求额外验证，请稍后重新发送验证码。');
        state.riskMobile = data.mobile;
        state.resultToken = '';
        state.stage = 'captcha_required';
        return;
    }
    throw failure('UNICOM_SMS_FAILED', '联通未确认验证码发送成功，请稍后重试。');
}

async function validateCaptcha(state, ticket, randStr) {
    const data = await request(state, 'https://loginxhm.10010.com/login-web/v1/chartCaptcha/validateTencentCaptcha', {
        seq: crypto.randomUUID(), captchaType: '10', mobile: state.riskMobile, ticket, randStr, imei: state.deviceId,
    }, true);
    if (String(data.code ?? data.rsp_code) !== '0000' || data.data?.resultFlag !== 'y' || typeof data.data?.resultToken !== 'string' || !data.data.resultToken) {
        throw failure('UNICOM_SECURITY_REQUIRED', '安全验证未通过，请重新完成图形验证。');
    }
    state.resultToken = data.data.resultToken;
    state.stage = 'captcha_passed';
}

async function login(state, code) {
    const data = await request(state, `${HOST}/mobileService/radomLogin.htm`, {
        mobile: encryptInput(state.phone), password: encryptInput(code), ...common(state), loginStyle: '0', isRemberPwd: 'true',
    });
    if (!['0', '0000'].includes(String(data.rsp_code ?? data.code)) || typeof data.token_online !== 'string' || !data.token_online) {
        throw failure('UNICOM_LOGIN_FAILED', '联通登录未成功，请检查短信验证码或重新获取。');
    }
    state.stage = 'logged_in';
    if (typeof data.appId === 'string' && data.appId) state.appId = data.appId;
    state.resultToken = '';
    state.riskMobile = '';
}

async function overview(state) {
    const data = await request(state, `${HOST}/mobileserviceimportant/home/queryUserInfoSeven`, { version: VERSION, showType: '0' });
    if (data.code !== 'Y') {
        if (/登录|会话|login/i.test(String(data.desc ?? data.dsc ?? data.message ?? data.rsp_desc ?? ''))) {
            throw failure('UNICOM_LOGIN_REQUIRED', '联通登录已失效，请重新登录。');
        }
        throw failure('UPSTREAM_FAILED', '联通账户信息暂不可用。', 502);
    }
    const cards = Array.isArray(data.data?.dataList) ? data.data.dataList : [];
    return {
        queriedAt: Date.now(),
        metrics: METRICS.map(([id, title]) => {
            const card = cards.find(item => item.remainTitle === title);
            const value = String(card?.number ?? '').trim();
            const available = card?.codeDetail === '0' && value !== '' && Number.isFinite(Number(value.replace(/,/g, '')));
            return { id, title, available, value: available ? value : null, unit: available ? String(card.unit || '') : '' };
        }),
    };
}

module.exports = { createLogin, sendSms, validateCaptcha, login, overview, details, xinjiangActivities, failure };
