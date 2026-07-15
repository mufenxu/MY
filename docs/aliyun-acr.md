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

The ACR console uses the Dockerfile directory as the build context. The platform Dockerfile must therefore remain at the repository root because it copies files from `apps/`, `services/`, and `config/`.

## Deployment

Log in with the ACR registry password configured in Alibaba Cloud. Do not store it in the repository.

```bash
docker login --username=mufenx crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build
```

For an ECS instance in the same Beijing VPC, the VPC registry endpoint may be used instead of the public endpoint. Keep the repository private because the application images contain server-side source code.
