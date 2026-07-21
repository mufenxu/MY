import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, cp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const backupRoot = path.resolve(process.env.BACKUP_DIR || process.env.PLATFORM_BACKUP_DIR || '/app/backups');
const uploadsRoot = path.resolve(process.env.PLATFORM_CORE_UPLOADS_DIR || '/app/services/core-api/uploads');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupRoot, stamp);
const workDirectory = path.join(backupRoot, `${stamp}.in-progress`);
const archiveName = 'mongodb.archive.gz';
const archivePath = path.join(workDirectory, archiveName);
const applicationDatabases = ['platform_app', 'core_app', 'exam_app', 'campus_app', 'iot_app', 'notification_app'];

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for container backups.`);
  return value;
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`))));
  });
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function copyUploads() {
  try {
    await access(uploadsRoot);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await cp(uploadsRoot, path.join(workDirectory, 'uploads'), {
    recursive: true,
    force: true,
    preserveTimestamps: true,
  });
  return true;
}

async function main() {
const mongoHost = process.env.PLATFORM_BACKUP_MONGO_HOST || process.env.MONGO_HOST || 'mongodb';
const mongoPort = process.env.PLATFORM_BACKUP_MONGO_PORT || process.env.MONGO_PORT || '27017';
const mongoUsername = process.env.PLATFORM_BACKUP_MONGO_USERNAME || process.env.MONGO_ROOT_USERNAME || '';
const mongoPassword = process.env.PLATFORM_BACKUP_MONGO_PASSWORD || process.env.MONGO_ROOT_PASSWORD || '';
const mongoAuthDb = process.env.PLATFORM_BACKUP_MONGO_AUTH_DB || 'admin';

if (!mongoUsername) required('PLATFORM_BACKUP_MONGO_USERNAME');
if (!mongoPassword) required('PLATFORM_BACKUP_MONGO_PASSWORD');

await mkdir(workDirectory, { recursive: true, mode: 0o700 });
let completed = false;
try {
  const dump = spawn('mongodump', [
    '--host', mongoHost,
    '--port', mongoPort,
    '--username', mongoUsername,
    '--password', mongoPassword,
    '--authenticationDatabase', mongoAuthDb,
    '--oplog',
    '--archive',
    '--gzip',
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const archive = createWriteStream(archivePath, { mode: 0o600 });
  await Promise.all([
    pipeline(dump.stdout, archive),
    waitForChild(dump, 'mongodump'),
  ]);

  const uploadsIncluded = await copyUploads();
  const metadata = {
    formatVersion: 2,
    createdAt: new Date().toISOString(),
    mode: 'backup-runner-container',
    mongoArchive: archiveName,
    mongoSha256: await sha256(archivePath),
    oplog: true,
    applicationsStopped: [],
    includes: uploadsIncluded ? [...applicationDatabases, 'core_uploads'] : applicationDatabases,
  };
  await writeFile(path.join(workDirectory, 'manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await rename(workDirectory, destination);
  completed = true;
} finally {
  if (!completed) await rm(workDirectory, { recursive: true, force: true });
}

const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10));
const cutoff = Date.now() - retentionDays * 86400000;
for (const entry of await readdir(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === stamp) continue;
  const target = path.join(backupRoot, entry.name);
  if ((await stat(target)).mtimeMs < cutoff) await rm(target, { recursive: true, force: true });
}

console.log(destination);
}

main().catch((error) => {
  console.error(`容器内备份失败：${error.message}`);
  process.exitCode = 1;
});
