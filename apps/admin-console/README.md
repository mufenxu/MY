# MY 管理中心

这是 `MY` 工作区的统一管理门户。第一阶段只聚合服务状态和现有后台入口，不直接读写各业务数据库。

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
   npm run password -- "一个至少十位的管理员密码"
   ```

3. 将结果写入 `PLATFORM_ADMIN_PASSWORD_HASH`。
4. 生成至少 32 字符的随机 `PLATFORM_SESSION_SECRET`。
5. 构建并启动：

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
- `GET/PUT /api/operations/settings`：非敏感运行设置与维护窗口
- `POST /api/diagnostics/run`：运行只读系统诊断
- `GET /api/security/sessions`：有效会话与安全状态
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
- 安全中心支持 `viewer`、`operator`、`super_admin` 三种角色、可选 TOTP 和会话远程下线。

### 角色权限

| Role | 管理中心 | 业务后台 |
| --- | --- | --- |
| `viewer` | 只读 | 仅允许 GET/HEAD/OPTIONS，禁止 IoT WebSocket |
| `operator` | 可处置事件、运行诊断、创建和上传备份 | 可执行日常管理操作 |
| `super_admin` | 可删除/恢复备份、修改设置、发布和撤销会话 | 完整管理权限 |

恢复、构建、部署和回滚会再次验证管理员密码；配置 `PLATFORM_ADMIN_TOTP_SECRET` 后还需要六位动态验证码。

### 发布安全

`PLATFORM_RELEASE_ACTIONS_ENABLED` 默认是 `false`。重新构建需要 `PLATFORM_GITHUB_TOKEN`、专用回调令牌和允许的 ACR 仓库；部署和回滚还需要只在后端网络开放的 `deployment-runner` Sidecar 与独立随机 Bearer Token。平台容器不会挂载 Docker Socket，也不会直接执行宿主机命令。Sidecar 负责 Digest 白名单、串行锁、Compose 预检、健康检查和失败自动回滚，并可通过 `release:sidecar:configure`、`release:sidecar:enable`、`release:sidecar:disable` 幂等管理。完整启用顺序见 [`docs/release-center.md`](../../docs/release-center.md)。
