const UnicomAccount = require('../models/UnicomAccount');
const provider = require('../services/unicomProvider');
const { encrypt, decrypt } = require('../utils/crypto');
const { ok } = require('../utils/respond');

const DRAFT_TTL = 10 * 60 * 1000;
const maskPhone = phone => `${phone.slice(0, 3)}****${phone.slice(-4)}`;

function draftOf(account) {
    return account?.draft && account.draftExpiresAt > Date.now() ? JSON.parse(decrypt(account.draft)) : null;
}

function snapshot(account) {
    const draft = draftOf(account);
    return {
        connected: account?.connected === true,
        maskedPhone: account?.maskedPhone || '',
        loginId: draft?.id || null,
        loginPhone: draft ? maskPhone(draft.phone) : '',
        stage: draft?.stage || 'ready',
        sentAt: draft?.sentAt || 0,
        retryAt: (account?.lastSmsAt || 0) + 60000,
    };
}

async function withAccount(req, res, next, action) {
    const owner = String(req.user._id);
    let locked = false;
    res.setHeader('Cache-Control', 'no-store');
    try {
        try {
            await UnicomAccount.updateOne({ _id: owner }, { $setOnInsert: { connected: false } }, { upsert: true });
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
        const account = await UnicomAccount.findOneAndUpdate(
            { _id: owner, busyUntil: { $lte: Date.now() } },
            { $set: { busyUntil: Date.now() + 90000 } },
            { new: true },
        ).select('+session +draft');
        if (!account) throw provider.failure('UNICOM_BUSY', '上次联通请求尚未结束，请稍候。', 409);
        locked = true;
        const result = await action(account);
        account.busyUntil = 0;
        await account.save();
        locked = false;
        return ok(res, result, { page: result.page });
    } catch (error) {
        return next(error);
    } finally {
        if (locked) await UnicomAccount.updateOne({ _id: owner }, { $set: { busyUntil: 0 } });
    }
}

function requireDraft(account, id, stages) {
    const draft = draftOf(account);
    if (!draft || draft.id !== id || !stages.includes(draft.stage)) {
        throw provider.failure('UNICOM_LOGIN_FLOW_EXPIRED', '本次登录流程已失效，请重新发送验证码。', 409);
    }
    return draft;
}

function requireSmsInterval(account) {
    if (Date.now() - account.lastSmsAt < 60000) throw provider.failure('RATE_LIMITED', '距离上次发送不足 60 秒，请稍候。', 429);
}

async function sendSms(account, draft) {
    requireSmsInterval(account);
    const previous = account.lastSmsAt;
    account.lastSmsAt = Date.now();
    draft.stage = 'sms_pending';
    draft.sentAt = account.lastSmsAt;
    // 超时也可能已经发出短信，先保存发送时间，避免重试造成连续发送。
    account.draft = encrypt(JSON.stringify(draft));
    await account.save();
    await provider.sendSms(draft);
    if (draft.stage === 'captcha_required') account.lastSmsAt = previous;
    account.draft = encrypt(JSON.stringify(draft));
}

async function getSession(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const account = await UnicomAccount.findById(String(req.user._id)).select('+draft');
        return ok(res, snapshot(account));
    } catch (error) { return next(error); }
}

function createLogin(req, res, next) {
    return withAccount(req, res, next, async account => {
        requireSmsInterval(account);
        const draft = provider.createLogin(req.body.phone);
        account.draftExpiresAt = Date.now() + DRAFT_TTL;
        await sendSms(account, draft);
        return snapshot(account);
    });
}

function captcha(req, res, next) {
    return withAccount(req, res, next, async account => {
        const draft = requireDraft(account, req.params.id, ['captcha_required']);
        await provider.validateCaptcha(draft, req.body.ticket, req.body.randStr);
        await sendSms(account, draft);
        return snapshot(account);
    });
}

function verifyLogin(req, res, next) {
    return withAccount(req, res, next, async account => {
        const draft = requireDraft(account, req.params.id, ['sms_sent', 'sms_pending']);
        await provider.login(draft, req.body.code);
        account.session = encrypt(JSON.stringify(draft));
        account.connected = true;
        account.maskedPhone = maskPhone(draft.phone);
        account.draft = '';
        account.draftExpiresAt = 0;
        return snapshot(account);
    });
}

function queryAccount(req, res, next, query) {
    return withAccount(req, res, next, async account => {
        if (!account.connected || !account.session) throw provider.failure('UNICOM_LOGIN_REQUIRED', '请先登录你的联通号码。');
        const session = JSON.parse(decrypt(account.session));
        try {
            const data = await query(session);
            account.session = encrypt(JSON.stringify(session));
            return { ...snapshot(account), ...data };
        } catch (error) {
            if (error.code === 'UNICOM_LOGIN_REQUIRED') {
                account.connected = false;
                account.session = '';
                await account.save();
            }
            throw error;
        }
    });
}

function getOverview(req, res, next) { return queryAccount(req, res, next, provider.overview); }
function getDetails(req, res, next) { return queryAccount(req, res, next, provider.details); }
function getXinjiangActivities(req, res, next) { return queryAccount(req, res, next, provider.xinjiangActivities); }
function getCoupons(req, res, next) { return queryAccount(req, res, next, session => provider.coupons(session, req.query.page)); }
function getCouponDetail(req, res, next) { return queryAccount(req, res, next, session => provider.couponDetail(session, req.params.id)); }

function disconnect(req, res, next) {
    return withAccount(req, res, next, async account => {
        account.connected = false;
        account.maskedPhone = '';
        account.session = '';
        account.draft = '';
        account.draftExpiresAt = 0;
        return snapshot(account);
    });
}

module.exports = { getSession, createLogin, captcha, verifyLogin, getOverview, getDetails, getXinjiangActivities, getCoupons, getCouponDetail, disconnect };
