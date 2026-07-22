import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { createBackupManager, BackupOperationError } from '../apps/admin-console/src/backups.js';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const host = process.env.BACKUP_RUNNER_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.BACKUP_RUNNER_PORT || '22103', 10);
const token = process.env.PLATFORM_BACKUP_RUNNER_TOKEN || process.env.BACKUP_RUNNER_TOKEN || '';

if (!Number.isFinite(port) || port < 1 || port > 65535) {
  throw new Error('BACKUP_RUNNER_PORT must be a valid TCP port.');
}
if (token.length < 32 || /^(?:replace|change)_with_/i.test(token)) {
  throw new Error('PLATFORM_BACKUP_RUNNER_TOKEN must be at least 32 random characters.');
}

function parseInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const manager = createBackupManager({
  config: {
    workspaceRoot,
    backupRoot: path.resolve(process.env.PLATFORM_BACKUP_DIR || process.env.BACKUP_DIR || path.join(workspaceRoot, 'backups')),
    backupOperationsEnabled: process.env.PLATFORM_BACKUP_ENABLED !== 'false',
    restoreOperationsEnabled: process.env.PLATFORM_RESTORE_ENABLED !== 'false',
    preRestoreBackupEnabled: process.env.PLATFORM_RESTORE_PRE_BACKUP !== 'false',
    backupCommand: process.env.PLATFORM_BACKUP_COMMAND || '',
    restoreCommand: process.env.PLATFORM_RESTORE_COMMAND || '',
    restoreConfirmText: process.env.PLATFORM_RESTORE_CONFIRM_TEXT || 'RESTORE ALL DATA',
    backupCommandTimeoutMs: parseInteger(process.env.PLATFORM_BACKUP_COMMAND_TIMEOUT_MS, 30 * 60 * 1000, {
      min: 60 * 1000,
      max: 6 * 60 * 60 * 1000,
    }),
    backupUploadMaxBytes: parseInteger(process.env.PLATFORM_BACKUP_UPLOAD_MAX_BYTES, 5 * 1024 * 1024 * 1024, {
      min: 1024 * 1024,
      max: 5 * 1024 * 1024 * 1024,
    }),
  },
});
const transferTimeoutMs = parseInteger(
  process.env.PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS,
  10 * 60 * 1000,
  { min: 60 * 1000, max: 10 * 60 * 1000 },
);
const uploadMaxBytes = parseInteger(
  process.env.PLATFORM_BACKUP_UPLOAD_MAX_BYTES,
  5 * 1024 * 1024 * 1024,
  { min: 1024 * 1024, max: 5 * 1024 * 1024 * 1024 },
);

function secureTokenEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function safeDownloadName(filename) {
  return String(filename || 'backup.tar.gz').replace(/[^A-Za-z0-9_.-]/g, '_');
}

function writeDownload(res, download) {
  res.writeHead(200, {
    'Content-Type': download.contentType || 'application/gzip',
    'Content-Disposition': `attachment; filename="${safeDownloadName(download.filename)}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  download.stream.once('error', (error) => res.destroy(error));
  download.stream.pipe(res);
}

function requireToken(req, res) {
  const authorization = String(req.headers.authorization || '');
  if (!secureTokenEqual(authorization, `Bearer ${token}`)) {
    writeJson(res, 401, { error: '备份执行器凭据无效。', code: 'BACKUP_RUNNER_UNAUTHORIZED' });
    return false;
  }
  return true;
}

function normalizeRemoteAddress(value) {
  const address = String(value || '');
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function remoteAddressAllowed(value) {
  const address = normalizeRemoteAddress(value);
  if (address === '::1' || address === '127.0.0.1' || address.startsWith('127.')) return true;
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;
  const private172 = /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
  return private172;
}

function requireAllowedRemote(req, res) {
  if (remoteAddressAllowed(req.socket.remoteAddress)) return true;
  writeJson(res, 403, { error: '备份执行器拒绝外部网络来源。', code: 'BACKUP_RUNNER_REMOTE_REJECTED' });
  return false;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 32 * 1024) throw new BackupOperationError(413, 'REQUEST_TOO_LARGE', '请求体过大。');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BackupOperationError(400, 'INVALID_JSON', '请求 JSON 无效。');
  }
}

async function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'backup-runner.local'}`);

  if (!requireAllowedRemote(req, res)) return;

  if (req.method === 'GET' && url.pathname === '/health') {
    writeJson(res, 200, { status: 'ok', service: 'backup-runner' });
    return;
  }

  if (!requireToken(req, res)) return;

  if (req.method === 'GET' && url.pathname === '/status') {
    writeJson(res, 200, await manager.getStatus());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/backups/run') {
    const body = await readJsonBody(req);
    const job = await manager.startBackup({ requestedBy: String(body.requestedBy || 'admin') });
    writeJson(res, 202, { job });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/backups/upload') {
    const contentLength = Number.parseInt(req.headers['content-length'] || '', 10);
    if (Number.isFinite(contentLength) && contentLength > uploadMaxBytes) {
      throw new BackupOperationError(413, 'BACKUP_UPLOAD_TOO_LARGE', 'The backup archive exceeds the configured upload limit.');
    }
    const result = await manager.uploadBackup({
      filename: url.searchParams.get('filename') || '',
      stream: req,
      contentType: req.headers['content-type'] || 'application/gzip',
    });
    writeJson(res, 201, result);
    return;
  }

  const jobMatch = /^\/backups\/jobs\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && jobMatch) {
    writeJson(res, 200, { job: manager.getJob(decodeURIComponent(jobMatch[1])) });
    return;
  }

  const downloadMatch = /^\/backups\/([^/]+)\/download$/.exec(url.pathname);
  if (req.method === 'GET' && downloadMatch) {
    writeDownload(res, await manager.downloadBackup({ backupName: decodeURIComponent(downloadMatch[1]) }));
    return;
  }

  const backupMatch = /^\/backups\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'DELETE' && backupMatch) {
    writeJson(res, 200, await manager.deleteBackup({ backupName: decodeURIComponent(backupMatch[1]) }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/backups/restore') {
    const body = await readJsonBody(req);
    const job = await manager.startRestore({
      backupName: String(body.backupName || ''),
      requestedBy: String(body.requestedBy || 'admin'),
    });
    writeJson(res, 202, { job });
    return;
  }

  writeJson(res, 404, { error: '请求的资源不存在。', code: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    if (error instanceof BackupOperationError) {
      writeJson(res, error.status, { error: error.message, code: error.code });
      return;
    }
    console.error('Backup runner error:', error);
    writeJson(res, 500, { error: '备份执行器内部错误。', code: 'BACKUP_RUNNER_INTERNAL_ERROR' });
  });
});
server.requestTimeout = transferTimeoutMs;

server.listen(port, host, () => {
  console.log(`MY backup runner listening on http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down MY backup runner.`);
  await new Promise((resolve) => server.close(resolve));
}

process.on('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)));
process.on('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
