const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('production logger keeps a console transport for container diagnostics', () => {
    const coreRoot = path.resolve(__dirname, '..');
    const script = [
        "process.env.NODE_ENV = 'production';",
        "const logger = require('./utils/logger');",
        "process.stdout.write(JSON.stringify(logger.transports.map((transport) => transport.name)));",
        'logger.close();',
    ].join(' ');
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: coreRoot,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout).includes('console'));
});
