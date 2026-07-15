# 小程序与管理后台一体化项目

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![React](https://img.shields.io/badge/react-19.x-blue.svg)
![Vite](https://img.shields.io/badge/vite-7.x-646cff.svg)
![WeChat](https://img.shields.io/badge/wechat-miniprogram-brightgreen.svg)

这是一个围绕“微信小程序 + React 管理后台 + Node.js 后端服务”构建的一体化业务项目。

项目当前已经落地的能力，不只是常规的小程序内容展示，还包含：
- 扫码登录开放平台
- 网课订单处理与公开进度查询页
- 涂鸦 IoT / 空气能设备监控
- CT8 / GitHub 调度面板
- 资源配置、通知、审计日志、用户权限与系统安全配置
- Cloudflare Turnstile 登录人机验证

## 项目结构

```text
miniprogram-1/
├── miniprogram/          # 微信小程序前端（原生 + TypeScript）
├── admin-web/            # 管理后台前端（React 19 + Vite 7 + Ant Design 6）
├── admin-server/         # 后端 API（Express 5 + Mongoose 9）
├── docs/                 # 对外接入文档与示例
├── typings/              # 类型声明
├── API_USAGE.md          # 企业微信通知 API 接入说明
├── RELEASE_NOTE.md       # 发布说明
└── README.md             # 项目总览
```

## 实际功能概览

### 1. 微信小程序
- 首页功能卡片动态显隐
- 登录、个人中心、自定义 TabBar
- 网课订单列表与进度查询
- CT8 管理
- 资源页、待办、BMI
- 智能控制与空气能页面
- 扫码确认登录页

小程序页面入口可参考 [app.json](./miniprogram/app.json) 和 `miniprogram/pages/`。

### 2. 管理后台
- 仪表盘
- IoT 监控
- CT8 节点面板
- 空气能监控
- 用户与权限
- 通知管理
- 审计日志
- 扫码管理
- 全局配置 / 资源配置
- 网课订单处理
- 系统设置
- 公开进度查询页：`/query`

路由入口可参考 [admin-web/src/App.jsx](./admin-web/src/App.jsx) 和 [admin-web/src/components/MainLayout.jsx](./admin-web/src/components/MainLayout.jsx)。

### 3. 后端服务
- JWT 登录、Refresh Token
- 扫码登录会话、审计与第三方应用管理
- 小程序业务接口
- 网课订单、分类、公开查询与同步
- GitHub / CT8 调度接口
- 涂鸦 IoT / 空气能控制与自动化调度
- 通知、新闻、待办、资源、系统设置、密钥缓存
- CORS 白名单、全局限流、日志与错误处理中间件

路由汇总可参考 [admin-server/routes/index.js](./admin-server/routes/index.js)。

## 技术栈

- 小程序：微信原生框架、TypeScript、WXSS
- 管理后台：React 19、React Router 7、Ant Design 6、Axios、Vite 7
- 后端：Node.js、Express 5、MongoDB、Mongoose 9、JWT、Winston、WS
- 安全与运维：Helmet、CORS 白名单、Rate Limit、Cloudflare Turnstile、PM2、Nginx

## 本地启动

### 1. 启动后端

```bash
cd admin-server
npm install
cp .env.example .env
npm start
```

首次初始化管理员账号：

```bash
node scripts/create_admin.js
```

默认账号信息请参考 [admin-server/scripts/create_admin.js](./admin-server/scripts/create_admin.js)，上线后请立即修改默认密码。

### 2. 启动管理后台

```bash
cd admin-web
npm install
npm run dev
```

开发环境默认通过 Vite 代理到 `http://localhost:3045`。
如果你的后端不是这个地址，可以通过 `VITE_API_URL` 覆盖，或修改 [admin-web/src/utils/api.js](./admin-web/src/utils/api.js)。

### 3. 打开微信小程序

1. 使用微信开发者工具打开 `miniprogram/`
2. 按实际环境调整 [miniprogram/utils/config.ts](./miniprogram/utils/config.ts) 中的接口地址
3. 编译运行

## 运行入口

- 管理后台：`/`
- 后台登录页：`/login`
- 公开进度查询页：`/query`
- 后端 API 前缀：`/api`

## 关键配置

后端环境变量示例见 [admin-server/.env.example](./admin-server/.env.example)。
当前代码里比较重要的配置包括：
- `MONGO_URI`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `WX_APP_ID`
- `WX_APP_SECRET`
- `GH_WEBHOOK_SECRET`
- `ORDER_SUBMIT_CONCURRENCY`

## 文档索引

- 部署文档：[admin-server/DEPLOY.md](./admin-server/DEPLOY.md)
- 扫码登录开放接入文档：[docs/接入文档.md](./docs/接入文档.md)
- 企业微信通知 API 文档：[API_USAGE.md](./API_USAGE.md)
- 发布说明：[RELEASE_NOTE.md](./RELEASE_NOTE.md)
- 后台子项目说明：[admin-web/README.md](./admin-web/README.md)

## 当前文档状态

目前仓库中的代码能力已经明显超过早期 README 的覆盖范围，尤其是以下部分：
- 扫码登录开放平台
- 公共查询页 `/query`
- CT8 / GitHub 调度能力
- Turnstile 与安全配置
- 空气能监控与自动化

因此，项目说明文档需要持续按模块维护，而不适合继续只保留一个“概述型 README”。

## 注意事项

- `admin-web/README.md` 需要使用项目自己的说明，不能继续保留 Vite 默认模板。
- 本仓库当前没有统一的顶层 `LICENSE` 文件；如果需要对外开源，请先明确许可证并统一说明。
- 项目暂未看到成体系的自动化测试脚本，当前更依赖人工验证与构建检查。
