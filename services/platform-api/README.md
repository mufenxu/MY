# MY Platform API

`platform-api` 在一个 Node.js 进程中组合以下模块：

- 综合小程序后端与原 React 管理后台
- 考试小程序后端与原 Vue 管理后台
- 企业微信通知 API
- MY 统一管理门户

两个小程序仍使用独立的 Mongoose 包、MongoDB 数据库和 JWT 密钥。HGU 与 MQTT 继续作为独立容器，通过内部网络和统一路径代理访问。

## 路由

原域名可继续反向代理到同一个 `22100` 端口，平台按 `Host` 分发：

| Host | 模块 |
| --- | --- |
| `admin.pxyb.cn` 或其他默认 Host | 统一管理门户 |
| `xcx.pxyb.cn` | 综合小程序 API 与原管理后台 |
| `haxx.pxyb.cn` | 考试 API 与原管理后台 |
| `tongzhiapi.pxyb.cn` | 企业微信通知 API |

统一 API 路径同时可用：

- `/core/*` -> 综合小程序 `/api/*`
- `/exam/*` -> 考试小程序 `/api/*`
- `/campus/*` -> HGU `/api/*`
- `/iot/*` -> MQTT `/api/*`
- `/iot/ws` -> MQTT WebSocket `/ws`
- `/notify-service/*` -> 企业微信通知原路径

## 设计约束

- 不允许两个小程序共用 JWT 密钥，分别使用 `CORE_JWT_SECRET` 与 `EXAM_JWT_SECRET`。
- 不合并业务数据库，只共用 MongoDB 服务器。
- 任意一个核心模块初始化失败时，容器启动失败，避免提供部分可用但状态不一致的 API。
- 原后端的 `npm start` 入口继续有效，便于独立调试和回滚。
