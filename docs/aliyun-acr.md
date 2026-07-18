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

Open GitHub Actions and run the workflow named `Build and push Aliyun ACR images`.

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
| `all` | all Dockerfiles | all image tags | all services |

Examples:

```text
platform,backup
iot
core,campus
all
```

Keep `push_sha_tags` enabled for normal releases. The workflow pushes both the deployment tag and an immutable SHA tag, for example:

```text
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest-45225c6abcd1
```

The existing `npm run acr:build -- <target>` command is now informational. It prints the GitHub Actions target value and the server deployment commands; it no longer pushes Git tags for ACR build rules.

## Deploy Images

After the GitHub Actions workflow succeeds, pull and recreate only the affected services on the server:

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull platform-api backup-runner
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build platform-api backup-runner
```

For MongoDB image updates, take a backup first and perform the restart in a maintenance window.

## Registry Login

The current ACR repository is public, so production servers can pull without logging in. Keep the optional login command only for future private-repository use:

```bash
# Optional: required only after changing the repository back to private.
# docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. Do not bake `.env`, credentials, private keys, or runtime data into any image.

## Legacy ACR Build Rules

Old ACR source build rules such as `tags:build-platform-.*` are no longer part of the release flow. Delete or disable them in the ACR console to avoid accidental failed builds.
