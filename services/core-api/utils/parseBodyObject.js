'use strict';

function parseBodyObject(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};

    const text = value.trim();
    if (!text) return {};

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
        // Continue with form-encoded parsing.
    }

    try {
        const params = new URLSearchParams(text);
        const result = {};
        for (const [key, entry] of params.entries()) result[key] = entry;
        return result;
    } catch (_) {
        return {};
    }
}

module.exports = { parseBodyObject };
