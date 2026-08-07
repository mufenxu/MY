const crypto = require('crypto');
const GoogleAccountLedger = require('../models/GoogleAccountLedger');

const MAX_ACCOUNTS = 1000;
const MAX_ALIASES = 100;
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 1000;
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);
const ALIAS_TYPES = new Set(['plus', 'workspace', 'custom', 'other']);
const ALIAS_STATUSES = new Set(['candidate', 'confirmed', 'unavailable']);
const OPENAI_STATUSES = new Set(['unregistered', 'registered', 'verification', 'abnormal', 'disabled', 'unknown']);
const EMAIL_STATUSES = new Set(['normal', 'attention', 'unavailable', 'unknown']);

function invalid(field, message = `Invalid Google account ${field}`) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
}

function normalizeEmail(value, field) {
    if (typeof value !== 'string') return invalid(field);
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid(field);
    return email;
}

function normalizeId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return id && id.length <= MAX_ID_LENGTH ? id : crypto.randomUUID();
}

function normalizeText(value, field) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.trim().length > MAX_TEXT_LENGTH) return invalid(field);
    return value.trim();
}

function normalizeEnum(value, allowed, fallback, field) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (!allowed.has(normalized)) return invalid(field);
    return normalized;
}

function normalizeTimestamp(value, field) {
    if (value === undefined || value === null || value === '') return null;
    const timestamp = Number(value);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) return invalid(field);
    return timestamp;
}

function normalizeAlias(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('alias');
    return {
        id: normalizeId(raw.id),
        address: normalizeEmail(raw.address, 'alias address'),
        aliasType: normalizeEnum(raw.aliasType, ALIAS_TYPES, 'plus', 'alias type'),
        aliasStatus: normalizeEnum(raw.aliasStatus, ALIAS_STATUSES, 'candidate', 'alias status'),
        openAiStatus: normalizeEnum(raw.openAiStatus, OPENAI_STATUSES, 'unregistered', 'OpenAI status'),
        registeredAt: normalizeTimestamp(raw.registeredAt, 'registeredAt'),
        lastVerifiedAt: normalizeTimestamp(raw.lastVerifiedAt, 'lastVerifiedAt'),
        note: normalizeText(raw.note, 'alias note')
    };
}

function normalizeAccount(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('record');
    if (!Array.isArray(raw.aliases) || raw.aliases.length > MAX_ALIASES) return invalid('aliases');

    const primaryEmail = normalizeEmail(raw.primaryEmail, 'primary email');
    const aliases = raw.aliases.map(normalizeAlias);
    const aliasAddresses = new Set();
    for (const alias of aliases) {
        if (aliasAddresses.has(alias.address) || alias.address === primaryEmail) return invalid('duplicate alias address');
        aliasAddresses.add(alias.address);
    }

    return {
        id: normalizeId(raw.id),
        primaryEmail,
        normalizedPrimaryEmail: primaryEmail,
        displayName: normalizeText(raw.displayName, 'display name'),
        emailStatus: normalizeEnum(raw.emailStatus, EMAIL_STATUSES, 'unknown', 'email status'),
        note: normalizeText(raw.note, 'note'),
        lastCheckedAt: normalizeTimestamp(raw.lastCheckedAt, 'lastCheckedAt'),
        aliases
    };
}

function normalizeAccounts(raw) {
    if (!Array.isArray(raw) || raw.length > MAX_ACCOUNTS) {
        return invalid('accounts', `accounts must be an array with at most ${MAX_ACCOUNTS} items`);
    }

    const accountIds = new Set();
    const primaryEmails = new Set();
    return raw.map((item) => {
        const account = normalizeAccount(item);
        if (accountIds.has(account.id)) return invalid('duplicate account id');
        if (primaryEmails.has(account.normalizedPrimaryEmail)) return invalid('duplicate primary email');
        accountIds.add(account.id);
        primaryEmails.add(account.normalizedPrimaryEmail);
        return account;
    });
}

function parseRevision(req) {
    const revision = req.body && req.body.revision;
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function revisionOf(ledger) {
    return Number.isSafeInteger(ledger?.revision) && ledger.revision >= 0 ? ledger.revision : 0;
}

function publicAccount(account) {
    return {
        id: account.id,
        primaryEmail: account.primaryEmail,
        displayName: account.displayName || '',
        emailStatus: account.emailStatus || 'unknown',
        note: account.note || '',
        lastCheckedAt: account.lastCheckedAt ?? null,
        aliases: (account.aliases || []).map((alias) => ({
            id: alias.id,
            address: alias.address,
            aliasType: alias.aliasType || 'plus',
            aliasStatus: alias.aliasStatus || 'candidate',
            openAiStatus: alias.openAiStatus || 'unregistered',
            registeredAt: alias.registeredAt ?? null,
            lastVerifiedAt: alias.lastVerifiedAt ?? null,
            note: alias.note || ''
        }))
    };
}

function sendSnapshot(res, ledger, statusCode = 200) {
    const revision = revisionOf(ledger);
    return res.status(statusCode).json({
        success: true,
        data: (ledger?.accounts || []).map(publicAccount),
        revision
    });
}

async function sendConflict(res, userId) {
    const current = await GoogleAccountLedger.findById(userId).lean();
    const revision = revisionOf(current);
    return res.status(409).json({
        success: false,
        code: 'GOOGLE_ACCOUNT_REVISION_CONFLICT',
        message: 'Google account ledger changed on another device',
        details: {
            data: (current?.accounts || []).map(publicAccount),
            revision
        }
    });
}

async function commitAccounts({ userId, expectedRevision, accounts }) {
    const now = Date.now();
    const revisionFilter = expectedRevision === 0
        ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
        : { revision: expectedRevision };
    const updated = await GoogleAccountLedger.findOneAndUpdate(
        { _id: userId, ...revisionFilter },
        { $set: { accounts, updatedAt: now }, $inc: { revision: 1 } },
        { new: true, runValidators: true }
    );
    if (updated) return updated;
    if (expectedRevision !== 0) return null;

    try {
        return await GoogleAccountLedger.create({
            _id: userId,
            accounts,
            revision: 1,
            updatedAt: now
        });
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }
}

async function getGoogleAccounts(req, res, next) {
    try {
        const ledger = await GoogleAccountLedger.findById(req.user._id).lean();
        return sendSnapshot(res, ledger);
    } catch (error) {
        return next(error);
    }
}

async function replaceGoogleAccounts(req, res, next) {
    try {
        const expectedRevision = parseRevision(req);
        if (expectedRevision === null) return invalid('revision');
        const accounts = normalizeAccounts(req.body?.accounts);
        const ledger = await commitAccounts({
            userId: req.user._id,
            expectedRevision,
            accounts
        });
        if (!ledger) return sendConflict(res, req.user._id);
        return sendSnapshot(res, ledger, expectedRevision === 0 && ledger.revision === 1 ? 201 : 200);
    } catch (error) {
        return next(error);
    }
}

module.exports = { getGoogleAccounts, replaceGoogleAccounts };
