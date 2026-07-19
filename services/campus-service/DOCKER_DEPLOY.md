# Docker Compose 远程服务器部署指南

本项目已支持使用 Docker Compose 进行一键部署与管理。本指南将介绍如何在远程服务器上配置和运行该项目。

## 1. 前提条件

在部署前，请确保您的服务器已安装以下软件：
- **Docker** (推荐 20.10 及以上版本)
- **Docker Compose** (推荐 v2 及以上版本，通常已随 Docker Desktop/Docker 引擎一同安装)

您可以通过以下命令检查安装情况：
```bash
docker --version
docker compose version
```

## 2. 准备配置文件

1. 将项目代码克隆或上传到您的远程服务器。
2. 进入统一平台仓库根目录：
   ```bash
   cd unified-platform
   ```
3. 从模板复制并创建您的配置文件 `.env`：
   ```bash
   cp .env.example .env
   ```
4. 编辑并检查 `.env` 文件：
   ```bash
   nano .env
   ```

   **关键配置项说明：**
   * **`HGU_ADMIN_PASSWORD`**：初始管理员密码，至少 12 位，建议直接使用生成值。
   * **`HGU_APP_SESSION_SECRET`**：会话签名密钥，至少 32 位随机值。
   * **`HGU_APP_SESSION_TTL_HOURS`**：系统登录状态有效时间，单位为小时；默认 `720`，即 30 天。Docker Compose 会把该值传入容器。
   * **`HGU_DATA_ENCRYPTION_KEY`**：32 字节随机密钥的 Base64URL 编码，用于加密学校 Cookie/Token，强烈建议独立配置。若升级时漏配，程序会从 `HGU_APP_SESSION_SECRET` 派生隔离密钥以保证可启动。以后补上独立数据密钥时，程序会自动用派生密钥读取旧数据并轮换到新密钥；完成这次启动前不要先更换会话密钥。
   * **`HGU_APP_COOKIE_SECURE`**:
     * 如果您使用 Nginx、Caddy 或 Traefik 等反向代理并启用了 **HTTPS**（强烈推荐），请保持为 `true`。
     * 如果仅在局域网内或通过纯 **HTTP** 访问调试，可以临时修改为 `false`，否则可能无法正常登录。
   * **`PORT`**: 宿主机上映射的端口，默认为 `22101`。
   * **`HGU_TRUST_PROXY`**：只有在服务仅能通过可信 Nginx/Caddy 访问时设为 `true`，否则保持 `false`。

   校园服务不再挂载本地写入目录；请在根目录 `.env` 配置独立的 `MONGO_CAMPUS_USERNAME` 和 `MONGO_CAMPUS_PASSWORD`。

## 3. 一键部署与管理

### 启动服务

在统一平台仓库根目录执行以下命令，Docker Compose 将初始化 MongoDB 并启动校园服务：
```bash
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build campus-service
```

### 查看运行状态

检查容器是否正在运行：
```bash
docker compose --env-file .env -f infra/docker/compose.yml ps
```

### 查看实时日志

查看服务输出的控制台日志以确认有无异常：
```bash
docker compose --env-file .env -f infra/docker/compose.yml logs -f campus-service
```

### 停止服务

若需要暂停服务，可以使用以下命令：
```bash
docker compose --env-file .env -f infra/docker/compose.yml stop campus-service
```

### 更新服务器镜像

更新已发布镜像：
```bash
docker compose --env-file .env -f infra/docker/compose.yml pull campus-service
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate campus-service
```

### 源码机器重新构建

如果服务器或本机保留完整源码，可以使用统一 Compose 直接构建：
```bash
docker compose --env-file .env -f infra/docker/compose.yml up -d --build --force-recreate campus-service
```

## 4. 数据持久化与备份

系统账号、学校登录态和教务课表缓存统一存储于 `campus_app` MongoDB 数据库，校园容器不再挂载本地数据目录。数据库使用独立的 `campus_app` 账号，不能访问其他业务数据库。

统一备份会包含 `campus_app`；同时还必须在独立的安全位置备份 `HGU_DATA_ENCRYPTION_KEY`。缺少原密钥将无法恢复已加密的学校会话。完整的备份、恢复和旧 SQLite 数据迁移步骤见根目录 `docs/operations.md`。

