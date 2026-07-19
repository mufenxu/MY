# Alibaba Cloud Container Registry

The Beijing ACR repository is the primary production image registry:

```text
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my
```

ACR is used as a registry only. Docker images are built by GitHub Actions and pushed to ACR. Do not rely on ACR source build rules for GitHub repositories; the ACR Branch/Tag rule UI can treat wildcard tag rules as branch names when a build is started manually.

## GitHub Secrets

Configure these repository secrets in GitHub:

```text
ALIYUN_ACR_USERNAME
ALIYUN_ACR_PASSWORD
```

The password is the Alibaba Cloud Container Registry login password, not a GitHub password. Never commit the value to Git.

## Build Images

Pushes to `main` automatically build and push only the images affected by the changed files. Manual runs are still available for rebuilds, retries, and full releases.

The automatic trigger watches these paths:

```text
Dockerfile
backup-runner.Dockerfile
deployment-runner.Dockerfile
core-api.Dockerfile
exam-api.Dockerfile
notification-service.Dockerfile
campus-service.Dockerfile
iot-service.Dockerfile
apps/admin-console/**
apps/core-admin/**
apps/exam-admin/**
config/platform.services.docker.json
packages/platform-auth/**
services/platform-api/**
services/core-api/**
services/exam-api/**
services/notification-service/**
services/campus-service/**
services/iot-service/**
scripts/backup-runner.mjs
scripts/backup-mongodb-container.mjs
scripts/restore-mongodb-container.mjs
scripts/deployment-runner.mjs
scripts/configure-deployment-sidecar.mjs
infra/docker/compose.yml
infra/docker/mongodb.Dockerfile
infra/docker/mongodb-entrypoint.sh
infra/docker/mongo-init.sh
infra/docker/ensure-users.js
```

Automatic target selection:

| Changed path | Built target |
| --- | --- |
| `Dockerfile`, `apps/admin-console/**`, `config/platform.services.docker.json`, `services/platform-api/**` | `platform` |
| `backup-runner.Dockerfile`, `apps/admin-console/src/backups.js`, backup runner scripts | `backup` |
| `deployment-runner.Dockerfile`, deployment runner/configuration scripts | `runner` |
| `infra/docker/compose.yml` | `platform`, `runner` |
| `core-api.Dockerfile`, `apps/core-admin/**`, `services/core-api/**` | `core` |
| `exam-api.Dockerfile`, `apps/exam-admin/**`, `services/exam-api/**` | `exam` |
| `notification-service.Dockerfile`, `services/notification-service/**` | `notification` |
| `campus-service.Dockerfile`, `services/campus-service/**` | `campus` |
| `iot-service.Dockerfile`, `services/iot-service/**` | `iot` |
| `infra/docker/mongodb.Dockerfile`, MongoDB entrypoint/init/user scripts | `mongodb` |
| `packages/platform-auth/**` | `platform`, `core`, `exam`, `campus`, `iot` |

For manual rebuilds, open GitHub Actions and run the workflow named `Build and push Aliyun ACR images`.

Use the `targets` input to select the images to build:

| Target | Dockerfile | Image tag | Compose service |
| --- | --- | --- | --- |
| `platform` | `Dockerfile` | `platform-api-latest` | `platform-api` |
| `core` | `core-api.Dockerfile` | `core-api-latest` | `core-api` |
| `exam` | `exam-api.Dockerfile` | `exam-api-latest` | `exam-api` |
| `notification` | `notification-service.Dockerfile` | `notification-service-latest` | `notification-service` |
| `backup` | `backup-runner.Dockerfile` | `backup-runner-latest` | `backup-runner` |
| `campus` | `campus-service.Dockerfile` | `campus-service-latest` | `campus-service` |
| `iot` | `iot-service.Dockerfile` | `iot-service-latest` | `iot-service` |
| `mongodb` | `infra/docker/mongodb.Dockerfile` | `mongodb-7.0` | `mongodb` |
| `runner` | `deployment-runner.Dockerfile` | `deployment-runner-latest` | `deployment-runner` |
| `all` | all Dockerfiles | all image tags | all services |

Examples:

```text
platform,backup
iot
core,campus
all
```

`push_sha_tags` is a mandatory safety control. The workflow first pushes the immutable SHA candidate, starts the complete smoke stack with the exact candidate, and promotes the normal deployment tag only after verification, for example:

```text
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest-45225c6abcd1
```

The existing `npm run acr:build -- <target>` command is now informational. It prints the GitHub Actions target value and the server deployment commands; it no longer pushes Git tags for ACR build rules.

## Deploy Images

The preferred path is to select the successful build in the release center. It deploys the callback-verified `repository@sha256:...` reference through the restricted internal Sidecar, records the deployment in MongoDB, verifies health, and automatically restores the previous runtime Digest on failure.

The release center manages the eight product images. The `deployment-runner` image is built and smoke-tested by the same workflow but is intentionally excluded from release callbacks and one-click deployment because a privileged executor must not replace itself. Upgrade it explicitly with `docker compose --env-file .env -f infra/docker/compose.yml pull deployment-runner` followed by `docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --wait deployment-runner`.

For a break-glass manual deployment, preserve the current runtime Digest first, point the affected image variable at the exact verified Digest, then pull and recreate only the affected services:

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull platform-api backup-runner
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate --wait platform-api backup-runner
```

Do not use a mutable `latest` reference as the rollback point. For MongoDB image updates, take a restorable backup first, use an active maintenance window, and confirm the data migration rollback plan.

## Registry Login

The current ACR repository is public, so production servers can pull without logging in. Keep the optional login command only for future private-repository use:

```bash
# Optional: required only after changing the repository back to private.
# docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. Do not bake `.env`, credentials, private keys, or runtime data into any image.

## Legacy ACR Build Rules

Old ACR source build rules such as `tags:build-platform-.*` are no longer part of the release flow. Delete or disable them in the ACR console to avoid accidental failed builds.
