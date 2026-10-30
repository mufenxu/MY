'use strict';

/**
 * 接口契约配置的运行时门面。
 *
 * 这里是 `config/error-codes.json` 之外的唯一一份错误码注册表，
 * 目的是让 6 个可部署单元与 `scripts/checks/` 读同一份数据，
 * 而不是各自维护一张表。
 *
 * 运行时对注册表缺失是容忍的（返回 null 并由调用方兜底），
 * 真正的强约束在 `scripts/checks/check-error-codes.mjs`：
 * 用了 `respond` 的文件里出现未登记的 code，`npm run check` 会失败。
 */

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, 'error-codes.json');

let cached = null;

function loadRegistry() {
    if (cached) return cached;
    try {
        const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        cached = {};
        for (const [code, entry] of Object.entries(parsed)) {
            if (code.startsWith('_')) continue; // _comment 之类的说明字段
            if (!entry || typeof entry !== 'object') continue;
            cached[code] = {
                http: Number(entry.http) || 500,
                zh: String(entry.zh || ''),
            };
        }
    } catch {
        cached = {};
    }
    return cached;
}

function getErrorCode(code) {
    if (!code) return null;
    return loadRegistry()[code] || null;
}

function httpStatusFor(code, fallback = 500) {
    const entry = getErrorCode(code);
    return entry ? entry.http : fallback;
}

function messageFor(code, fallback = '请求失败，请稍后再试。') {
    const entry = getErrorCode(code);
    return entry && entry.zh ? entry.zh : fallback;
}

function listErrorCodes() {
    return Object.keys(loadRegistry()).sort();
}

module.exports = {
    REGISTRY_PATH,
    getErrorCode,
    httpStatusFor,
    messageFor,
    listErrorCodes,
};
