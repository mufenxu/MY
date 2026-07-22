# MY 管理中心

这是 `MY` 工作区的统一管理门户。它聚合服务状态和现有后台入口，并在独立的 `platform_app` 数据库中保存运维事件、审计、配置版本与任务索引，不直接读写各业务数据库。

## 本地开发

```powershell
npm install
npm run dev
```

- Web：`http://127.0.0.1:5180`
- API：`http://127.0.0.1:8788`

开发环境默认免登录。可以在 `.env` 中设置 `PLATFORM_AUTH_DISABLED=false` 验证登录流程。

## 生产配置

1. 复制 `.env.example` 为 `.env`。
2. 生成密码哈希：

   ```powershell
   npm run password -- "一个至少十五位的管理员密码"
   ```

3. 将结果写入 `PLATFORM_ADMIN_PASSWORD_HASH`。
4. 生成独立的 `PLATFORM_SESSION_SECRET` 和 32 字节 Base64URL `PLATFORM_AUTH_ENCRYPTION_KEY`，并配置 MongoDB、内部签名密钥和 HTTPS `PLATFORM_PUBLIC_ORIGIN`。
5. 保持 `PLATFORM_REQUIRE_MFA=true`。首次密码登录会要求扫码绑定 TOTP，并只显示一次恢复码。
6. 构建并启动：

   ```powershell
   npm run build
   npm start
   ```

生产模式不会接受免登录配置。密码哈希和会话密钥不得提交到 Git。

## 服务清单

服务定义来自工作区根目录的 `platform.config.json`，这里只允许保存公开 URL、健康检查路径和项目元数据。

管理门户服务端主动检查健康端点，浏览器不会直接跨域访问各业务服务。状态结果仅包含状态码、耗时和检查时间，不会转发健康接口的响应正文。

## API

- `GET /api/health`：门户自身健康检查
- `GET /api/auth/status`：管理员会话状态
- `POST /api/auth/login`：管理员登录
- `POST /api/auth/logout`：退出登录
- `GET /api/services`：服务目录
- `GET /api/services/status`：聚合健康状态
- `GET /api/services/status?refresh=1`：跳过 15 秒缓存并立即检查
- `GET /api/operations/overview`：状态、历史趋势、未解决事件与最近活动
- `GET /api/operations/history`：按服务和时间范围读取真实采样
- `GET/POST /api/incidents`：事件查询与处置
- `GET /api/audit`：统一审计日志
- `GET /api/public/status`：无需登录的真实健康状态与公开事件摘要
- `GET /api/tasks`：聚合备份、发布、通知与事件任务
- `GET /api/configuration`：当前运行配置、待审批变更与不可变版本
- `POST /api/configuration/changes`：创建配置变更提案
- `POST /api/configuration/changes/:id/approve|reject`：审批或拒绝提案
- `POST /api/configuration/versions/:version/rollback`：创建回滚提案，不直接覆盖配置
- `POST /api/diagnostics/traces`：用同一请求 ID 探测公网网关和服务直连阶段
- `POST /api/diagnostics/run`：运行只读系统诊断
- `GET /api/security/sessions`：有效会话与安全状态
- `GET/POST/PATCH /api/security/accounts`：独立管理员账号与最小权限角色
- `POST/DELETE /api/security/totp/*`：TOTP、恢复码与绑定管理
- `GET/POST/DELETE /api/security/passkeys/*`：Passkey 注册与撤销
- `POST /api/security/password`：修改当前管理员密码并撤销全部会话
- `GET /api/releases`：镜像版本与 GitHub Actions 状态
- `GET /api/backups/quality`：RPO、异地同步与恢复演练状态

## 安全边界

- MQTT、企业微信和其他服务凭据只能保存在管理门户服务端或目标服务部署环境。
- 浏览器不能提交任意探测 URL，避免把门户变成 SSRF 入口。
- `/apps/*` 由平台网关统一校验会话并签发短时内部身份，各业务服务仍保留独立权限和数据边界。
- 建议在生产环境前再增加 Cloudflare Access、VPN 或入口 IP 白名单作为第二层保护。

## 统一运维能力

管理中心在 `platform_app` 中维护独立的运维数据，不跨库读取业务数据：

- 服务端按 `PLATFORM_MONITOR_INTERVAL_MS` 持续采集健康状态，不依赖浏览器是否打开；
- 原始状态按 `PLATFORM_STATUS_RETENTION_DAYS` 保留，并生成小时汇总供 7 天和 30 天趋势使用；
- 连续失败达到阈值后生成事件，连续恢复后自动关闭；维护窗口内继续采样但不产生新事件；
- 事件产生和恢复可以通过内部通知服务推送企业微信；
- 登录、事件处置、备份、恢复、发布、会话撤销和设置变更都写入审计日志；
- 灾备质量页检查 RPO、恢复演练、异地同步状态和每日自动备份计划；
- 发布中心读取 GitHub Actions 和镜像版本，写操作默认关闭；
- 发布构建、不可变镜像产物和部署结果持久化到 MongoDB，支持实际运行版本与配置漂移对比；
- 任务中心只聚合各服务持久化任务和配置审批，不把浏览器缓存当作执行状态；
- 生产默认启用双人配置审批，回滚也必须形成新提案和新版本；
- 公开状态页只显示实际健康采样和安全化事件摘要，不提供人工“全绿”覆盖；
- 安全中心支持 `viewer`、`operator`、`super_admin` 三种独立账号角色、强制 TOTP、一次性恢复码、Passkey 和会话远程下线。

### 角色权限

| Role | 管理中心 | 业务后台 |
| --- | --- | --- |
| `viewer` | 只读 | 仅允许 GET/HEAD/OPTIONS，禁止 IoT WebSocket |
| `operator` | 可处置事件、运行诊断、创建配置提案和上传备份 | 可执行日常管理操作 |
| `super_admin` | 可审批配置、删除/恢复备份、发布和撤销会话 | 完整管理权限 |

生产环境默认强制 MFA。恢复、构建、部署、回滚及安全设置变更会再次验证管理员密码和动态验证码；密码修改后会撤销该账号的全部会话。

### 控制台导航

控制台使用六个一级入口组织功能：运行总览、服务目录、可观测性、执行中心、平台能力和安全中心。二级页面继续使用原有 `?view=` 标识，确保历史收藏和跨模块跳转兼容；导航分组不改变各服务的数据归属、角色权限或高危操作验证。

### 发布安全

`PLATFORM_RELEASE_ACTIONS_ENABLED` 默认是 `false`。重新构建需要 `PLATFORM_GITHUB_TOKEN`、专用回调令牌和允许的 ACR 仓库；部署和回滚还需要只在后端网络开放的 `deployment-runner` Sidecar 与独立随机 Bearer Token。平台容器不会挂载 Docker Socket，也不会直接执行宿主机命令。Sidecar 负责 Digest 白名单、串行锁、Compose 预检、健康检查和失败自动回滚，并可通过 `release:sidecar:configure`、`release:sidecar:enable`、`release:sidecar:disable` 幂等管理。完整启用顺序见 [`docs/release-center.md`](../../docs/release-center.md)。
