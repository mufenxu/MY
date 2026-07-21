import { spawnSync } from 'node:child_process';
import { npmCommand } from './lib/npm-command.mjs';

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

for (const project of projects) {
  console.log(`\nInstalling ${project}`);
  const command = npmCommand(['ci', '--prefix', project, '--no-audit', '--no-fund']);
  const result = spawnSync(command.command, command.args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
