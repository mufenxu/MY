# 外部项目统一认证设计

## 目标

在不合并部署、网络和业务数据库的前提下，让不同 VPS 上的自有项目接入 MY 中央身份。用户登录一次 MY 后，可以从统一服务控制台或 Android App 免密进入外部项目，并在统一控制台查看项目状态和接入信息。

## 范围

第一阶段交付以下能力：

- 外部应用动态注册、修改、停用和删除。
- OAuth 2.1 Authorization Code + PKCE 登录流程。
- OpenID Connect discovery、JWKS、ID Token 和 UserInfo。
- 精确回调地址校验、角色门槛、短期一次性授权码、客户端密钥哈希保存和审计。
- 控制台外部应用页面、健康状态和免密打开入口。
- Android 外部应用列表和现有 WebView 容器内免密打开。
- 外部 Node/Express 项目接入参考和通用协议文档。

不在第一阶段加入远程 SSH、任意命令、部署、重启、备份或 VPS root 凭据保存。后续控制能力必须通过独立的最小权限 Connector 实现。

## 架构

`platform-api` 继续作为中央身份边界。外部身份能力落在 `admin-console` 后端模块中，并通过 `platform-api` 现有组合运行方式对外提供。每个外部项目是一个独立 OIDC 客户端，拥有唯一 `client_id` 和只显示一次的 `client_secret`。

外部项目完成回调后创建自己的 HttpOnly 会话。MY 不向外部域名复制中央 Cookie，外部项目也不保存 MY 用户密码或长期中央会话。

## 登录流程

### 控制台

1. 已登录用户点击外部应用。
2. 控制台请求 `POST /api/external-apps/:id/launch`。
3. 服务端校验应用状态、账号状态和角色门槛，生成带 PKCE 参数的授权请求。
4. 浏览器进入 `/oauth/authorize`，中央会话通过后签发 60 秒一次性授权码。
5. 外部项目回调使用后端凭据和 `code_verifier` 调用 `/oauth/token`。
6. 外部项目验证 ID Token 并创建自己的会话。

### Android

1. Android 使用已有中央 App 会话请求 `POST /api/external-apps/:id/launch`。
2. 服务端生成现有 Android Web Login Ticket，目标改为受控的 `/oauth/authorize` 路径。
3. WebView 消费 Ticket 后获得中央浏览器会话，并继续 OAuth 授权流程。
4. 外部项目建立自己的 Cookie 后在 WebView 中直接展示。

## 数据模型

外部应用记录包含：

- `id`、`name`、`description`
- `clientId`、`clientSecretHash`、`clientSecretHint`
- `redirectUris`、`launchUrl`、`healthUrl`
- `requiredRole`：`viewer`、`operator` 或 `super_admin`
- `openMode`：`webview` 或 `browser`
- `enabled`
- `createdAt`、`createdBy`、`updatedAt`、`updatedBy`

授权码记录包含客户端、用户、角色、回调地址、scope、nonce、PKCE challenge、中央会话 nonce、创建时间和过期时间。数据库仅保存授权码 SHA-256 哈希，并使用 Mongo TTL 自动清理。

## OIDC 端点

- `GET /.well-known/openid-configuration`
- `GET /oauth/jwks.json`
- `GET /oauth/authorize`
- `POST /oauth/token`
- `GET /oauth/userinfo`

签名使用独立 Ed25519 密钥，不复用内部服务票据私钥。Issuer 固定为 `PLATFORM_PUBLIC_ORIGIN`，ID Token 的 audience 固定为目标 `client_id`。

## 安全边界

- 回调地址必须与注册值完全一致，禁止通配符。
- 生产回调、启动和健康地址必须使用 HTTPS；仅开发环境允许 loopback HTTP。
- Authorization Code 60 秒过期、只能消费一次并绑定 PKCE S256。
- 客户端 Secret 只在创建或轮换时返回一次，数据库只保存 `scrypt` 哈希。
- Token 端点统一返回 OAuth 错误，不泄漏客户端是否存在或密钥细节。
- 外部应用默认至少允许 `viewer`，更高角色使用现有角色等级判断。
- 所有注册、修改、删除、密钥轮换、启动、授权成功和失败写入统一审计。
- 中央会话撤销不会伪装成已同步退出外部项目；外部项目应使用短期本地会话，敏感操作可重新发起 OIDC 授权。

## 控制台

新增“外部应用”视图，展示应用名称、接入状态、健康状态、响应时间、角色门槛和打开方式。超级管理员可创建、编辑、停用、删除和轮换客户端密钥；普通角色只能查看有权限访问的应用并打开。

## Android

Android 从独立 API 加载外部应用，不把它们混入内部服务健康统计。点击 `webview` 应用时复用 `PlatformWebActivity`；点击 `browser` 应用时使用系统浏览器。Android 不生成或保存客户端 Secret、PKCE verifier 或外部 Token。

## 错误处理

- 应用停用或角色不足返回明确业务错误。
- 健康检查失败只影响状态展示，不阻止用户打开应用。
- 授权参数无效时返回标准 OAuth 错误页或回调错误，绝不跳转到未注册地址。
- 外部项目兑换失败后必须重新开始授权流程，不允许重用授权码。

## 验证

- Store、PKCE、回调校验、授权码单次消费和 JWT 验签使用 Node 单元测试。
- API 使用现有测试服务器验证角色、Android 请求、OAuth 错误和审计边界。
- 控制台运行聚焦测试和 Vite build。
- Android 运行相关 Kotlin 单元测试与 `compileDebugKotlin`；不主动进行设备或浏览器 E2E。
