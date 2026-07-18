const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    ONE_YEAR_SECONDS,
    isHashedAsset,
    setAdminStaticCacheHeaders,
    isSpaNavigationRequest
} = require('../utils/staticAssets');

test('only fingerprinted assets receive a one-year immutable cache policy', () => {
    const root = path.resolve('admin-dist');
    const hashed = path.join(root, 'assets', 'index-BkTNfJlE.js');
    const fixed = path.join(root, 'theme-bootstrap.js');
    const version = path.join(root, 'version.json');
    const headers = {};
    const res = { setHeader: (name, value) => { headers[name] = value; } };

    assert.equal(isHashedAsset(root, hashed), true);
    assert.equal(isHashedAsset(root, path.join(root, 'assets', 'index.js')), false);
    setAdminStaticCacheHeaders(root, res, hashed);
    assert.equal(headers['Cache-Control'], `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
    setAdminStaticCacheHeaders(root, res, fixed);
    assert.equal(headers['Cache-Control'], 'no-cache, max-age=0, must-revalidate');
    setAdminStaticCacheHeaders(root, res, version);
    assert.equal(headers['Cache-Control'], 'no-cache, max-age=0, must-revalidate');
});

test('SPA fallback accepts HTML navigation but never API or missing asset requests', () => {
    const request = (requestPath, accepts = true) => ({
        method: 'GET',
        path: requestPath,
        accepts: () => accepts
    });

    assert.equal(isSpaNavigationRequest(request('/dashboard')), true);
    assert.equal(isSpaNavigationRequest(request('/api/users')), false);
    assert.equal(isSpaNavigationRequest(request('/uploads/report')), false);
    assert.equal(isSpaNavigationRequest(request('/assets/missing.js')), false);
    assert.equal(isSpaNavigationRequest({ ...request('/dashboard'), method: 'POST' }), false);
});
