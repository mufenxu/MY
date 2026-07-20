const SENSITIVE_QUERY_PARAM = /(?:token|secret|password|code|signature|key|scene)/i;

const contentSecurityPolicyDirectives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "https://challenges.cloudflare.com"],
    "script-src-attr": ["'none'"],
    "img-src": ["'self'", "data:", "blob:", "https://*"],
    "connect-src": ["'self'", "https://challenges.cloudflare.com"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "https://challenges.cloudflare.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "upgrade-insecure-requests": null,
};

function sanitizeRequestUrl(req) {
    const rawUrl = req.originalUrl || req.url || '/';
    try {
        const parsed = new URL(rawUrl, 'http://localhost');
        for (const key of parsed.searchParams.keys()) {
            if (SENSITIVE_QUERY_PARAM.test(key)) {
                parsed.searchParams.set(key, '[REDACTED]');
            }
        }
        return `${parsed.pathname}${parsed.search}`;
    } catch (_) {
        return rawUrl.includes('?') ? `${rawUrl.split('?', 1)[0]}?[REDACTED]` : rawUrl;
    }
}

module.exports = { contentSecurityPolicyDirectives, sanitizeRequestUrl };
