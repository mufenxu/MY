const jwt = require('jsonwebtoken');

function getJwtExpiresAt(token) {
    const decoded = jwt.decode(token) || {};
    const exp = Number(decoded.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

function buildCookieAuthPayload(token) {
    return {
        cookieAuth: true,
        expiresAt: getJwtExpiresAt(token),
    };
}

function omitAuthToken(payload = {}) {
    const sanitized = { ...payload };
    delete sanitized.token;
    return sanitized;
}

module.exports = {
    buildCookieAuthPayload,
    getJwtExpiresAt,
    omitAuthToken,
};
