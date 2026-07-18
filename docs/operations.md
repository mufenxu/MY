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

统一控制中心保留 **数据灾备** 页面，但实际命令由只连接内部网络的 `backup-runner` 执行。Mongo root 不再注入 `platform-api`；执行器使用独立的 Mongo `backup`/`restore` 账号和随机 Bearer Token。生产部署时，Compose 会把 `my-platform_platform_backups` 卷只挂载到执行器：

```env
PLATFORM_RESTORE_CONFIRM_TEXT=RESTORE ALL DATA
PLATFORM_BACKUP_COMMAND_TIMEOUT_MS=1800000
PLATFORM_RESTORE_ENABLED=false
PLATFORM_RESTORE_PRE_BACKUP=true
PLATFORM_BACKUP_RUNNER_TOKEN=<至少 32 位独立随机值>
MONGO_BACKUP_PASSWORD=<独立随机密码>
```

更新镜像后重建并重启门户与执行器：

```bash
docker compose --env-file .env -f infra/docker/compose.yml build platform-api backup-runner
docker compose --env-file .env -f infra/docker/compose.yml up -d --force-recreate platform-api backup-runner
```

如果控制中心显示执行器不可用，先检查 `backup-runner` 健康状态和两端 Token 是否一致。执行器不发布宿主机端口，不能从公网直接调用。

网页点击“立即备份”后，`platform-api` 通过内网鉴权调用 `backup-runner`。执行器运行 `mongodump --oplog`，创建五个数据库的副本集归档并复制核心上传文件。备份清单和校验和保存在 `platform_backups` 卷中。

网页进程无法可靠停止所有独立业务容器，因此生产 Compose 默认设置 `PLATFORM_RESTORE_ENABLED=false`，控制台不执行在线恢复。恢复只在维护窗口通过下面的命令行入口执行；命令会先停止当前正在运行的全部业务容器，避免 `mongorestore --drop` 与在线写入并发。恢复数据库后，按命令输出恢复上传目录，再启动业务容器以清掉进程内缓存和长连接状态：

```bash
docker compose --env-file .env -f infra/docker/compose.yml restart core-api exam-api notification-service campus-service iot-service
```

命令行仍保留宿主机备份入口，可在服务器项目根目录创建一份本地备份：

```bash
npm run backup
```

这个命令会短暂停止业务容器，创建 MongoDB 副本集时间点归档，复制核心上传文件，然后只重启原本正在运行的服务。它会写入带校验和的备份目录，并删除超过 `BACKUP_RETENTION_DAYS`（默认 30 天）的本地备份。请把备份目录同步到加密的异地存储；同一台服务器上的本地备份不等于灾备。

命令行恢复入口仍可用于服务器维护场景：

```bash
npm run restore -- /path/to/backup-directory --confirm-drop
```

该命令会校验 SHA-256，停止正在运行的全部业务容器，并使用 `mongorestore --drop --oplogReplay` 恢复数据库。它保留给低频、人工维护使用；不要通过修改生产开关绕过维护窗口。

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
