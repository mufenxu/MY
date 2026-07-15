# MY Unified Platform

两个微信小程序、管理后台、校园服务、IoT 服务和通知服务的统一工程。

## Project layout

```text
unified-platform/
├─ apps/
│  ├─ admin-console/          # 唯一统一管理门户
│  ├─ core-admin/             # 综合业务旧后台，迁移期间兼容
│  ├─ exam-admin/             # 考试业务旧后台，迁移期间兼容
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
├─ infra/docker/              # 四容器构建与编排
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

生产目标固定为四个容器：`platform-api`、`campus-service`、`iot-service`、`mongodb`。

```powershell
docker compose --env-file .env -f infra/docker/compose.yml up -d --build
```

Every push to `main` runs the full workspace checks and publishes three application images to GitHub Container Registry:

- `ghcr.io/mufenxu/my-platform-api:latest`
- `ghcr.io/mufenxu/my-campus-service:latest`
- `ghcr.io/mufenxu/my-iot-service:latest`

MongoDB continues to use the official `mongo:7.0` image.

详细边界见 [docs/architecture.md](./docs/architecture.md)。生产配置不得提交到 Git，所有密钥从根目录 `.env` 注入。
