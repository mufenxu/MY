# MY Unified Platform

Unified workspace for the WeChat miniapps, admin consoles, backend services, deployment config, and operations scripts.

## Project layout

```text
MY/
|-- apps/
|   |-- admin-console/          # unified operations, security, release and disaster-recovery portal
|   |-- core-admin/             # core business admin console
|   |-- exam-admin/             # exam admin console
|   |-- smart-campus-miniapp/   # smart campus WeChat miniapp
|   `-- exam-miniapp/           # exam learning WeChat miniapp
|-- services/
|   |-- platform-api/           # unified gateway and module router
|   |-- core-api/               # core business API
|   |-- exam-api/               # exam business API
|   |-- notification-service/   # WeCom notification module
|   |-- campus-service/         # campus connector service
|   `-- iot-service/            # MQTT and device service
|-- packages/
|   `-- platform-auth/          # shared platform SSO and internal identity helpers
|-- automation/ct8-automation/  # non-resident automation tasks
|-- config/                     # service registry without secrets
|-- docs/                       # architecture and operations docs
|-- infra/                      # Docker and reverse proxy config
`-- scripts/                    # workspace maintenance commands
```

## Local admin console

```powershell
npm run install:console
npm run dev:console
```

Default URL: `http://127.0.0.1:5180`.

## Quality checks

```powershell
npm run check
```

## Containers

Production keeps the public gateway separate from every business runtime and from the privileged backup runner:

| Service | Host port | Container port |
| --- | ---: | ---: |
| `platform-api` | `22100` | `22100` |
| `core-api` | internal only | `3045` |
| `exam-api` | internal only | `3110` |
| `notification-service` | internal only | `3000` |
| `backup-runner` | internal only | `22103` |
| `campus-service` | `22101` | `22101` |
| `iot-service` | `22102` | `22102` |
| `mongodb` | `127.0.0.1:27017` | `27017` |

```powershell
npm run compose:pull
npm run compose:up
```

Alibaba Cloud Container Registry is the primary deployment registry:

- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:core-api-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:exam-api-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:notification-service-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:backup-runner-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:campus-service-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:iot-service-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:mongodb-7.0`

ACR registry and image release instructions are documented in [docs/aliyun-acr.md](./docs/aliyun-acr.md). Architecture boundaries are in [docs/architecture.md](./docs/architecture.md), and single-domain deployment steps are in [docs/single-domain-deployment.md](./docs/single-domain-deployment.md).

Pushes to `main` rebuild affected ACR images automatically through the GitHub Actions workflow named `Build and push Aliyun ACR images`. Run that workflow manually only for retries, full releases, or explicit target selection such as `platform,backup`.

The workflow now waits for the exact commit's CI result, smoke-tests immutable SHA candidates, and only then promotes deployment tags. The admin release center persists build artifacts and controlled deployment history; see [`docs/release-center.md`](docs/release-center.md).
