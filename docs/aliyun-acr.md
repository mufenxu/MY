# Alibaba Cloud Container Registry

The Beijing ACR repository is the primary source for production images:

```text
crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my
```

## Build rules

Enable automatic builds for source changes and keep overseas builders enabled. Configure these branch rules for `main`:

| Image | Build context directory | Dockerfile filename | Image tag |
| --- | --- | --- | --- |
| Unified platform API | `/` | `Dockerfile` | `platform-api-latest` |
| Campus service | `/` | `services/campus-service/Dockerfile` | `campus-service-latest` |
| IoT service | `/` | `services/iot-service/Dockerfile` | `iot-service-latest` |
| MongoDB 7 mirror | `/infra/docker/` | `mongodb.Dockerfile` | `mongodb-7.0` |

The ACR console uses the configured Dockerfile directory as the build context. The platform, campus, and IoT images now use the repository root as build context so they can copy shared code from `packages/` as well as service files from `services/`.

## Deployment

The current ACR repository is public, so production servers can pull without logging in. Keep the optional login command only for future private-repository use, and never store its password in Git.

```bash
# Optional: required only after changing the repository back to private.
# docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. The repository is intentionally public for the current deployment workflow; do not bake `.env`, credentials, private keys, or runtime data into any image.
