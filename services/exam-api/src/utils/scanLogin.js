const crypto = require('crypto');
const config = require('../config');
const ScanLoginSession = require('../models/ScanLoginSession');
const { AppError, NotFoundError } = require('./errors');

const QR_TOKEN_BYTES = 24;
const POLL_TOKEN_BYTES = 24;
const TEMP_AUTH_CODE_BYTES = 24;
const SCENE_TOKEN_BYTES = 8;
const QR_TTL_MS = parseInt(process.env.SCAN_LOGIN_QR_TTL_MS, 10) || 5 * 60 * 1000;
const TEMP_AUTH_CODE_TTL_MS = parseInt(process.env.SCAN_LOGIN_TEMP_AUTH_CODE_TTL_MS, 10) || 2 * 60 * 1000;
const CLEANUP_TTL_MS = parseInt(process.env.SCAN_LOGIN_CLEANUP_TTL_MS, 10) || 24 * 60 * 60 * 1000;
const QR_CODE_SCHEME = 'miniprogram-login://scan';
const WXACODE_API_BASE = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit';
const WECHAT_ACCESS_TOKEN_API = 'https://api.weixin.qq.com/cgi-bin/token';

let wechatAccessTokenCache = null;

const intentMetaMap = {
    manage_login: {
        title: '后台登录',
        description: '确认后将根据当前微信身份自动进入管理员后台或个人题库后台。',
        confirmText: '确认登录',
    },
    admin_login: {
        title: '管理员后台登录',
        description: '确认后将登录电脑端管理员后台。',
        confirmText: '确认登录',
    },
    console_login: {
        title: '个人题库后台登录',
        description: '确认后将登录你的个人题库后台。',
        confirmText: '确认登录',
    },
    admin_bind: {
        title: '绑定管理员微信',
        description: '确认后将把当前小程序账号绑定到管理员后台。',
        confirmText: '确认绑定',
    },
};

