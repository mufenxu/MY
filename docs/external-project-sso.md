# 外部项目统一认证接入指南

## 适用范围

MY 外部身份服务用于把部署在不同 VPS、不同域名的自有项目接入统一账号体系。外部项目继续保留自己的业务、数据库和网络环境，只把登录交给 MY。

接入后，用户可以从统一控制台或 Android App 点击应用入口，经过 OAuth 2.1 Authorization Code + PKCE 流程进入外部项目，无需再次输入密码。外部项目最终创建并维护自己的 HttpOnly 会话，不共享 MY Cookie，也不保存 MY 用户密码。

## 中央服务准备

生产环境必须配置公开 HTTPS 地址和独立的 Ed25519 签名密钥：

```powershell
npm.cmd run keys:external-auth
```

把命令输出分别写入生产密钥管理系统对应的环境变量，不要提交到 Git：

```text
PLATFORM_PUBLIC_ORIGIN=https://pxyb.cn
PLATFORM_EXTERNAL_AUTH_PRIVATE_KEY=...
PLATFORM_EXTERNAL_AUTH_PUBLIC_KEY=...
PLATFORM_EXTERNAL_AUTH_KEY_ID=external-auth-v1
PLATFORM_EXTERNAL_AUTH_TOKEN_TTL_SECONDS=300
PLATFORM_EXTERNAL_AUTH_TOKEN_RATE_LIMIT_PER_MINUTE=60
```

`/oauth/token` 默认按客户端 IP 每分钟限制 60 次请求。达到限制时返回 `429 temporarily_unavailable`，并由限流器提供 `Retry-After`；可通过上述变量在安全范围内调整。

密钥轮换时应先让外部项目能够刷新 JWKS，再切换 `PLATFORM_EXTERNAL_AUTH_KEY_ID` 和密钥对。当前实现只发布一个活动签名密钥，因此不要在旧 Token 仍需被接受时直接覆盖旧密钥。

## 注册外部应用

使用 `super_admin` 登录统一控制台，进入“外部应用”，新增应用并填写：

- 应用名称和说明。
- 启动地址，例如 `https://project.example.com/auth/my/start`。
- 精确回调地址，例如 `https://project.example.com/auth/my/callback`。
- 可选健康检查地址，例如 `https://project.example.com/health`。
- 最低访问角色：`viewer`、`operator` 或 `super_admin`。
- 打开方式：Android 内置 WebView 或系统浏览器。
- 是否启用。

创建成功后会显示 `client_id` 和 `client_secret`。`client_secret` 只显示一次，外部项目必须立即写入自己的密钥管理系统。遗失后只能在控制台轮换，旧 Secret 会立即失效。

回调地址采用完全匹配，不支持通配符。生产环境的启动、回调和健康检查地址必须为 HTTPS；开发环境仅允许 loopback HTTP。

## 既有项目升级

既有接入项目无需重新注册，现有 `client_id`、Secret、启动地址、回调地址和成功登录协议均不变，也不需要新增外部项目环境变量。

建议检查客户端的 Token 失败处理。如果客户端会自动重试同一个授权码、把所有非 `200` 响应统一映射为 `500/502`，或把上游 `error_description` 返回给浏览器或写入日志，则需要按本文“标准登录流程”和“常见问题”升级。已经正确执行一次性授权码、错误分级和本地安全文案的项目不需要修改。

## OIDC 元数据

外部项目应从 Discovery 获取端点，不要硬编码除 Issuer 以外的路径：

```text
GET https://pxyb.cn/.well-known/openid-configuration
```

当前公开端点：

```text
GET  /.well-known/openid-configuration
GET  /oauth/jwks.json
GET  /oauth/authorize
POST /oauth/token
GET  /oauth/userinfo
```

支持范围为 `openid profile roles`，ID Token 使用 `EdDSA` 签名。外部项目验签时必须同时检查：

- `iss` 等于 Discovery 中的 `issuer`。
- `aud` 等于本项目的 `client_id`。
- 签名算法为 `EdDSA`，签名密钥来自 Discovery 的 `jwks_uri`。
- `exp` 未过期、`iat` 合理、`token_use` 等于 `id`。
- `nonce` 与本次登录开始时保存的值完全一致。

用户身份字段为 `sub`、`preferred_username` 和 `role`。目前 `sub` 为 MY 用户名；外部项目仍应把它作为不透明标识保存，不要依赖用户名格式。

## 标准登录流程

外部项目的 `/auth/my/start` 必须在服务端完成以下操作：

1. 生成高强度随机 `state`、`nonce` 和 43 到 128 字符的 PKCE `code_verifier`。
2. 计算 `BASE64URL(SHA256(code_verifier))` 作为 `code_challenge`。
3. 把 `state`、`nonce`、`code_verifier` 和受控站内 `returnTo` 保存到外部项目自己的服务端会话。
4. 跳转到 `authorization_endpoint`，携带 `response_type=code`、精确 `redirect_uri`、`scope=openid profile roles`、`code_challenge_method=S256`。

