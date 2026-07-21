import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const projects = [
  'apps/admin-console',
  'apps/official-website',
  'apps/core-admin',
  'apps/exam-admin',
  'apps/exam-miniapp',
  'apps/smart-campus-miniapp/miniprogram',
  'services/platform-api',
  'services/core-api',
  'services/exam-api',
  'services/campus-service',
  'services/iot-service',
  'services/notification-service',
];

function npmCommand(args) {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => candidate.endsWith('.js') && existsSync(candidate));
  if (npmCli) return { command: process.execPath, args: [npmCli, ...args] };
  if (process.platform === 'win32') return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] };
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args };
}

for (const project of projects) {
  console.log(`\nInstalling ${project}`);
  const command = npmCommand(['ci', '--prefix', project, '--no-audit', '--no-fund']);
  const result = spawnSync(command.command, command.args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
