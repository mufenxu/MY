# MQTT Docker 监控面板

这是一个基于 Node.js 的 MQTT 监控服务，现在已经升级成适合服务器部署的 Docker 项目。它会订阅温湿度、继电器和设备在线状态等 MQTT 消息，并提供：

- HTTP API
- 浏览器可视化管理页面
- 可持久化的运行配置
- Docker / Docker Compose 部署方式
- 可选登录鉴权
- 作用域化 API Key 与脱敏配置管理

## 功能特性

- 实时订阅 MQTT 主题，读取温度、湿度、继电器状态
- 提供 `/api/latest`、`/api/status`、`/api/info` 等接口
- 提供浏览器管理页面，可直接查看状态和修改配置
- MQTT 配置修改后自动重连
- 配置、设备、历史与 API Key 统一保存到独立的 `iot_app` MongoDB 数据库
- 支持轻量登录会话，适合公网部署前做基础保护
- 提供 `/ws` 实时通道，页面收到 MQTT 消息后可立即更新
- API Key 仅在创建时展示一次，数据库内仅保存哈希值

## 项目结构

```text
mqttapi/
├─ src/                   # 服务端源码
│  ├─ index.js            # 服务启动入口
│  ├─ config.js           # 环境变量与默认配置
│  ├─ http/               # HTTP API、WebSocket、路由与中间件
│  │  ├─ middleware/      # 限流、安全头、requestId 与错误处理
│  │  ├─ payloads/        # API / WebSocket 共享响应组装
│  │  └─ routes/          # 按业务域拆分的 API 路由
│  ├─ security/           # 登录会话与 API Key 鉴权
│  ├─ services/           # MQTT 连接、消息解析与业务状态
│  │  └─ mqtt/            # 消息处理、控制发布、在线扫描、保留策略、试连与 Webhook
│  ├─ settings/           # 配置读写、校验与脱敏
│  └─ storage/            # MongoDB 数据访问层
├─ public/                # 可视化管理页面
│  └─ js/                 # 前端 API 客户端、反馈交互、布局控制、表单增强、安全准入、系统运维、开发者指南、设备/历史视图与配置向导
├─ scripts/               # 本地质量检查与 SQLite 迁移脚本
├─ test/                  # Node.js 内置测试套件
└─ Dockerfile
```

## 本地运行

### 环境要求

- Node.js 18 及以上
- Docker Desktop 或 Docker Engine

### 安装依赖

```bash
npm install
```

### 质量检查

```bash
npm run check
npm test
npm run audit:prod
```

### 启动服务

```bash
IOT_MONGODB_URI=mongodb://iot_app:password@127.0.0.1:27017/iot_app?authSource=iot_app
npm start
```

启动后访问：

- 管理页面：`http://localhost:22102`
- 状态接口：`http://localhost:22102/api/status`

## Docker 部署

IoT 服务依赖 MongoDB 副本集和独立账号，不再提供容易遗漏数据库参数的单容器部署入口。请在仓库根目录使用统一 Compose：

```bash
cp .env.example .env
docker compose --env-file .env -f infra/docker/compose.yml up -d --build iot-service
```

停止服务：

```bash
docker compose --env-file .env -f infra/docker/compose.yml stop iot-service
```

## 配置说明

运行配置保存在 `iot_app.settings` 集合。通过浏览器管理页面修改后会立即写入 MongoDB；不要绕过服务直接编辑集合中的敏感字段。

控制台中所有敏感字段都会脱敏显示：

- 已保存的 MQTT 密码、登录密码、Session Secret 不会再回传到浏览器
- 表单留空表示“保持当前值不变”
- 需要移除敏感字段时，使用对应的“清空已保存”选项

### 配置项示例

```json
{
  "mqtt": {
    "url": "mqtt://localhost:1883",
    "username": "",
    "password": "",
    "clientId": "node_api_client",
    "clean": true,
    "qos": 0,
    "reconnectPeriod": 1000,
    "connectTimeout": 30000,
    "topics": {
      "temp": "home/esp8266/sensor/temp",
      "hum": "home/esp8266/sensor/hum",
      "relayStatus": "home/esp8266/relay/status",
      "relay2Status": "home/relay/status",
      "relayOnline": "home/relay/online"
    }
  },
  "api": {
    "port": 22102,
    "deviceOnlineThreshold": 60000
  },
  "auth": {
    "enabled": false,
    "username": "admin",
    "password": "",
    "sessionSecret": "auto-generated-random-secret",
    "sessionTtlHours": 24
  },
  "dashboard": {
    "refreshInterval": 5000
  }
}
```

## 管理页面

浏览器管理页默认挂在根路径 `/`，主要包含：

- MQTT 连接状态
- 设备在线状态
- 最新温湿度和继电器状态
- Broker 与 Topic 配置修改
- 手动重连 MQTT
- 恢复默认配置

