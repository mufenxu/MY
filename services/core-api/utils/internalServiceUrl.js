function enabled(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isPrivateIpv4(hostname) {
    const parts = String(hostname || '').split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
        || parts[0] === 127
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168);
}

function isInternalHostname(hostname) {
    const normalized = String(hostname || '').toLowerCase();
    return normalized === 'localhost'
        || normalized === '::1'
        || isPrivateIpv4(normalized)
        || !normalized.includes('.')
        || normalized.endsWith('.internal');
}

function resolveInternalServiceUrl({
    value,
    serviceName,
    developmentFallback,
    nodeEnv = process.env.NODE_ENV,
    allowPublic = enabled(process.env.ALLOW_PUBLIC_SERVICE_URLS),
}) {
    const configured = String(value || '').trim() || (nodeEnv === 'production' ? '' : developmentFallback);
    if (!configured) throw new Error(`${serviceName} internal URL is not configured`);
    let url;
    try {
        url = new URL(configured);
    } catch {
        throw new Error(`${serviceName} internal URL is invalid`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${serviceName} internal URL must be an HTTP origin without credentials or a path`);
    }
    if (nodeEnv === 'production' && !allowPublic && !isInternalHostname(url.hostname)) {
        throw new Error(`${serviceName} must use an internal service hostname in production`);
    }
    return url.toString().replace(/\/$/, '');
}

module.exports = {
    isInternalHostname,
    resolveInternalServiceUrl,
};
