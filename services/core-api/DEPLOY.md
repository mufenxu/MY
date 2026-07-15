# 小程序管理后台部署文档（VPS / Linux）

本文档说明如何将本项目的前端（`admin-web`）和后端（`admin-server`）部署到 Linux 服务器，并让以下入口可用：
- 管理后台：`/`
- 后台登录：`/login`
- 公开查询页：`/query`
- 后端 API：`/api/*`

推荐部署方式：
- 同域部署前端和后端
- Nginx 提供静态资源并反代 `/api`
- PM2 守护 Node 服务

## 1. 环境准备

建议环境：
- Node.js 18 / 20 LTS
- MongoDB 5.0+
- Nginx
- PM2
- Git（可选）

Ubuntu 示例：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2
```

MongoDB 可自行安装，也可以使用云数据库。

## 2. 部署后端（admin-server）

### 2.1 上传代码

将 `admin-server` 上传到服务器，例如：

```bash
/var/www/admin-server
```

不要上传本地 `node_modules/`。

### 2.2 安装依赖

```bash
cd /var/www/admin-server
npm install
```

### 2.3 配置环境变量

```bash
cp .env.example .env
nano .env
```

推荐至少确认这些配置：

```env
PORT=3045
NODE_ENV=production
MONGO_URI=mongodb://127.0.0.1:27017/miniprogram
MONGODB_URI=mongodb://127.0.0.1:27017/miniprogram
JWT_SECRET=replace_with_a_strong_random_string
ENCRYPTION_KEY=replace_with_a_32_char_random_string
WX_APP_ID=your_wechat_app_id
WX_APP_SECRET=your_wechat_app_secret
GH_WEBHOOK_SECRET=
ORDER_SUBMIT_CONCURRENCY=3
```

### 2.4 初始化管理员账号

首次部署时执行：

```bash
node scripts/create_admin.js
```

脚本会创建默认管理员账号：
- 用户 ID：`admin`
- 默认密码：`admin_password`

上线后请立即修改默认密码。

### 2.5 启动服务

```bash
pm2 start server.js --name admin-server
pm2 save
pm2 startup
```

检查运行状态：

```bash
pm2 list
pm2 logs admin-server
```

## 3. 部署前端（admin-web）

### 3.1 本地或服务器构建

```bash
cd admin-web
npm install
npm run build
```

构建结果在 `dist/` 目录。

### 3.2 关于 API 地址

`admin-web` 默认通过 `/api` 访问后端，因此：
- 如果你走同域部署，通常不需要额外配置
- 如果你要把前端部署到独立域名，可以在构建时指定 `VITE_API_URL`

例如：

```bash
VITE_API_URL=https://your-domain.com/api npm run build
```

### 3.3 上传静态文件

将 `dist/` 上传到服务器，例如：

```bash
/var/www/admin-web
```

## 4. Nginx 配置

创建配置文件，例如 `/etc/nginx/sites-available/miniprogram-admin.conf`：

```nginx
server {
    listen 80;
    server_name your_domain.com;

    root /var/www/admin-web;
    index index.html;

    location = / {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires 0 always;
        try_files /index.html =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires 0 always;
    }

    location = /version.json {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires 0 always;
        try_files $uri =404;
    }

    location ^~ /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires 0 always;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3045;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/miniprogram-admin.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 5. HTTPS（推荐）

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com
```

## 5.1 CDN / ESA 缓存规则

如果域名前面接了阿里云 ESA、CDN、Cloudflare 等边缘缓存，必须同时配置边缘缓存规则。只配置 Nginx 的
`Cache-Control` 不一定够，边缘节点可能仍然缓存 HTML，用户强制刷新也只会刷新浏览器缓存，不能清空 CDN
节点缓存。

推荐规则：

- `/api/*`：不缓存
- `/version.json*`：不缓存
- `/`、`/index.html`、`/*.html`：不缓存
- `/settings*`、`/login*`、`/dashboard*`、`/query*` 等 SPA 路由：不缓存，或统一对非 `/assets/*` 路径不缓存
- `/assets/*`：可以长期缓存，因为 Vite 构建文件名带 hash

每次发布前端后，至少刷新 / 预热这些路径：

```text
/
/index.html
/settings
/login
/version.json
```

如果看到响应头里有 `X-Site-Cache-Status: HIT`、`X-Cache: HIT`、`Age` 持续增长，说明请求仍然命中了 CDN
缓存；这时即使浏览器强制刷新，也可能继续拿到旧入口文件。

## 6. Cloudflare Turnstile

项目已经集成 Turnstile 登录人机验证。

部署完成后：
1. 登录管理后台
2. 进入“系统设置” -> “安全设置”
3. 配置 Site Key / Secret Key
4. 开启登录验证

如果配置错误导致无法登录，可以直接修改数据库中 `appconfigs` 集合里 `key = "turnstile_config"` 对应的 `value.enabled = false`。

## 7. 验证部署结果

建议至少验证以下页面：
- `https://your_domain.com/login`
- `https://your_domain.com/query`
- `https://your_domain.com/api/health`（如果你有自定义探活接口）
- 管理后台登录后主要菜单是否正常加载

也建议确认：
- 小程序可正常请求后端
- 扫码登录二维码可创建
- 订单公开查询页可正常查询

## 8. 常用维护命令

```bash
pm2 restart admin-server
pm2 logs admin-server
sudo systemctl restart nginx
sudo nginx -t
```

前端更新发布的一般流程：

```bash
cd admin-web
npm run build
# 上传 dist/ 覆盖 /var/www/admin-web
```

## 9. 已知部署注意点

- 该项目存在公开页面 `/query`，部署后要确认未登录用户可正常访问该路由
- 如果前端更新后页面不生效，优先检查 `index.html` 是否被缓存
- 如果使用独立前后端域名，除了 `VITE_API_URL`，还要同步确认后端 CORS 白名单
- 扫码登录、通知、GitHub/CT8 等能力可能依赖线上配置或第三方凭据，部署后需逐项补齐
