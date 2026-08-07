import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backup transfer limits stay aligned across application, runner, Compose, and Nginx', async () => {
  const [config, platformServer, runner, compose, nginx, dockerfile, envTemplate, imageTargets] = await Promise.all([
    readFile(new URL('../apps/admin-console/src/config.js', import.meta.url), 'utf8'),
    readFile(new URL('../services/platform-api/src/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./backup-runner.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../infra/docker/compose.yml', import.meta.url), 'utf8'),
    readFile(new URL('../infra/nginx/my-platform.conf.example', import.meta.url), 'utf8'),
    readFile(new URL('../backup-runner.Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../config/image-build-targets.json', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /backupTransferTimeoutMs:[^\n]+10 \* 60 \* 1000/);
  assert.match(config, /backupUploadMaxBytes:[^\n]+5 \* 1024 \* 1024 \* 1024/);
  assert.match(platformServer, /server\.requestTimeout = portalConfig\.backupTransferTimeoutMs/);
  assert.match(runner, /server\.requestTimeout = transferTimeoutMs/);
  assert.match(runner, /createBackupStorageService/);
  assert.match(runner, /PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY/);
  assert.match(runner, /\/offsite\/config/);
  assert.match(runner, /\/offsite\/test/);
  assert.match(runner, /\/offsite\/backups\/import/);
  assert.match(runner, /\/offsite\/backups\/sync/);
  assert.ok((compose.match(/PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS: \$\{PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS:-600000\}/g) || []).length >= 2);
  assert.ok((compose.match(/PLATFORM_BACKUP_UPLOAD_MAX_BYTES: \$\{PLATFORM_BACKUP_UPLOAD_MAX_BYTES:-5368709120\}/g) || []).length >= 2);
  assert.match(compose, /PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY: \$\{PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY:-\}/);
  assert.match(compose, /PLATFORM_BACKUP_STORAGE_STATE_PATH: \/app\/state\/offsite\.json/);
  assert.match(compose, /backup_runner_state:\/app\/state/);
  assert.match(dockerfile, /apps\/admin-console\/package-lock\.json/);
  assert.match(dockerfile, /npm ci --omit=dev --prefix apps\/admin-console/);
  assert.match(dockerfile, /backupStorage\.js/);
  assert.match(envTemplate, /PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY=/);
  assert.match(imageTargets, /apps\/admin-console\/package-lock\.json/);
  assert.match(imageTargets, /apps\/admin-console\/src\/backupStorage\.js/);
  assert.match(nginx, /location \^~ \/api\/backups\/ \{[\s\S]*client_max_body_size 5g;/);
  assert.match(nginx, /location \^~ \/api\/backups\/ \{[\s\S]*proxy_read_timeout 600s;[\s\S]*proxy_send_timeout 600s;/);
});

test('backup runner keeps private database access and outbound object storage access', async () => {
  const compose = await readFile(new URL('../infra/docker/compose.yml', import.meta.url), 'utf8');
  const start = compose.indexOf('\n  backup-runner:');
  const end = compose.indexOf('\n  campus-service:', start);
  const service = compose.slice(start, end);

  assert.match(service, /\n    networks:\r?\n      - frontend\r?\n      - backend(?:\r?\n|$)/);
});
