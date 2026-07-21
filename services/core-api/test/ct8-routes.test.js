const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'ct8-route-test-secret';

const canonicalRouter = require('../routes/ct8Routes');
const legacyRouter = require('../routes/github');

function routeSignatures(router) {
    return router.stack
        .filter((layer) => layer.route)
        .map((layer) => `${Object.keys(layer.route.methods).sort().join(',')}:${layer.route.path}`)
        .sort();
}

test('canonical and legacy CT8 routers expose the same operations', () => {
    assert.deepEqual(routeSignatures(legacyRouter), routeSignatures(canonicalRouter));
    assert.ok(routeSignatures(canonicalRouter).includes('get:/status'));
    assert.ok(routeSignatures(canonicalRouter).includes('post:/trigger'));
    assert.ok(routeSignatures(canonicalRouter).includes('post:/webhook'));
});

test('legacy CT8 routes advertise the canonical successor', async () => {
    const middleware = legacyRouter.stack.find((layer) => !layer.route)?.handle;
    assert.ok(middleware);
    const headers = {};
    await new Promise((resolve, reject) => middleware(
        {},
        { setHeader(name, value) { headers[name] = value; } },
        (error) => error ? reject(error) : resolve(),
    ));
    assert.equal(headers.Deprecation, 'true');
    assert.equal(headers.Link, '</api/ct8>; rel="successor-version"');
});
