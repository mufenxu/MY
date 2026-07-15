# admin-web

`admin-web` 是本项目的 React 管理后台前端，负责承载管理端页面、公开查询页以及后台登录流程。

## 技术栈

- React 19
- React Router 7
- Ant Design 6
- Axios
- Vite 7

## 页面能力

当前已接入的主要页面包括：
- `/login`：后台登录
- `/query`：网课进度公开查询页
- `/dashboard`：数据仪表盘
- `/iot-monitor`：IoT 监控
- `/ct8-monitor`：CT8 节点监控
- `/air-energy`：空气能监控
- `/users`：用户与权限
- `/notifications`：通知管理
- `/audit-logs`：审计日志
- `/scan-management`：扫码管理
- `/resources`：全局配置
- `/course-orders`：网课订单处理
- `/settings`：系统设置

路由入口见 [src/App.jsx](./src/App.jsx)。

## 本地开发

```bash
npm install
npm run dev
```

默认开发代理：
- `/api` -> `http://localhost:3045`

配置位置：
- Vite 代理：[vite.config.js](./vite.config.js)
- Axios 实例：[src/utils/api.js](./src/utils/api.js)

如果前后端分离部署，可以通过 `VITE_API_URL` 指向远程后端：

```bash
VITE_API_URL=https://your-domain.com/api npm run build
```

也可以在运行环境中自行注入对应变量。

## 构建

```bash
npm run build
npm run preview
```

构建产物输出到 `dist/`。

## 认证说明

- 访问管理后台时，前端会从 `localStorage` 读取 `token`
- 请求头自动附带 `Authorization: Bearer <token>`
- 当后端返回 `tokenExpired` 时，会自动尝试刷新 token
- 401 且刷新失败时会清理本地登录态并跳转 `/login`

相关实现见 [src/utils/api.js](./src/utils/api.js)。

## 目录说明

```text
src/
├── components/   # 布局与业务组件
├── hooks/        # 自定义 hooks
├── pages/        # 页面
├── utils/        # 请求封装、头像工具等
├── App.jsx       # 路由入口
└── main.jsx      # 应用入口
```

## 说明

这个目录之前保留的是 Vite 默认模板 README，已经不适合作为真实项目说明。
如果你继续扩展后台功能，建议优先维护这里的“页面、接口依赖、构建方式”三部分内容。
