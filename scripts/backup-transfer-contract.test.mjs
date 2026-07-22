import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backup transfer limits stay aligned across application, runner, Compose, and Nginx', async () => {
  const [config, platformServer, runner, compose, nginx] = await Promise.all([
    readFile(new URL('../apps/admin-console/src/config.js', import.meta.url), 'utf8'),
    readFile(new URL('../services/platform-api/src/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./backup-runner.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../infra/docker/compose.yml', import.meta.url), 'utf8'),
    readFile(new URL('../infra/nginx/my-platform.conf.example', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /backupTransferTimeoutMs:[^\n]+10 \* 60 \* 1000/);
  assert.match(config, /backupUploadMaxBytes:[^\n]+5 \* 1024 \* 1024 \* 1024/);
  assert.match(platformServer, /server\.requestTimeout = portalConfig\.backupTransferTimeoutMs/);
  assert.match(runner, /server\.requestTimeout = transferTimeoutMs/);
  assert.ok((compose.match(/PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS: \$\{PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS:-600000\}/g) || []).length >= 2);
  assert.ok((compose.match(/PLATFORM_BACKUP_UPLOAD_MAX_BYTES: \$\{PLATFORM_BACKUP_UPLOAD_MAX_BYTES:-5368709120\}/g) || []).length >= 2);
  assert.match(nginx, /location \^~ \/api\/backups\/ \{[\s\S]*client_max_body_size 5g;/);
  assert.match(nginx, /location \^~ \/api\/backups\/ \{[\s\S]*proxy_read_timeout 600s;[\s\S]*proxy_send_timeout 600s;/);
});
