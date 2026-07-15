# Architecture

## Deployable units

| Container | Source | Responsibility |
| --- | --- | --- |
| `platform-api` | `services/platform-api` | 组合核心 API、考试 API、通知 API 和管理门户 |
| `campus-service` | `services/campus-service` | 校园系统连接器与用户网页 |
| `iot-service` | `services/iot-service` | MQTT、设备控制、遥测和 WebSocket |
| `mongodb` | Official image | 为核心与考试模块提供两个隔离数据库 |

两个微信小程序位于 `apps/`，通过微信开发者工具或 CI 发布，不进入 Docker 镜像。

## Port allocation

| Service | Host port | Container port | Exposure |
| --- | ---: | ---: | --- |
| `platform-api` | `22100` | `22100` | Loopback, behind the reverse proxy |
| `campus-service` | `22101` | `22101` | Loopback and Docker network |
| `iot-service` | `22102` | `22102` | Loopback and Docker network |
| `mongodb` | Not published | `27017` | Docker internal network only |

Development-only ports such as the Vite preview port are not part of the production allocation.

## Image distribution

Alibaba Cloud Container Registry is the primary production image source. GitHub Container Registry remains a backup produced by CI. Production hosts pull all four images, including the MongoDB 7 mirror, from the Beijing ACR endpoint so deployment does not depend on Docker Hub or GHCR connectivity.

## Boundaries

- `apps/`：用户直接使用的前端和微信小程序。
- `services/`：可独立测试的后端模块和容器入口。
- `automation/`：不常驻服务器的 GitHub Actions 与运维任务。
- `packages/`：经过验证的跨模块共享代码，不存放业务杂项。
- `infra/`：Docker、反向代理和部署配置。
- `config/`：不含密钥的服务注册表。

## Data ownership

- `core-api` 使用 MongoDB 数据库 `core_app`。
- `exam-api` 使用 MongoDB 数据库 `exam_app`。
- `campus-service` 与 `iot-service` 各自拥有独立 SQLite 数据卷。
- 服务之间通过 HTTP API 交互，不跨边界直接读取对方数据库。