function createRandomHex(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

function createSceneToken() {
    return createRandomHex(SCENE_TOKEN_BYTES);
}

function normalizeClientContext(context = {}) {
    return {
        ip: String(context.ip || '').slice(0, 120),
        userAgent: String(context.userAgent || '').slice(0, 300),
    };
}

function maskIp(ip) {
    const text = String(ip || '').trim();
    if (!text) {
        return '';
    }

    const ipv4Match = text.match(/(?:(?:\d{1,3}\.){3}\d{1,3})$/);
    if (ipv4Match) {
        const parts = ipv4Match[0].split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
    }

    const normalized = text.replace(/^::ffff:/i, '');
    if (!normalized.includes(':')) {
        return normalized;
    }

    const parts = normalized.split(':').filter(Boolean);
    return parts.length > 2 ? `${parts.slice(0, 2).join(':')}:*` : `${normalized}:*`;
}

function buildQrCodeText(qrToken) {
    if (config.scanLogin.qrCodeMode === 'link' && config.scanLogin.qrLinkBase) {
        const url = new URL(config.scanLogin.qrLinkBase);
        url.searchParams.set('qrToken', qrToken);
        return url.toString();
    }

    return `${QR_CODE_SCHEME}?qrToken=${encodeURIComponent(qrToken)}`;
}

function getWxacodeMimeType(contentType) {
    if (contentType && contentType.includes('image/')) {
        return contentType.split(';')[0].trim();
    }

    return 'image/jpeg';
}

function buildWxacodeApiErrorMessage(payload) {
    const errmsg = payload?.errmsg || '';
    const errcode = payload?.errcode ? `errcode=${payload.errcode}` : '';
    const details = [errcode, errmsg].filter(Boolean).join(', ');

    if (payload?.errcode === 41030 || errmsg.includes('invalid page')) {
        return [
            '微信小程序码生成失败：当前小程序版本未找到扫码登录页。',
            `请确认 WECHAT_APP_ID/WECHAT_APP_SECRET 对应的是当前小程序，且已发布包含 ${config.scanLogin.wxacode.page} 的版本。`,
            '测试体验版可临时设置 SCAN_LOGIN_WXACODE_CHECK_PATH=false 和 SCAN_LOGIN_WXACODE_ENV_VERSION=trial。',
            details ? `微信返回：${details}` : '',
        ].filter(Boolean).join(' ');
    }

    return errmsg || '微信小程序码生成失败';
}

async function fetchJsonWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.externalApiTimeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new AppError('微信接口请求超时，请稍后再试', 504);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getWechatAccessToken() {
    const now = Date.now();
    if (wechatAccessTokenCache && wechatAccessTokenCache.expiresAt > now + 60 * 1000) {
        return wechatAccessTokenCache.token;
    }

    const url = new URL(WECHAT_ACCESS_TOKEN_API);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', config.wechat.appId);
    url.searchParams.set('secret', config.wechat.appSecret);

    const payload = await fetchJsonWithTimeout(url);
    if (payload.errcode || !payload.access_token) {
        throw new AppError(payload.errmsg || '获取微信 access_token 失败，请检查 WECHAT_APP_ID/WECHAT_APP_SECRET', 502);
    }

    wechatAccessTokenCache = {
        token: payload.access_token,
        expiresAt: now + (Number(payload.expires_in || 7200) * 1000),
    };

    return wechatAccessTokenCache.token;
}

async function requestWxacodeDataUrl(sceneToken) {
    const accessToken = await getWechatAccessToken();
    const url = new URL(WXACODE_API_BASE);
    url.searchParams.set('access_token', accessToken);

    const body = {
        scene: `s=${sceneToken}`,
        page: config.scanLogin.wxacode.page,
        check_path: config.scanLogin.wxacode.checkPath,
    };

    if (config.scanLogin.wxacode.envVersion) {
        body.env_version = config.scanLogin.wxacode.envVersion;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.externalApiTimeoutMs);
    let response;
    let buffer;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new AppError('微信小程序码生成超时，请稍后再试', 504);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = buffer.toString('utf8');
    if (contentType.includes('application/json') || text.trim().startsWith('{')) {
        const payload = JSON.parse(text);
        throw new AppError(buildWxacodeApiErrorMessage(payload), 502);
    }

    if (!response.ok) {
        throw new AppError('微信小程序码生成失败', 502);
    }

    return `data:${getWxacodeMimeType(contentType)};base64,${buffer.toString('base64')}`;
}

function buildCleanupAt(now = new Date()) {
    return new Date(now.getTime() + CLEANUP_TTL_MS);
}

function isExpired(session, now = new Date()) {
    return !session.expiresAt || session.expiresAt.getTime() <= now.getTime();
}

function isTempAuthCodeExpired(session, now = new Date()) {
    return !session.tempAuthCodeExpiresAt || session.tempAuthCodeExpiresAt.getTime() <= now.getTime();
}

function getIntentMeta(intent) {
    const meta = intentMetaMap[intent];
    if (!meta) {
        throw new AppError('无效的扫码用途', 400);
    }
    return meta;
}

async function markExpiredIfNeeded(session, now = new Date()) {
    if (!session) {
        throw new NotFoundError('二维码不存在或已失效');
    }

    if (isExpired(session, now) && !['expired', 'consumed', 'cancelled'].includes(session.status)) {
        session.status = 'expired';
        session.cleanupAt = buildCleanupAt(now);
        await session.save();
    }

    if (session.status === 'confirmed' && isTempAuthCodeExpired(session, now)) {
        session.status = 'expired';
        session.cleanupAt = buildCleanupAt(now);
        await session.save();
    }

    return session;
}

function serializePublicStatus(session) {
    const payload = {
        status: session.status,
        intent: session.intent,
        expiresAt: session.expiresAt,
    };

    if (session.status === 'confirmed' && session.tempAuthCode) {
        payload.tempAuthCode = session.tempAuthCode;
        payload.tempAuthCodeExpiresAt = session.tempAuthCodeExpiresAt;
    }

    return payload;
}

function serializeUserSession(session) {
    return {
        qrToken: session.qrToken,
        status: session.status,
        intent: session.intent,
        createTime: session.createTime,
        expiresAt: session.expiresAt,
        requestIp: maskIp(session.createdIp),
        ...getIntentMeta(session.intent),
    };
}

async function createQrSession(intent, oldQrToken, context = {}) {
    const now = new Date();
    getIntentMeta(intent);
    const client = normalizeClientContext(context);

    if (oldQrToken) {
        await ScanLoginSession.updateOne(
            {
                qrToken: oldQrToken,
                status: { $in: ['pending', 'scanned'] },
            },
            {
                $set: {
                    status: 'cancelled',
                    cleanupAt: buildCleanupAt(now),
                },
            },
        );
    }

    const qrToken = createRandomHex(QR_TOKEN_BYTES);
    const pollToken = createRandomHex(POLL_TOKEN_BYTES);
    const sceneToken = config.scanLogin.qrCodeMode === 'wxacode' ? createSceneToken() : null;
    const expiresAt = new Date(now.getTime() + QR_TTL_MS);

    const session = await ScanLoginSession.create({
        qrToken,
        pollToken,
        sceneToken,
        intent,
        createdIp: client.ip,
        createdUserAgent: client.userAgent,
        expiresAt,
        cleanupAt: buildCleanupAt(now),
    });

    const wxacodeImage = sceneToken ? await requestWxacodeDataUrl(sceneToken) : '';

    return {
        qrToken: session.qrToken,
        pollToken: session.pollToken,
        expiresAt: session.expiresAt,
        qrCodeMode: config.scanLogin.qrCodeMode,
        qrCodeImage: wxacodeImage,
        qrCodeText: buildQrCodeText(session.qrToken),
        ...serializeUserSession(session),
    };
}

async function getStatusByPollToken(qrToken, pollToken) {
    const session = await ScanLoginSession.findOne({ qrToken, pollToken });
    await markExpiredIfNeeded(session);
    return serializePublicStatus(session);
}

async function getMutableSessionForUser(qrToken, openid) {
    const now = new Date();
    const session = await ScanLoginSession.findOne({
        $or: [
            { qrToken },
            { sceneToken: qrToken },
        ],
    });
    await markExpiredIfNeeded(session, now);

    if (session.status === 'expired') {
        throw new AppError('二维码已过期，请在电脑端刷新后重新扫描', 400);
    }

    if (session.status === 'consumed') {
        throw new AppError('二维码已使用，请在电脑端刷新后重新扫描', 400);
    }

    if (session.status === 'cancelled') {
        throw new AppError('二维码已失效，请使用电脑端最新二维码重新扫描', 400);
    }

    if (session.scannedByOpenid && session.scannedByOpenid !== openid) {
        throw new AppError('该二维码已被其他微信账号扫码', 409);
    }

    return session;
}

async function scanByUser(qrToken, openid, context = {}) {
    const now = new Date();
    const client = normalizeClientContext(context);
    const session = await getMutableSessionForUser(qrToken, openid);

    if (session.status === 'pending') {
        session.status = 'scanned';
        session.scannedByOpenid = openid;
        session.scannedIp = client.ip;
        session.scannedUserAgent = client.userAgent;
        session.scannedAt = now;
        await session.save();
    }

    return serializeUserSession(session);
}

async function confirmByUser(qrToken, openid, context = {}) {
    const now = new Date();
    const client = normalizeClientContext(context);
    const session = await getMutableSessionForUser(qrToken, openid);

    if (session.status === 'confirmed' && !isTempAuthCodeExpired(session, now)) {
        return serializeUserSession(session);
    }

    session.status = 'confirmed';
    session.scannedByOpenid = openid;
    session.scannedIp = session.scannedIp || client.ip;
    session.scannedUserAgent = session.scannedUserAgent || client.userAgent;
    session.scannedAt = session.scannedAt || now;
    session.confirmedIp = client.ip;
    session.confirmedUserAgent = client.userAgent;
    session.confirmedAt = now;
    session.tempAuthCode = createRandomHex(TEMP_AUTH_CODE_BYTES);
    session.tempAuthCodeConsumedAt = null;
    session.tempAuthCodeExpiresAt = new Date(now.getTime() + TEMP_AUTH_CODE_TTL_MS);
    await session.save();

    return serializeUserSession(session);
}

async function consumeTempAuthCode(tempAuthCode, expectedIntent, context = {}) {
    const now = new Date();
    const client = normalizeClientContext(context);
    const intentQuery = Array.isArray(expectedIntent)
        ? { $in: expectedIntent }
        : expectedIntent;

    const session = await ScanLoginSession.findOneAndUpdate(
        {
            tempAuthCode,
            intent: intentQuery,
            status: 'confirmed',
            tempAuthCodeConsumedAt: null,
            tempAuthCodeExpiresAt: { $gt: now },
        },
        {
            $set: {
                status: 'consumed',
                consumedIp: client.ip,
                consumedUserAgent: client.userAgent,
                tempAuthCodeConsumedAt: now,
                cleanupAt: buildCleanupAt(now),
            },
        },
        {
            new: false,
        },
    );

    if (!session || !session.scannedByOpenid) {
        throw new AppError('扫码确认已失效，请重新扫码', 400);
    }

    return {
        openid: session.scannedByOpenid,
        intent: session.intent,
        qrToken: session.qrToken,
    };
}

module.exports = {
    createQrSession,
    getStatusByPollToken,
    scanByUser,
    confirmByUser,
    consumeTempAuthCode,
};
