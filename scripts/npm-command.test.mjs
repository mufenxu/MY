import assert from 'node:assert/strict';
import test from 'node:test';
import { npmCommand } from './lib/npm-command.mjs';

test('npm command uses the active npm CLI when it exists', () => {
  const command = npmCommand(['audit'], {
    env: { npm_execpath: '/tools/npm-cli.js' },
    execPath: '/runtime/node',
    platform: 'linux',
    fileExists: (candidate) => candidate === '/tools/npm-cli.js',
  });
  assert.deepEqual(command, {
    command: '/runtime/node',
    args: ['/tools/npm-cli.js', 'audit'],
  });
});

test('npm command has explicit Windows and POSIX fallbacks', () => {
  const options = {
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    execPath: 'C:\\node\\node.exe',
    fileExists: () => false,
  };
  assert.deepEqual(npmCommand(['ci'], { ...options, platform: 'win32' }), {
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd', 'ci'],
  });
  assert.deepEqual(npmCommand(['ci'], { ...options, platform: 'linux' }), {
    command: 'npm',
    args: ['ci'],
  });
});
