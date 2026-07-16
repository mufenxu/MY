# MY Unified Platform

两个微信小程序、管理后台、校园服务、IoT 服务和通知服务的统一工程。

## Project layout

```text
unified-platform/
├─ apps/
│  ├─ admin-console/          # 统一登录与服务总览
│  ├─ core-admin/             # 综合业务后台（统一路径 + 旧域名兼容）
│  ├─ exam-admin/             # 考试业务后台（统一路径 + 旧域名兼容）
│  ├─ smart-campus-miniapp/   # 综合微信小程序
│  └─ exam-miniapp/           # 考试学习微信小程序
├─ services/
│  ├─ platform-api/           # 单进程统一入口与模块编排
│  ├─ core-api/               # 综合小程序业务模块
│  ├─ exam-api/               # 考试业务模块
│  ├─ notification-service/   # 企业微信通知模块
│  ├─ campus-service/         # 校园系统独立容器
│  └─ iot-service/            # MQTT 独立容器
├─ automation/ct8-automation/
├─ packages/                  # 稳定的跨模块共享包
├─ config/                    # 无密钥服务注册表
├─ infra/docker/              # 四个常驻容器与 MongoDB 初始化任务
├─ scripts/                   # 工作区命令
├─ docs/                      # 架构与运维文档
```

## Local admin console

```powershell
npm run install:console
npm run dev:console
```

默认访问 `http://127.0.0.1:5180`。

## Quality checks

```powershell
npm run check
```

## Containers

生产端口按统一号段连续分配：

| Service | Host port | Container port |
| --- | ---: | ---: |
| `platform-api` | `22100` | `22100` |
| `campus-service` | `22101` | `22101` |
| `iot-service` | `22102` | `22102` |
| `mongodb` | `127.0.0.1:27017` | `27017` |

生产目标为四个常驻容器：`platform-api`、`campus-service`、`iot-service`、`mongodb`，另有一次性 `mongodb-init` 初始化任务。

网页管理面使用一个主域名和一次登录：`/apps/core/`、`/apps/exam/`、`/apps/campus/`、`/apps/iot/` 均由 `platform-api` 统一认证和转发。原业务域名与小程序 API 保持兼容。

```powershell
npm run compose:pull
npm run compose:up
```

当前阿里云 ACR 仓库为公开仓库，服务器拉取镜像不需要登录；以后切回私有仓库时再执行 `docker login`。

Alibaba Cloud Container Registry is the primary deployment registry:

- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:platform-api-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:campus-service-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:iot-service-latest`
- `crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my:mongodb-7.0`

Every push to `main` also runs the full workspace checks and publishes three backup application images to GitHub Container Registry:

- `ghcr.io/mufenxu/my-platform-api:latest`
- `ghcr.io/mufenxu/my-campus-service:latest`
- `ghcr.io/mufenxu/my-iot-service:latest`

ACR build rules and maintenance instructions are documented in [docs/aliyun-acr.md](./docs/aliyun-acr.md).

详细边界见 [docs/architecture.md](./docs/architecture.md)。生产配置不得提交到 Git，所有密钥从根目录 `.env` 注入。

单域名部署步骤见 [docs/single-domain-deployment.md](./docs/single-domain-deployment.md)。