## 5. 安全性与反向代理（推荐）

为了确保通信安全，强烈建议使用 Nginx、Caddy 等反向代理，为本服务配置域名及 SSL/TLS 证书。

### Nginx 反向代理配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:22101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        # The application trusts one local reverse proxy. Do not preserve a client-supplied X-Forwarded-For value.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
配置完成后，请确保宿主机上的防火墙不要直接对公网暴露 `22101` 端口，只允许反向代理本地转发即可。
此时可以在 `.env` 中设置 `HGU_TRUST_PROXY=true` 和 `HGU_PUBLIC_ORIGIN=https://hgu.pxyb.cn`。Compose 默认将端口绑定到 `127.0.0.1`；如确需修改，可显式设置 `HGU_BIND_ADDRESS`，不建议设为公网地址。

### 微信客户端发布检查

微信/X5 WebView 对登录 Cookie 和静态资源缓存的行为与普通浏览器不同。发布涉及系统登录、Cookie、`public/app.js` 或 `public/browser-check.js` 的修改时：

1. 从当前源码部署时先运行 `docker build -t mufenxu/hgu:latest .`，再运行 `docker compose up -d --force-recreate`；当前 Compose 服务使用 `image` 而不是 `build`，单独添加 `--build` 不会重建镜像。使用镜像仓库部署时则运行 `docker compose pull && docker compose up -d --force-recreate`。
2. 确认 `public/index.html` 已更新上述脚本的 `?v=` 版本，否则微信可能继续使用一年 immutable 缓存中的旧脚本。
3. 保持公网 HTTPS、`HGU_APP_COOKIE_SECURE=true`、`HGU_PUBLIC_ORIGIN=https://hgu.pxyb.cn`，并按前述代理配置传递正确的协议头；在微信里同时测试手输 `hgu.pxyb.cn` 和打开 `https://hgu.pxyb.cn/`。
4. 确认 `HGU_APP_SESSION_TTL_HOURS=720`，然后使用真实微信客户端完成登录、关闭页面、重新打开和刷新测试。若重新打开后要求登录，检查微信专用持久化令牌逻辑；若登录后立刻返回登录页，先检查镜像版本和脚本版本，再检查 README 中的“微信内置浏览器登录兼容性（维护必读）”约束是否被破坏。

## 6. 构建本地镜像并推送到仓库 (`mufenxu/hgu`)

我们为您提供了两种构建镜像并推送到 Docker Hub 仓库的方式：

### 方式 A：使用本地一键脚本（Windows / Linux）

项目根目录下已为您准备好一键脚本，用于读取版本、打包并推送：
- **Windows 用户**：直接双击运行 [build-and-push.bat](file:///c:/Users/25912/Desktop/HGU/build-and-push.bat)；
- **Linux/macOS 用户**：在终端运行：
  ```bash
  chmod +x build-and-push.sh
  ./build-and-push.sh
  ```

该脚本将自动：
1. 检查 Docker 状态；
2. 读取 `package.json` 中的版本号作为镜像 Tag；
3. 构建 `mufenxu/hgu:<tag>` 镜像；
4. 引导您通过 `docker login` 完成认证，并将镜像推送到您指定的 Docker 仓库。

### 方式 B：GitHub Actions 自动构建与推送（推荐）

我们已在 [.github/workflows/docker-publish.yml](file:///c:/Users/25912/Desktop/HGU/.github/workflows/docker-publish.yml) 中配置了 CI/CD 工作流。

一旦您将项目托管至 GitHub，只需进行如下设置即可实现“一键自动推送”：
1. 在 GitHub 仓库设置中，依次进入 `Settings -> Secrets and variables -> Actions`；
2. 新建两个 Secret 密钥：
   - `DOCKER_USERNAME`：您的 Docker Hub 用户名（`mufenxu`）；
   - `DOCKER_PASSWORD`：您的 Docker Hub 访问令牌（Access Token，推荐在 Docker Hub 个人设置中生成）；
3. 之后当您推送代码到 `main`/`master` 分支，或推送版本 tag（形如 `v0.1.0`）时，GitHub 就会自动编译多平台架构镜像并推送至 `mufenxu/hgu` 仓库。
