# Production operations

## First deployment after the MongoDB consolidation

1. Back up the current MongoDB volume, campus `app.db`, IoT `mqttapi.db`, IoT `config.json`, and core uploads.
2. Update `.env` from `.env.example`. Generate a new replica-set key and five different URL-safe application database passwords.
3. Pull or build the latest images, then initialize MongoDB:

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d mongodb mongodb-init
docker compose --env-file .env -f infra/docker/compose.yml ps
```

4. Install the one-time SQLite readers, then import legacy data when it exists. Re-running the migration is safe: it inserts missing stable IDs and never overwrites records that already exist in MongoDB.

```bash
npm run install:migration
LEGACY_CAMPUS_DB=/secure/migration/app.db \
LEGACY_IOT_DATA_DIR=/secure/migration/iot-data \
npm run migrate:sqlite
```

5. Start the complete stack and verify readiness:

```bash
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --wait
curl --fail http://127.0.0.1:22100/api/readyz
curl --fail http://127.0.0.1:22101/api/ready
curl --fail http://127.0.0.1:22102/api/ready
```

Do not delete the SQLite files until the migrated user counts, settings, devices, API keys, history, campus sessions, and timetable caches have been checked.

## Backup and restore

Create a local backup containing all five MongoDB databases and core uploads:

```bash
npm run backup
```

The command briefly stops the three application containers, creates a replica-set point-in-time archive, copies core uploads, waits for the archive stream to finish, and then restarts only the services that were running. It writes a checksum-protected backup under `backups/` and removes local backups older than `BACKUP_RETENTION_DAYS` (default 30). Copy the resulting directory to encrypted off-host storage. A local backup on the same server is not disaster recovery.

The unified control center exposes the same operational flow under **数据灾备**. In production, run the backup executor on the host and let the platform container call it through `host.docker.internal`. Generate a shared token and add it to `.env`. The runner binds to `0.0.0.0` so Docker containers can reach it, but it rejects public remote addresses and still requires the token:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
BACKUP_RUNNER_HOST=0.0.0.0
BACKUP_RUNNER_PORT=22103
PLATFORM_BACKUP_RUNNER_URL=http://host.docker.internal:22103
PLATFORM_BACKUP_RUNNER_TOKEN=<the-generated-token>
PLATFORM_BACKUP_DIR=backups
PLATFORM_RESTORE_CONFIRM_TEXT='RESTORE ALL DATA'
```

Start the host-side runner from the workspace root, then recreate or restart `platform-api` so it receives the new environment:

```bash
npm run backup:runner
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate platform-api
```

For a permanent production setup, run `npm run backup:runner` under systemd or another host process supervisor. Restore from the control center first starts a fresh backup of the current state, then verifies the selected manifest SHA-256 checksum, requires the platform administrator password when authentication is enabled, and requires the configured confirmation phrase.

Restore only during a maintenance window, after taking a fresh backup:

```bash
npm run restore -- /path/to/backup-directory --confirm-drop
```

The restore command verifies the SHA-256 checksum, stops all running application containers, and uses `mongorestore --drop --oplogReplay`. It intentionally leaves application containers stopped so uploads can be restored before any new writes occur:

```bash
docker compose --env-file .env -f infra/docker/compose.yml run --rm --no-deps \
  --user root --cap-add DAC_OVERRIDE --cap-add FOWNER --entrypoint sh platform-api \
  -c 'find /app/services/core-api/uploads -mindepth 1 -delete'
docker compose --env-file .env -f infra/docker/compose.yml cp \
  /path/to/backup-directory/uploads/. platform-api:/app/services/core-api/uploads/
docker compose --env-file .env -f infra/docker/compose.yml run --rm --no-deps \
  --user root --cap-add CHOWN --entrypoint chown platform-api \
  -R node:node /app/services/core-api/uploads
docker compose --env-file .env -f infra/docker/compose.yml start campus-service iot-service platform-api
```

Recommended policy:

- daily backups retained for 7 days;
- weekly backups retained for 4 weeks;
- monthly backups retained for 6 months;
- a restore drill at least once per month;
- target RPO 24 hours and target RTO 4 hours.

## Health and metrics

- `/api/livez` checks the platform process.
- `/api/readyz` checks platform sessions plus the core and exam MongoDB runtimes.
- campus and IoT expose `/api/ready`.
- `/api/metrics` exposes Prometheus metrics and requires `Authorization: Bearer $PLATFORM_METRICS_TOKEN`.

Alert on these initial conditions:

- readiness fails for 3 consecutive minutes;
- HTTP 5xx exceeds 1 percent for 5 minutes;
- P95 latency exceeds 2 seconds;
- disk usage exceeds 80 percent;
- MQTT remains disconnected for 5 minutes;
- no successful off-host backup exists within 26 hours.

## Release and rollback

Production continues to use the configured `latest` image tags. CI publishes them only after quality, security, CodeQL, and complete Docker smoke jobs pass. Before an update, preserve locally tagged rollback images and the current deployment files:

```bash
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "/secure/my-platform-rollback/$stamp"
cp .env infra/docker/compose.yml "/secure/my-platform-rollback/$stamp/"
docker image tag "$(docker compose --env-file .env -f infra/docker/compose.yml images -q platform-api)" "my-platform-rollback:platform-api-$stamp"
docker image tag "$(docker compose --env-file .env -f infra/docker/compose.yml images -q campus-service)" "my-platform-rollback:campus-service-$stamp"
docker image tag "$(docker compose --env-file .env -f infra/docker/compose.yml images -q iot-service)" "my-platform-rollback:iot-service-$stamp"
```

Pull, recreate, and verify:

```bash
npm run compose:pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate --wait
curl --fail http://127.0.0.1:22100/api/readyz
```

For an ordinary post-migration release, point the three image variables at those local rollback tags and recreate the stack. Never prune images until the new deployment has passed acceptance checks.

The first SQLite-to-MongoDB consolidation is a data migration, not an ordinary image rollback. Before that release, also preserve the pre-migration Compose file, the `campus_data` and `iot_data` volumes, all SQLite files, and a MongoDB/core-uploads backup. An old SQLite image cannot run with the new read-only MongoDB Compose layout; rollback must use the complete pre-migration Compose bundle and its original volumes.
