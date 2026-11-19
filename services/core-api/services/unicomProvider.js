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

async function request(state, url, body, json = false) {
    let response;
    try {
        response = await fetch(url, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
            headers: {
                'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded',
                'User-Agent': `Mozilla/5.0 (Linux; Android 13; M2007J3SC) AppleWebKit/537.36 Chrome/107.0.0.0 Mobile Safari/537.36; unicom{version:${VERSION},desmobile:${state.phone}}`,
                'X-Requested-With': 'com.sinovatech.unicom.ui',
                ...(json ? { Origin: 'https://img.client.10010.com', Referer: 'https://img.client.10010.com/loginRisk/index.html', 'encrypt-key': '', 'scene-key': '' } : {}),
                ...(!json && Object.keys(state.cookies).length ? { Cookie: Object.entries(state.cookies).map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
            },
            body: json ? JSON.stringify(body) : new URLSearchParams(body),
        });
    } catch (error) {
        throw failure(error.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED', '联通请求未完成，请稍后重试。', error.name === 'TimeoutError' ? 504 : 502);
    }
    if (!json) {
        for (const line of response.headers.getSetCookie()) {
            const pair = line.split(';')[0], equal = pair.indexOf('=');
            if (equal > 0) state.cookies[pair.slice(0, equal)] = pair.slice(equal + 1);
        }
    }
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

module.exports = { createLogin, sendSms, validateCaptcha, login, overview, failure };