如果你修改了 `api.port`，配置会保存成功，但端口需要在服务重启后生效。

## 登录鉴权

默认未启用登录鉴权，适合内网调试。准备部署到公网时，建议启用：

```bash
AUTH_ENABLED=true
AUTH_USERNAME=admin
AUTH_PASSWORD=your-strong-password
# 可留空让服务首次启动时自动生成；多实例部署时请显式设置强随机值
AUTH_SESSION_SECRET=
```

使用 Docker Compose 时，建议通过 `.env` 设置 `MQTT_*` 和 `AUTH_*` 环境变量。启用后，管理页面会出现登录弹层，配置、重连和部署信息接口都需要登录后访问。

当登录鉴权启用时：

- `/api/info`、`/api/status`、`/api/devices`、`/api/latest`、`/api/devices/:deviceId/history`
  都需要登录会话或带作用域的 API Key
- `WebSocket /ws` 也会校验登录会话，未登录时不会再返回实时快照
- `/api/config`、`/api/keys`、`/api/reconnect`、`/api/meta` 仅允许控制台会话访问

`AUTH_*` 和 `MQTT_*` 环境变量用于首次生成 MongoDB 中的运行配置。已有配置请通过管理页面修改。

如果服务部署在 Nginx、Cloudflare、Traefik、宝塔、1Panel 等反向代理后面，请设置 `TRUST_PROXY=1`，并确保代理传递真实的域名与协议。直连公网时保持默认 `TRUST_PROXY=0`。

生产域名建议同时显式设置公网源，避免面板或反代遗漏协议头导致登录被同源保护拦截：

```env
PUBLIC_ORIGIN=https://mqttapi.pxyb.cn
```

Nginx 示例：

```nginx
location / {
  proxy_pass http://127.0.0.1:22102;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

如果未设置这些反代头，浏览器从 `https://你的域名` 发起登录，但后端以为自己是 `http://内网地址:22102`，同源保护会把登录请求判定为跨站请求并返回 `403 FORBIDDEN`。设置 `PUBLIC_ORIGIN` 后，服务会优先按这个公网地址校验浏览器请求来源。

服务会为每个 HTTP 请求返回 `X-Request-Id`，错误响应也会包含 `requestId` 与稳定的 `code` 字段，便于排查问题。默认会输出 JSON 格式访问日志；如需关闭，可设置 `LOG_HTTP_REQUESTS=0`。

错误响应示例：

```json
{
  "error": "请先登录。",
  "code": "UNAUTHORIZED",
  "requestId": "2c4f2c6c-3ef8-4f2e-a3f7-3d4d1b8b4dd0"
}
```

## API 概览

### `GET /api/latest`

返回最新采集数据。

### `GET /api/status`

返回 MQTT 连接、订阅、在线状态等。

### `GET /api/info`

一次性返回最新数据和状态信息。

### `GET /api/config`

返回当前运行配置的脱敏视图。

### `GET /api/auth/status`

返回当前鉴权状态。

### `POST /api/auth/login`

登录管理页面。

### `POST /api/auth/logout`

退出登录。

### `PUT /api/config`

保存新的配置内容。

### `POST /api/config/reset`

恢复默认配置并重连 MQTT。

### `POST /api/reconnect`

手动触发 MQTT 重连。

### `GET /api/meta`

返回配置文件路径、数据目录、页面刷新间隔等信息。

### `GET /api/health`

用于健康检查。

### `WebSocket /ws`

浏览器管理台使用的实时通道。连接成功后会先推送一次完整快照，后续 MQTT 消息或连接状态变化会继续推送。启用登录鉴权后，该通道需要有效会话。

## API Key

API Key 适合给小程序、大屏和后端服务使用，支持以下作用域：

- `devices:read`：读取设备快照、状态和实时信息
- `history:read`：读取设备历史采样数据
- `relays:write`：下发继电器控制指令

安全模型有几点变化：

- 完整 Token 只在创建时返回一次，后续列表中仅显示预览值
- 数据库中保存的是 Token 哈希，而不是明文
- API Key 不能访问配置管理、密钥管理和重连等控制台级接口

## 部署建议

- 服务器开放 `22102` 端口，或通过 Nginx 反向代理到该服务
- 生产环境建议启用登录鉴权，并放在 HTTPS 或反向代理后面
- 必须使用独立的 `iot_app` MongoDB 账号，并将 MongoDB 数据卷纳入统一备份
- 如果 MQTT Broker 在公网，建议使用带认证或 TLS 的连接地址

## 说明

目前项目仍然是单服务架构，适合轻量部署。如果你后面想继续升级，我们可以再往下加：

- WebSocket 实时推送
- 历史数据存储
- 继电器控制按钮
- 多设备支持
