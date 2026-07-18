import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const root = path.resolve(import.meta.dirname, '..');
const backupRoot = path.resolve(process.env.BACKUP_DIR || path.join(root, 'backups'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupRoot, stamp);
const archivePath = path.join(destination, 'mongodb.archive.gz');
const composeArgs = ['compose', '--env-file', '.env', '-f', 'infra/docker/compose.yml'];
const applicationServices = [
  'platform-api',
  'core-api',
  'exam-api',
  'notification-service',
  'campus-service',
  'iot-service',
];

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

async function runningApplications() {
  const output = await run('docker', [...composeArgs, 'ps', '--services', '--status', 'running'], { capture: true });
  const running = new Set(output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean));
  return applicationServices.filter((service) => running.has(service));
}

async function withApplicationsStopped(callback) {
  const running = await runningApplications();
  if (running.length > 0) await run('docker', [...composeArgs, 'stop', '--timeout', '30', ...running]);

  let result;
  let taskError;
  try {
    result = await callback(running);
  } catch (error) {
    taskError = error;
  }

  try {
    if (running.length > 0) await run('docker', [...composeArgs, 'start', ...running]);
  } catch (restartError) {
    if (taskError) {
      throw new AggregateError([taskError, restartError], 'Backup failed and application services could not be restarted.');
    }
    throw restartError;
  }
  if (taskError) throw taskError;
  return result;
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

await mkdir(destination, { recursive: true, mode: 0o700 });
let completed = false;
try {
  await withApplicationsStopped(async (stoppedServices) => {
    const dump = spawn('docker', [
      ...composeArgs,
      'exec', '-T', 'mongodb',
      'mongodump',
      '--username', process.env.MONGO_ROOT_USERNAME || '',
      '--password', process.env.MONGO_ROOT_PASSWORD || '',
      '--authenticationDatabase', 'admin',
      '--oplog', '--archive', '--gzip'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    const archive = createWriteStream(archivePath, { mode: 0o600 });
    await Promise.all([
      pipeline(dump.stdout, archive),
      waitForChild(dump, 'mongodump')
    ]);

    await run('docker', [...composeArgs, 'cp', 'core-api:/app/services/core-api/uploads', destination]);
    const metadata = {
      formatVersion: 2,
      createdAt: new Date().toISOString(),
      mongoArchive: path.basename(archivePath),
      mongoSha256: await sha256(archivePath),
      oplog: true,
      applicationsStopped: stoppedServices,
      includes: ['platform_app', 'core_app', 'exam_app', 'campus_app', 'iot_app', 'core_uploads']
    };
    await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  });
  completed = true;
} finally {
  if (!completed) await rm(destination, { recursive: true, force: true });
}

const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10));
const cutoff = Date.now() - retentionDays * 86400000;
for (const entry of await readdir(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === stamp) continue;
  const target = path.join(backupRoot, entry.name);
  if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
}

console.log(destination);
