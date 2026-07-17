import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const [backupDirectory, confirmation] = process.argv.slice(2);
if (!backupDirectory || confirmation !== '--confirm-drop') {
  throw new Error('Usage: node scripts/restore-mongodb-container.mjs <backup-directory> --confirm-drop');
}

const backupRoot = path.resolve(process.env.BACKUP_DIR || process.env.PLATFORM_BACKUP_DIR || '/app/backups');
const uploadsRoot = path.resolve(process.env.PLATFORM_CORE_UPLOADS_DIR || '/app/services/core-api/uploads');
const directory = path.resolve(backupDirectory);

if (!(directory === backupRoot || directory.startsWith(`${backupRoot}${path.sep}`))) {
  throw new Error('Backup directory must be inside the configured backup root.');
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for container restores.`);
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

async function emptyDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const entries = await readdir(directoryPath, { withFileTypes: true });
  await Promise.all(entries.map((entry) => rm(path.join(directoryPath, entry.name), { recursive: true, force: true })));
}

async function copyDirectoryContents(source, target) {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await emptyDirectory(target);
  await Promise.all(entries.map((entry) => cp(
    path.join(source, entry.name),
    path.join(target, entry.name),
    { recursive: true, force: true, preserveTimestamps: true },
  )));
  return true;
}

async function main() {
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const archiveName = manifest.mongoArchive || 'mongodb.archive.gz';
if (path.basename(archiveName) !== archiveName) {
  throw new Error('Manifest archive path must be a file name.');
}
const archivePath = path.join(directory, archiveName);
await access(archivePath);

if (await sha256(archivePath) !== manifest.mongoSha256) {
  throw new Error('Backup checksum mismatch.');
}

const mongoHost = process.env.PLATFORM_BACKUP_MONGO_HOST || process.env.MONGO_HOST || 'mongodb';
const mongoPort = process.env.PLATFORM_BACKUP_MONGO_PORT || process.env.MONGO_PORT || '27017';
const mongoUsername = process.env.PLATFORM_BACKUP_MONGO_USERNAME || process.env.MONGO_ROOT_USERNAME || '';
const mongoPassword = process.env.PLATFORM_BACKUP_MONGO_PASSWORD || process.env.MONGO_ROOT_PASSWORD || '';
const mongoAuthDb = process.env.PLATFORM_BACKUP_MONGO_AUTH_DB || 'admin';

if (!mongoUsername) required('PLATFORM_BACKUP_MONGO_USERNAME');
if (!mongoPassword) required('PLATFORM_BACKUP_MONGO_PASSWORD');

const restore = spawn('mongorestore', [
  '--host', mongoHost,
  '--port', mongoPort,
  '--username', mongoUsername,
  '--password', mongoPassword,
  '--authenticationDatabase', mongoAuthDb,
  ...(manifest.oplog ? ['--oplogReplay'] : []),
  '--archive',
  '--gzip',
  '--drop',
], { stdio: ['pipe', 'inherit', 'inherit'] });

await Promise.all([
  pipeline(createReadStream(archivePath), restore.stdin),
  waitForChild(restore, 'mongorestore'),
]);

const uploadsRestored = await copyDirectoryContents(path.join(directory, 'uploads'), uploadsRoot);
console.log(`MongoDB restored from ${directory}.`);
console.log(uploadsRestored ? `Uploads restored to ${uploadsRoot}.` : 'Backup did not include uploads.');
}

main().catch((error) => {
  console.error(`容器内恢复失败：${error.message}`);
  process.exitCode = 1;
});