回调 `/auth/my/callback` 必须：

1. 拒绝 OAuth 错误、缺少授权码或不匹配的 `state`。
2. 立即从服务端会话取出并删除本次 OAuth 临时状态，避免重复使用。
3. 从外部项目后端调用 `token_endpoint`，提交授权码、原始 `code_verifier` 和同一个 `redirect_uri`。
4. 使用 `client_secret_basic` 或 `client_secret_post` 认证客户端，Secret 不得进入浏览器或 URL。
5. 按上一节要求验证 ID Token，并确认 `nonce`。
6. 重新生成外部项目会话 ID，再写入本地用户身份和权限。

授权码约 60 秒过期且只能消费一次。外部项目取得回调后应立即消费并删除本地 OAuth 临时状态，因此 Token 兑换失败后也不能重放同一个授权码：`invalid_grant` 直接重新开始登录；`temporarily_unavailable` 遵循 `Retry-After`，等待后重新开始登录；`invalid_client` 停止登录并检查服务端客户端配置。

## 角色映射

MY 角色等级为：

```text
viewer < operator < super_admin
```

中央服务会在授权前执行应用最低角色校验。外部项目仍应对每个业务操作做自己的授权检查，不能只依赖“成功登录”。推荐把 MY 角色映射到项目内部权限组，并默认拒绝未知角色。

## Android 与控制台打开流程

控制台和 Android 都先调用：

```text
POST /api/external-apps/:id/launch
```

服务端校验应用状态和角色后返回短期登录地址。Android 请求会额外使用一次性 Web Login Ticket 把 App 会话安全转换为中央浏览器会话，然后进入外部项目的 `/auth/my/start`。外部项目不需要识别 Android，也不要自行读取 MY App Cookie。

## 会话与退出

中央 Token 默认有效期为 5 分钟，仅用于建立外部项目本地会话。外部项目应使用合理的空闲超时和绝对过期时间，对敏感操作可重新发起 OIDC 登录。

第一阶段不提供跨域单点退出。用户退出 MY 不会自动删除所有外部项目 Cookie，外部项目退出也不会撤销 MY 会话。外部项目必须提供自己的退出路由并销毁本地会话，界面上不要宣称“已退出全部系统”。

## 网络与安全要求

- 所有生产域名启用有效 TLS 证书，HTTP 永久跳转 HTTPS。
- 外部项目只在后端保存 `client_secret`，使用受限环境变量或密钥管理系统。
- OAuth 临时状态和登录会话 Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax`。
- 反向代理部署时正确配置可信代理，避免伪造协议和客户端地址。
- `returnTo` 只允许站内相对路径，禁止把它直接作为外部跳转地址。
- 不记录授权码、Access Token、ID Token、Secret、Cookie 或完整回调查询参数。
- 不把 Token 端点的上游 `error_description` 原样返回给浏览器或写入日志，只映射受控错误码和本地文案。
- JWKS 可以缓存，但遇到未知 `kid` 时应刷新一次，不能关闭签名验证。

## 健康检查

健康检查仅用于控制台状态展示，不参与内部微服务 SLO，也不会阻止用户打开应用。推荐提供快速、无认证、无敏感数据的 `GET /health`，成功返回 `2xx`，不要在该接口执行昂贵的全量依赖检查。

## 常见问题

`invalid_client`：检查 `client_id`、Secret 是否来自同一次创建或轮换，确认 Basic 编码或表单字段正确。

`invalid_grant`：授权码可能过期、已消费，或 `redirect_uri`、PKCE verifier 与授权请求不一致。重新开始登录流程。

`temporarily_unavailable`：Token 请求达到限流或认证服务暂时不可用。仅遵循可信、受限的 `Retry-After` 提示等待时间，等待后重新发起完整登录，不能重试原授权码。

`invalid_request`：检查 `response_type=code`、`scope`、`state`、`nonce`、`code_challenge` 和精确回调地址。

`access_denied`：当前 MY 账号角色低于应用注册的最低角色，或应用已经停用。

回调后又要求登录：确认外部项目的 Session Cookie 使用 HTTPS、`SameSite=Lax`，反向代理已传递正确协议，且多实例部署使用共享 Session Store。

Android 打开失败但浏览器正常：确认应用注册的 `openMode`、启动地址可在对应容器访问，并检查外部站点是否主动拒绝 WebView User-Agent 或第三方 Cookie。标准流程不依赖第三方 Cookie。

## Express 参考实现

可运行参考位于 `examples/external-sso-express`。它演示 Discovery、PKCE、`state`、`nonce`、后端 Token 兑换、JWKS 验签、会话固定攻击防护和站内跳转限制。生产部署前应把默认内存 Session Store 换成 Redis 等共享持久化 Store。
