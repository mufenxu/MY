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

## 安全边界

- MQTT、企业微信和其他服务凭据只能保存在管理门户服务端或目标服务部署环境。
- 浏览器不能提交任意探测 URL，避免把门户变成 SSRF 入口。
- 现阶段“进入后台”使用独立后台链接；统一登录将在业务管理 API 迁入门户后实现。
- 建议在生产环境前再增加 Cloudflare Access、VPN 或入口 IP 白名单作为第二层保护。
