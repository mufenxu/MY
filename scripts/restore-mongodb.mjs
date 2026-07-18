import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const [backupDirectory, confirmation] = process.argv.slice(2);
if (!backupDirectory || confirmation !== '--confirm-drop') {
  throw new Error('Usage: npm run restore -- <backup-directory> --confirm-drop');
}

const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(backupDirectory);
const archivePath = path.join(directory, 'mongodb.archive.gz');
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const composeArgs = ['compose', '--env-file', '.env', '-f', 'infra/docker/compose.yml'];
const applicationServices = [
  'platform-api',
  'core-api',
  'exam-api',
  'notification-service',
  'campus-service',
  'iot-service',
];
await access(archivePath);

const hash = createHash('sha256');
for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
if (hash.digest('hex') !== manifest.mongoSha256) throw new Error('Backup checksum mismatch.');

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`)));
  });
}

async function run(command, args, { capture = false } = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
  });
  let output = '';
  if (capture) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
  }
  await waitForChild(child, command);
  return output;
}

const runningOutput = await run('docker', [...composeArgs, 'ps', '--services', '--status', 'running'], { capture: true });
const runningSet = new Set(runningOutput.split(/\r?\n/).map((value) => value.trim()).filter(Boolean));
const runningApplications = applicationServices.filter((service) => runningSet.has(service));
if (runningApplications.length > 0) {
  await run('docker', [...composeArgs, 'stop', '--timeout', '30', ...runningApplications]);
}

let restoreError;
try {
  const child = spawn('docker', [
    ...composeArgs,
    'exec', '-T', 'mongodb',
    'mongorestore',
    '--username', process.env.MONGO_ROOT_USERNAME || '',
    '--password', process.env.MONGO_ROOT_PASSWORD || '',
    '--authenticationDatabase', 'admin',
    ...(manifest.oplog ? ['--oplogReplay'] : []),
    '--archive', '--gzip', '--drop'
  ], { cwd: root, stdio: ['pipe', 'inherit', 'inherit'] });
  await Promise.all([
    pipeline(createReadStream(archivePath), child.stdin),
    waitForChild(child, 'mongorestore')
  ]);
} catch (error) {
  restoreError = error;
}
if (restoreError) throw restoreError;

console.log(`MongoDB restored from ${directory}.`);
console.log(`Application services remain stopped: ${runningApplications.join(', ') || '(none were running)'}.`);
console.log(`Restore uploads from ${path.join(directory, 'uploads')}, then start the stopped services to clear all in-memory state.`);
