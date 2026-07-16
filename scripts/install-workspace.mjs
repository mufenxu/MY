import { spawnSync } from 'node:child_process';

const projects = [
  'apps/admin-console',
  'apps/core-admin',
  'apps/exam-admin',
  'services/platform-api',
  'services/core-api',
  'services/exam-api',
  'services/campus-service',
  'services/iot-service',
];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const project of projects) {
  console.log(`\nInstalling ${project}`);
  const result = spawnSync(
    npmCommand,
    ['ci', '--prefix', project, '--no-audit', '--no-fund'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
