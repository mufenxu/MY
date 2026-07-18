const path = require('path');

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
// Vite's configured/default content hash is eight URL-safe characters.
const HASHED_ASSET_PATTERN = /^assets\/.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+(?:\.map)?$/;

function normalizeRelativePath(root, filePath) {
    return path.relative(root, filePath).split(path.sep).join('/');
}

function isHashedAsset(root, filePath) {
    return HASHED_ASSET_PATTERN.test(normalizeRelativePath(root, filePath));
}

function setAdminStaticCacheHeaders(root, res, filePath) {
    if (isHashedAsset(root, filePath)) {
        res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
        return;
    }

    res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
}

function isSpaNavigationRequest(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/public') || req.path === '/health') {
        return false;
    }
    if (path.extname(req.path) && !req.path.endsWith('.html')) return false;
    return Boolean(req.accepts('html'));
}

module.exports = {
    ONE_YEAR_SECONDS,
    isHashedAsset,
    setAdminStaticCacheHeaders,
    isSpaNavigationRequest
};
