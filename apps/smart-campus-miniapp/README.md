# 智慧校园微信小程序

![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)
![WeChat](https://img.shields.io/badge/wechat-miniprogram-brightgreen.svg)

本目录**只包含微信小程序前端**（微信原生框架 + TypeScript）。管理后台与后端 API 是工作区中的独立子项目，不在本目录：

| 能力 | 所在位置 |
| --- | --- |
| 综合业务管理后台前端 | [`apps/core-admin`](../../apps/core-admin/) |
| 后端 API（Express 5 + Mongoose 9 + Winston） | [`services/core-api`](../../services/core-api/) |
| 校园连接器服务 | [`services/campus-service`](../../services/campus-service/) |
| 企业微信通知服务 | [`services/notification-service`](../../services/notification-service/) |
| 统一网关（唯一对外入口） | [`services/platform-api`](../../services/platform-api/) |

工程约定的权威来源是 [`docs/engineering-standards.md`](../../docs/engineering-standards.md)。

## 项目结构

```text
miniprogram/            # 微信小程序前端
|-- pages/              # 页面
|-- components/         # 组件
|-- utils/              # 请求封装、配置、认证与路由常量
|-- test/               # node --test 单测
`-- scripts/            # 结构与路由不变量检查
typings/                # 类型声明
project.config.json     # 微信开发者工具配置
tsconfig.json           # TypeScript 配置
RELEASE_NOTE.md         # 发布说明
```

## 小程序已落地的能力

- 首页功能卡片按可见性动态显隐
- 登录（含 JWT 预校验）、个人中心、自定义 TabBar
- 网课订单列表与公开进度查询
- CT8 管理（列表与详情）
- 资源页、待办（含离线 outbox）、BMI
- 智能控制与空气能（热泵）页面

## 本地开发

### 打开小程序

1. 用微信开发者工具打开 `miniprogram/`
2. 按实际环境调整 [`miniprogram/utils/config.ts`](./miniprogram/utils/config.ts) 中的接口地址；`develop`/`trial` 下也可通过 `wx.setStorageSync('dev_api_base_url', <地址>)` 临时覆盖
3. 编译运行

### 质量门禁

```bash
cd miniprogram
npm install
npm run check     # typecheck + node --test + 结构/路由不变量检查
```

改动小程序源码后必须让 `npm run check` 通过；它包含的结构不变量检查（登录分包惰性加载、登录 logo 体积预算、待办 outbox 与存储命名空间等）是真实约束，不是风格检查。

## 关键配置

接口基地址在 [`miniprogram/utils/config.ts`](./miniprogram/utils/config.ts)。路由必须复用该文件所属目录的 `ROUTES` 常量（[`miniprogram/utils/constants.ts`](./miniprogram/utils/constants.ts)），**新增页面必须登记**，不要硬编码路径字符串。

后端所需的环境变量见对应服务的 `.env.example`：`services/core-api/.env.example`、`services/campus-service/.env.example`、`services/notification-service/.env.example`。

## 文档索引

- 工程规范总纲：[`docs/engineering-standards.md`](../../docs/engineering-standards.md)
- 架构与功能归属：[`docs/architecture.md`](../../docs/architecture.md)
- 部署与故障处置：[`docs/operations.md`](../../docs/operations.md)
- 后端部署说明：[`services/core-api/DEPLOY.md`](../../services/core-api/DEPLOY.md)
- 企业微信通知 API 接入：[`services/notification-service/API_USAGE.md`](../../services/notification-service/API_USAGE.md)
- 发布说明：[RELEASE_NOTE.md](./RELEASE_NOTE.md)

## 注意事项

- `project.private.config.json` 属于本地个人配置，**不得提交**（已由根 `.gitignore` 排除）。
- 本仓库当前没有统一的顶层 `LICENSE` 文件；如需对外开源，请先明确许可证。
- 已知待清理：`utils/constants.ts` 的 `ROUTES` 尚缺 `SCAN` 与热泵设置项，导致约 9 处硬编码路径；改动相关页面时优先补齐常量而非继续硬编码。
