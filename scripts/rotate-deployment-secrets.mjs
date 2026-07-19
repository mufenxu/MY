import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const envPath = path.resolve(process.argv[2] || '.env');
const requestedKeys = process.argv.slice(3);
const rotations = new Map([
  ['NOTIFY_API_KEY', () => crypto.randomBytes(32).toString('base64url')],
  ['IOT_ADMIN_PASSWORD', () => crypto.randomBytes(24).toString('base64url')],
  ['PLATFORM_BACKUP_RUNNER_TOKEN', () => crypto.randomBytes(32).toString('base64url')],
  ['PLATFORM_DEPLOY_HOOK_TOKEN', () => crypto.randomBytes(32).toString('base64url')],
  ['MONGO_BACKUP_PASSWORD', () => crypto.randomBytes(32).toString('base64url')],
  ['MQTT_PASSWORD', () => crypto.randomBytes(24).toString('base64url')],
]);
// MQTT credentials must be changed on the broker and every device at the same
// time, so they are supported explicitly but excluded from the default batch.
const defaultRotationKeys = [
  'NOTIFY_API_KEY',
  'IOT_ADMIN_PASSWORD',
  'PLATFORM_BACKUP_RUNNER_TOKEN',
  'MONGO_BACKUP_PASSWORD',
];
const selectedKeys = requestedKeys.length > 0 ? requestedKeys : defaultRotationKeys;

for (const key of selectedKeys) {
  if (!rotations.has(key)) {
    throw new Error(`Unsupported secret key: ${key}`);
  }
}

const source = await fs.readFile(envPath, 'utf8');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
const seen = new Set();
const lines = source.split(/\r?\n/).map((line) => {
  const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
  if (!match || !selectedKeys.includes(match[1])) return line;
  if (seen.has(match[1])) throw new Error(`Duplicate environment key: ${match[1]}`);
  seen.add(match[1]);
  return `${match[1]}=${rotations.get(match[1])()}`;
});

for (const key of selectedKeys.filter((candidate) => !seen.has(candidate))) {
  if (lines.at(-1) !== '') lines.push('');
  lines.push(`${key}=${rotations.get(key)()}`);
}

const temporaryPath = `${envPath}.${process.pid}.tmp`;
await fs.writeFile(temporaryPath, lines.join(newline), { encoding: 'utf8', mode: 0o600 });
await fs.rename(temporaryPath, envPath);
console.log(`Rotated ${selectedKeys.join(', ')} in ${path.basename(envPath)}.`);
