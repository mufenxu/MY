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
| Campus service | `/services/campus-service/` | `Dockerfile` | `campus-service-latest` |
| IoT service | `/services/iot-service/` | `Dockerfile` | `iot-service-latest` |
| MongoDB 7 mirror | `/infra/docker/` | `mongodb.Dockerfile` | `mongodb-7.0` |

The platform API image uses the repository root because it builds the single-domain gateway and the admin assets. The campus and IoT service images intentionally use their service directories as build context so ACR can build them with the default `Dockerfile` setting. Each service carries a Docker-build vendor copy of `packages/platform-auth`; `npm run check:packages` verifies those copies stay byte-for-byte aligned with the shared package.

## Deployment

The current ACR repository is public, so production servers can pull without logging in. Keep the optional login command only for future private-repository use, and never store its password in Git.

```bash
# Optional: required only after changing the repository back to private.
# docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. The repository is intentionally public for the current deployment workflow; do not bake `.env`, credentials, private keys, or runtime data into any image.
