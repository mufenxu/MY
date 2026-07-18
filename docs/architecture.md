# Architecture

## Deployable units

| Container | Source | Responsibility |
| --- | --- | --- |
| `platform-api` | `services/platform-api` | 统一门户、会话校验、内部身份签发与反向代理；不持有业务或 Mongo root 凭据 |
| `core-api` | `services/core-api` | 综合业务 API 与管理前端 |
| `exam-api` | `services/exam-api` | 考试业务 API 与管理前端 |
| `notification-service` | `services/notification-service` | 企业微信通知 API |
| `backup-runner` | `scripts/backup-runner.mjs` | 内网限定的备份/恢复执行器，使用专用 Mongo backup/restore 账号 |
| `campus-service` | `services/campus-service` | 校园系统连接器与用户网页 |
| `iot-service` | `services/iot-service` | MQTT、设备控制、遥测和 WebSocket |
| `mongodb` | Official image | 为核心与考试模块提供两个隔离数据库 |

两个微信小程序位于 `apps/`，通过微信开发者工具或 CI 发布，不进入 Docker 镜像。

## Single-domain management plane

生产管理入口只需要一个域名，例如当前的 `https://pxyb.cn`。Nginx 只把该域名转发到 `platform-api:22100`，平台网关再按路径分发：

| Public path | Purpose | Internal target |
| --- | --- | --- |
| `/` | 统一登录与服务总览 | 管理门户 |
| `/apps/core/` | 综合业务管理后台 | `core-api:3045` |
| `/apps/exam/` | 考试学习管理后台 | `exam-api:3110` |
| `/apps/campus/` | 校园服务工作台 | `campus-service:22101` |
| `/apps/iot/` | IoT / MQTT 管理后台 | `iot-service:22102` |
| `/api/core/` | 综合业务规范化 API 入口 | `core-api` |
| `/api/exam/` | 考试业务规范化 API 入口 | `exam-api` |
| `/api/campus/` | 校园服务规范化 API 入口 | `campus-service:22101` |
| `/api/iot/` | IoT 规范化 API 入口 | `iot-service:22102` |
| `/api/notify/` | 通知服务规范化 API 入口 | `notification-service:3000` |

旧业务域名和原 API 路径继续兼容，便于小程序平滑迁移和快速回滚。某个项目需要独立域名时，可在 Nginx 增加别名入口，不影响统一管理入口。

## Authentication model

- 浏览器只保存 `my_platform_session` 中央会话，Cookie 为 `HttpOnly`、`Secure`、`SameSite=Strict`。
- 中央会话除签名校验外还必须存在于服务端会话表；主动退出会立即撤销当前会话，容器重启后需要重新登录。
- `/apps/*` 由平台网关统一校验；未登录请求无法到达业务服务。
- 网关使用 Ed25519 私钥为每个内部请求签发 15 秒有效、绑定目标服务、HTTP 方法、路径和查询参数的身份票据。
- 下游容器只持有 Ed25519 公钥；单个业务容器失陷时无法伪造新的统一管理员票据。
- 网关会删除所有外部传入的内部身份请求头，业务容器再独立验签，防止伪造或跨服务重放。
- 综合、考试和校园后台会将统一账号映射到各自已有管理员，原权限、数据归属和审计记录保持不变。
- 原业务登录、JWT、API Key 和小程序用户认证继续保留，仅统一网页管理面的登录。

## Port allocation

| Service | Host port | Container port | Exposure |
| --- | ---: | ---: | --- |
| `platform-api` | `22100` | `22100` | Loopback, behind the reverse proxy |
| `core-api` | none | `3045` | Docker networks only |
| `exam-api` | none | `3110` | Docker networks only |
| `notification-service` | none | `3000` | Docker networks only |
| `backup-runner` | none | `22103` | Internal Docker network only |
| `campus-service` | `22101` | `22101` | Loopback and Docker network |
| `iot-service` | `22102` | `22102` | Loopback and Docker network |
| `mongodb` | `27017` | `27017` | Loopback and Docker internal network |

Development-only ports such as the Vite preview port are not part of the production allocation.

## Image distribution

Alibaba Cloud Container Registry is the primary production image source. GitHub Container Registry remains a backup produced by CI. Production hosts pull all eight images, including the MongoDB 7 mirror, from the Beijing ACR endpoint so deployment does not depend on Docker Hub or GHCR connectivity.

## Boundaries

- `apps/`：用户直接使用的前端和微信小程序。
- `services/`：可独立测试的后端模块和容器入口。
- `packages/`：跨服务共享的轻量基础能力，例如平台内部身份签发和 SSO 验签。
- `automation/`：不常驻服务器的 GitHub Actions 与运维任务。
- `infra/`：Docker、反向代理和部署配置。
- `config/`：不含密钥的服务注册表。

## Data ownership

- 管理门户使用 MongoDB 数据库 `platform_app` 保存可撤销会话。
- `core-api` 使用 MongoDB 数据库 `core_app`。
- `exam-api` 使用 MongoDB 数据库 `exam_app`。
- `campus-service` 使用 MongoDB 数据库 `campus_app`。
- `iot-service` 使用 MongoDB 数据库 `iot_app`。
- 五个数据库分别使用独立的最小权限账号；初始化任务使用 root，备份执行器使用独立的 `backup`/`restore` 账号。
- 服务之间通过 HTTP API 交互，不跨边界直接读取对方数据库。
