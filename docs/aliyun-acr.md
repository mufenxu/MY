# Alibaba Cloud Container Registry

The Beijing ACR repository is the primary source for production images:

```text
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my
```

## Build rules

Keep overseas builders enabled, but do not use `branches:main` rules for the production `latest` images. Each image should be rebuilt by a dedicated Git tag so ordinary code pushes do not rebuild every image.

In the ACR build rule list, delete or change the old `branches:main` rules and configure these tag rules instead:

| Image | Branch/Tag rule | Build context directory | Dockerfile filename | Image tag |
| --- | --- | --- | --- | --- |
| Unified platform API | `tags:build-platform-.*` | `/` | `Dockerfile` | `platform-api-latest` |
| Core API | `tags:build-core-.*` | `/` | `core-api.Dockerfile` | `core-api-latest` |
| Exam API | `tags:build-exam-.*` | `/` | `exam-api.Dockerfile` | `exam-api-latest` |
| Notification service | `tags:build-notification-.*` | `/` | `notification-service.Dockerfile` | `notification-service-latest` |
| Backup runner | `tags:build-backup-.*` | `/` | `backup-runner.Dockerfile` | `backup-runner-latest` |
| Campus service | `tags:build-campus-.*` | `/` | `campus-service.Dockerfile` | `campus-service-latest` |
| IoT service | `tags:build-iot-.*` | `/` | `iot-service.Dockerfile` | `iot-service-latest` |
| MongoDB 7 mirror | `tags:build-mongodb-.*` | `/infra/docker/` | `mongodb.Dockerfile` | `mongodb-7.0` |

Application images use the repository root as build context so they can copy shared code from `packages/` as well as service files from `services/`. ACR's Dockerfile field accepts a filename, not a nested path, so the service Dockerfiles live at the repository root.

## Trigger one image build

Use the helper script to create and push the matching Git tag. The GitHub workflow only runs on `main`, so these build tags are for ACR image builds only.

```bash
npm run acr:build -- iot
npm run acr:build -- core campus
npm run acr:build -- iot --dry-run
```

Target names:

| Target | ACR tag rule | Compose service |
| --- | --- | --- |
| `platform` | `tags:build-platform-.*` | `platform-api` |
| `core` | `tags:build-core-.*` | `core-api` |
| `exam` | `tags:build-exam-.*` | `exam-api` |
| `notification` | `tags:build-notification-.*` | `notification-service` |
| `backup` | `tags:build-backup-.*` | `backup-runner` |
| `campus` | `tags:build-campus-.*` | `campus-service` |
| `iot` | `tags:build-iot-.*` | `iot-service` |
| `mongodb` | `tags:build-mongodb-.*` | `mongodb` |
| `all` | all tag rules | all image rules |

After ACR finishes the selected image build, pull and recreate only the affected service on the server:

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull iot-service
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build iot-service
```

For MongoDB image updates, take a backup first and perform the restart in a maintenance window.

## Deployment

The current ACR repository is public, so production servers can pull without logging in. Keep the optional login command only for future private-repository use, and never store its password in Git.

```bash
# Optional: required only after changing the repository back to private.
# docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. The repository is intentionally public for the current deployment workflow; do not bake `.env`, credentials, private keys, or runtime data into any image.
