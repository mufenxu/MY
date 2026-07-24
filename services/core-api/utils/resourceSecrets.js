const crypto = require('crypto');
const { encrypt, decrypt } = require('./crypto');

const SECRET_MASK = '********';
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SECRET_KEYS = new Set([
    'auth',
    'authentication',
    'authorization',
    'authorizationheader',
    'bearer',
    'bearertoken',
    'cookie',
    'cookies',
    'cookiejar',
    'password',
    'passwd',
    'passphrase',
    'secret',
    'secretkey',
    'token',
    'apikey',
    'accesskey',
    'privatekey',
    'clientsecret',
    'credential',
    'credentials',
    'encryptionkey',
    'session',
    'sessionid',
    'sessionkey',
    'signingkey',
    'sshkey'
]);

function normalizedKey(key) {
    return String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSecretKey(key) {
    const normalized = normalizedKey(key);
    return SECRET_KEYS.has(normalized)
        || normalized.includes('authorization')
        || normalized.includes('cookie')
        || normalized.endsWith('password')
        || normalized.endsWith('token')
        || normalized.endsWith('secret')
        || normalized.endsWith('apikey')
        || normalized.endsWith('accesskey')
        || normalized.endsWith('privatekey')
        || normalized.endsWith('sessionkey')
        || normalized.endsWith('signingkey')
        || normalized.endsWith('encryptionkey')
        || normalized.endsWith('sshkey');
}

function isMask(value) {
    return typeof value === 'string' && /^\*{4,}$/.test(value);
}

function transformSecretScalar(value, previous, mode) {
    if (mode === 'mask') return value ? SECRET_MASK : value;
    if (mode === 'decrypt') return typeof value === 'string' ? decrypt(value) : value;
    if (isMask(value) && previous !== undefined) return previous;
    if (typeof value === 'string' && value) return encrypt(value);
    return value;
}

function transformSecrets(value, previous, mode, forceSecret = false) {
    if (Array.isArray(value)) {
        const previousItems = Array.isArray(previous) ? previous : [];
        return value.map((item, index) => transformSecrets(item, previousItems[index], mode, forceSecret));
    }

    if (!value || typeof value !== 'object') {
        return forceSecret ? transformSecretScalar(value, previous, mode) : value;
    }

    const previousObject = previous && typeof previous === 'object' && !Array.isArray(previous)
        ? previous
        : {};
    const result = {};

    for (const [key, currentValue] of Object.entries(value)) {
        if (DANGEROUS_KEYS.has(key)) continue;

        const previousValue = previousObject[key];
        const secretValue = forceSecret || isSecretKey(key);
        if (secretValue) {
            if (currentValue && typeof currentValue === 'object') {
                result[key] = transformSecrets(currentValue, previousValue, mode, true);
            } else {
                result[key] = transformSecretScalar(currentValue, previousValue, mode);
            }
            continue;
        }

        result[key] = transformSecrets(currentValue, previousValue, mode, false);
    }

    // An omitted secret means "unchanged". Clients can explicitly send an empty
    // string to clear it.
    if (mode === 'encrypt') {
        for (const [key, previousValue] of Object.entries(previousObject)) {
            if (!DANGEROUS_KEYS.has(key)
                && (forceSecret || isSecretKey(key))
                && !Object.prototype.hasOwnProperty.call(result, key)) {
                result[key] = previousValue;
            }
        }
    }

    return result;
}

function resourceFingerprint(item) {
    if (!item || typeof item !== 'object') return '';
    const parts = ['name', 'host', 'ip', 'siteUrl']
        .map((key) => String(item[key] || '').trim().toLowerCase())
        .filter(Boolean);
    return parts.join('|');
}

function prepareResourceList(incoming, previous = []) {
    if (!Array.isArray(incoming)) return [];

    const previousItems = Array.isArray(previous) ? previous : [];
    const previousById = new Map();
    const previousByFingerprint = new Map();
    previousItems.forEach((item) => {
        if (item && item.resourceId) previousById.set(String(item.resourceId), item);
        const fingerprint = resourceFingerprint(item);
        if (fingerprint && !previousByFingerprint.has(fingerprint)) {
            previousByFingerprint.set(fingerprint, item);
        }
    });

    return incoming.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;

        const requestedId = item.resourceId ? String(item.resourceId) : '';
        const fingerprint = resourceFingerprint(item);
        const previousItem = (requestedId && previousById.get(requestedId))
            || (fingerprint && previousByFingerprint.get(fingerprint))
            || {};
        const resourceId = requestedId || previousItem.resourceId || crypto.randomUUID();

        return transformSecrets({ ...item, resourceId }, previousItem, 'encrypt');
    });
}

function maskResourceSecrets(value) {
    return transformSecrets(value, undefined, 'mask');
}

function revealResourcePasswords(value) {
    const masked = maskResourceSecrets(value);

    const revealListPasswords = (maskedList, storedList) => {
        if (!Array.isArray(maskedList)) return maskedList;
        const sourceList = Array.isArray(storedList) ? storedList : [];

        return maskedList.map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return item;

            const storedItem = sourceList[index];
            if (!storedItem || !Object.prototype.hasOwnProperty.call(storedItem, 'password')) {
                return item;
            }

            return {
                ...item,
                password: typeof storedItem.password === 'string'
                    ? decrypt(storedItem.password)
                    : storedItem.password
            };
        });
    };

    if (Array.isArray(masked)) {
        return revealListPasswords(masked, value);
    }

    if (masked && typeof masked === 'object' && value && typeof value === 'object') {
        return {
            ...masked,
            servers: revealListPasswords(masked.servers, value.servers),
            domains: revealListPasswords(masked.domains, value.domains)
        };
    }

    return masked;
}

function decryptResourceSecrets(value) {
    return transformSecrets(value, undefined, 'decrypt');
}

module.exports = {
    SECRET_MASK,
    isSecretKey,
    prepareResourceList,
    maskResourceSecrets,
    revealResourcePasswords,
    decryptResourceSecrets
};
