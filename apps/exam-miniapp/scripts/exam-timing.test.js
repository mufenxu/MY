const assert = require('node:assert/strict');
const test = require('node:test');

test('absolute deadline accounts for background time and server clock skew', () => {
    const { getRemainingSeconds, getServerClockOffset } = require('../miniprogram/utils/examTimer');
    const localStart = Date.parse('2026-07-19T00:00:00.000Z');
    const serverStart = localStart + 5000;
    const deadline = serverStart + 60_000;
    const offset = getServerClockOffset(serverStart, localStart);

    assert.equal(offset, 5000);
    assert.equal(getRemainingSeconds(deadline, offset, localStart), 60);
    assert.equal(getRemainingSeconds(deadline, offset, localStart + 45_000), 15);
    assert.equal(getRemainingSeconds(deadline, offset, localStart + 65_000), 0);
});
