# 后端与接口规范评审

> 评审日期：2026-10-30
> 状态：**已落地**。P0 六项、统一错误契约、健康检查、网关路由表、分页元数据、错误码注册表均已实施，
> 规范见 [docs/api-specification.md](api-specification.md)。本文保留为问题清单与决策依据（"当时为什么这么改"）。
> 评审范围：`services/` 下 6 个可部署单元、`packages/platform-auth`、`infra/nginx`、`docs/` 中的接口相关文档
> 评审方式：静态阅读 + 端点盘点脚本 + 限流响应实测（Node 起真实中间件验证 content-type）


---

## 0. 结论

**分层与信任边界是这套后端最强的地方，接口契约层是最弱的地方。**

- 身份票据（Ed25519、15 秒、绑定方法/路径/查询）、服务间 HMAC（含 body 摘要与 nonce 防重放）、一服务一库、优雅停机——这些都已经做到"超出同规模项目平均水平"。
- 但**对外暴露的接口没有一份可执行的契约**：5 种响应信封、4 种分页结构、6 个单元各写一套健康检查（共 10 个路径）、core-api 内部 3 种 429 响应（其中 1 种是 `text/html`）、1 个 OpenAPI、0 个契约测试。
- 盘点出 **6 个应当按 bug 处理的问题**（不是风格问题），其中 3 个会让客户端直接解析失败或误判成功：限流返回 HTML、HTTP 200 携带业务错误码、core-api 404 返回 HTML。
- 建议的路线是"先修行为、再统契约、最后上版本"，**不要**一次性重写 5 种信封——那会同时改动 4 个 Web 应用与 2 个小程序。

### 评分表

| 维度 | 评价 | 关键证据 |
| --- | --- | --- |
| 进程与部署拓扑 | 好 | 单容器内 core/exam 仅监听回环；6 库隔离；无跨库读取 |
| 内部认证与授权 | 好 | `packages/platform-auth/index.cjs:243-288`；网关剥离外部身份头 `router.mjs:541` |
| 错误处理 | 差 | 5 种信封；core-api 无 404 处理；Mongoose 异常未映射 |
| 输入校验 | 中偏差 | core-api 55 个写端点仅 13 个有 schema（24%）；exam-api 81% |
| 分页 | 中偏差 | 4 种响应结构；`utils/pagination.js` 存在但多数列表接口未使用 |
| 限流 | 中偏差 | 3 种 429 body，其中 3 个限流器返回 `text/html`（实测） |
| 健康检查 | 差 | 6 个单元各一套，共 10 个路径；网关无自有端点；存活与就绪混用 |
| 可观测性 | 中 | 代理指标齐全；portal/官网请求无访问日志；requestId 只在日志字符串里 |
| 契约与文档 | 差 | 仅 notification-service 有 OpenAPI；无契约测试；`docs/core-api-usage.md` 名不副实 |

---

## 1. 现状盘点

### 1.1 入口与端点规模

所有公网流量只进 `platform-api`（`services/platform-api/src/router.mjs`），再按路径/域名分发到 core、exam、campus、iot、notify。盘点结果：

| 服务 | HTTP 端点 | 写操作 | 显式 schema 校验（路由层） | 校验覆盖率 |
| --- | ---: | ---: | ---: | ---: |
| `core-api` | 98（另有 1 处 `ct8Router` 动态注册） | 55 | 13 | **24%** |
| `exam-api` | 138 | 74 | 60 | 81% |
| `notification-service` | 45 | — | zod | 高 |
| `campus-service` | 手工 `http` 路由（`server.js` 3160 行） | — | 手写 | 低 |
| `iot-service` | 33 处 JSON 响应 | — | 手写 | 低 |

> 口径说明：core/exam 用脚本解析 `router.<method>('...')` 行统计；campus 为原生 `http` 服务，无法按同一口径统计。

### 1.2 认证有三套并存（有意设计，但接口层没有统一表达）

| 调用方 | 凭证 | 载体 | 有效期 |
| --- | --- | --- | --- |
| 统一管理面浏览器 | `my_platform_session` | Cookie（HttpOnly/Secure/SameSite=Strict） | 服务端会话表 |
| 业务后台直连（旧域名） | JWT + refresh | Cookie + CSRF 头 | access 短、refresh 长 |
| 小程序用户 | JWT | `Authorization: Bearer` | 见 `config.jwtExpiresIn` |
| 第三方服务 | `X-API-KEY` | Header | 长期 |
| 服务 → 服务 | HMAC-SHA256 | `x-my-service-*` 四个头 | 30 秒 + nonce |

问题不在于"三套并存"（这是平滑迁移的必然），而在于**同一份 OpenAPI/文档无法描述"这个端点接受哪一种"**。目前只有 `docs/core-api-usage.md` 用散文说明 API Key。

### 1.3 响应信封：代码里有 5 种，实测还有第 6 种

| # | 形态 | 代表位置 |
| --- | --- | --- |
| 1 | `{ success: true, ... }` / `{ success: false, error, code?, requestId }` | `core-api/controllers/userController.js`、`middleware/errorHandler.js:26-35` |
| 2 | `{ code: 200, data }` / `{ code: 400, message }` | `core-api/controllers/adminCourseOrderController.js`、`platformConfigController.js` |
| 3 | `{ code: 0, data, message }` | `exam-api/src/utils/response.js:5-9` |
| 4 | `{ errcode, errmsg, code?, requestId? }` | `notification-service/src/app.js:225,291,322` |
| 5 | `{ ok: false, error }` | `campus-service/server.js:2111,3081` |
| 6 | `{ error }`（无 code、无 requestId） | `iot-service/src/http/routes/devices.js:75`、`system.js:82` |
| **7（实测）** | **纯文本 `text/html`** | core-api 的 `globalLimiter` / `scanLimiter` / `exchangeLimiter` |

`docs/engineering-standards.md §7` 已登记"五种并存"，但**没有登记第 7 种**——它不是一个"风格"，而是一个会让 `response.json()` 抛异常的缺陷。

`code` 字段的语义在不同服务里互相冲突：

- `exam-api`：`code` = HTTP 状态码（`0` 表示成功，`401`/`500` 表示失败）；
- `core-api`：`code` = 字符串枚举（`AUTH_TOKEN_EXPIRED`、`PLATFORM_READ_ONLY`）；
- `notification-service`：`code` = 字符串枚举，同时还有 `errcode` = 数字；
- `iot-service`：没有 `code`。

结果：**没有任何一个共享客户端能同时正确解析两个服务**。`apps/exam-admin/src/utils/http.js:149` 取 `data?.message`，`core-admin` 走 `data?.error`，两者无法复用同一套错误映射。

### 1.4 分页：4 种响应结构

| 服务 | 请求参数 | 响应结构 |
| --- | --- | --- |
| core-api（用户/审计） | `page`、`pageSize` | `{ success, items, total }`（无页码、无总页数） |
| core-api（课程订单） | `page`、`limit` | `{ code: 200, data: { list, total, page, limit } }` |
| exam-api（管理端） | `page`、`pageSize` | `{ code: 0, data: { list, total } }` |
| exam-api（小程序端） | `page`、`pageSize` | `{ code: 0, data: { list, total, hasMore } }` |
| notification-service | `limit`、`cursor` | `{ items, nextCursor }` |
| campus-service | `page`、`pageSize` | `{ items, total, page, totalPages }` |

`utils/pagination.js` 在 core 与 exam 各有一份，**请求侧**的 `limit` / `pageSize` 优先级相反是已经锁定的有意设计（两侧都有注释，见 `engineering-standards.md §14.2`）——这一点**不要动**。真正的问题是**响应侧**：没有任何服务返回统一的分页元数据，客户端必须自己推断"还有没有下一页"。

### 1.5 健康检查：6 个单元各写一套，共 10 个路径

| 单元 | 路径 | 语义 |
| --- | --- | --- |
| platform-api（网关） | 无自身端点；`/api/health` `/api/livez` `/api/readyz` 由门户应用代答（响应体 `service: "admin-console"`） | 借用门户实现 |
| core-api | `/health` | DB 断则 500（实为 readiness） |
| exam-api | `/ready`、`/version` | 就绪 + 版本 |
| notification-service | `/healthz`、`/readyz`、`/openapi.json` | 存活 + 就绪 + 契约 |
| campus-service | `/api/ready` | 就绪 |
| iot-service | `/api/ready` | 就绪 |
| admin-console（门户） | `/api/health`、`/api/livez`、`/api/readyz` | 三种都有 |

网关的 `checkExternalServices()` 用一张硬编码表把这些差异吞掉（`service-targets.mjs:61-67`），所以**编排层能跑，但运维无法用统一规则写探针**。更实际的问题是 `infra/docker/compose.yml` 里**只有 `mongodb` 与 `iot-service` 配了 healthcheck**，唯一的公网入口 `platform-api` 没有探针，容器"进程在跑但下游全挂"时编排层看不出来。最危险的是 core-api：`/health` 把"进程活着"与"DB 可用"合并成一个 500，如果哪天把它配成 liveness probe，DB 抖动会直接触发容器重启风暴。

### 1.6 契约与文档

- 唯一机器可读契约：`notification-service` 的 `GET /openapi.json`（`src/api-access.js:81`）。
- 无 OpenAPI、无 JSON Schema、无契约测试；跨服务不变量（信封、429、404、健康路径）没有任何断言。
- `docs/core-api-usage.md` 的文件名是"core-api"，内容是**企业微信通知接入教程**（第 1 行标题、第 14 行入口都是 `/api/notify`）。而 `AGENTS.md` 的导航表把这份文档指向"外部项目接入 SSO"——链接与内容双重错位。
- 无版本化：除 notification 的 `/v1/notifications` 外，所有路径都是无版本的；`/api/github/*` 这类已废弃别名没有下线条件。

---

## 2. 问题清单

### P0 — 行为缺陷，建议按 bug 修（不改协议、不动前端）

#### P0-1 限流 429 返回 `text/html`（已实测）

`services/core-api/middleware/rateLimit.js:3-9`、`28-36`、`37-45` 三个限流器把 `message` 写成字符串，`express-rate-limit` v8 会走 `res.send(string)`，Content-Type 变成 `text/html`。

实测（用 `core-api` 安装的 express 8.5.2 + express-rate-limit 真实中间件）：

```text
status 429
content-type text/html; charset=utf-8
body "Too many requests from this IP, please try again later."
```

影响：前端 `response.json()` 直接抛 `SyntaxError`，用户看到的是"网络错误"而不是"请求过于频繁"；网关的代理指标把 429 记为 4xx（正确），但客户端无法区分。

修法（同时覆盖三个限流器）：

```js
// services/core-api/middleware/rateLimit.js
const rateLimited = (req, res, options) => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试。',
        code: 'RATE_LIMITED',
        retryAfter,
        requestId: req.id,
    });
};

exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimited,
});
```

> 注意：`authLimiter` 已有 handler，但返回 `{success:false,error,retryAfter}` 缺 `code` 与 `requestId`；`publicSearchLimiter` / `publicRefreshLimiter` 返回 `{code,message}`。四个限流器应共用同一个 handler。

#### P0-2 core-api 用 HTTP 200 返回业务错误码

`controllers/adminCourseOrderController.js:70`：

```js
return res.json({ code: 400, message: "请选择需要刷新的订单" });   // HTTP 200
```

同一文件的 73 行却用了 `res.status(400)`；`courseOrderController.js:516`、`535` 同样把 400/404 放在 200 里。

影响：`fetch` 的 `res.ok` 为 `true`，axios 不进入 `catch`，网关指标记为成功，4xx 告警永远不会触发。**这是"错误被静默吞掉"的典型形态。**

修法：所有 `res.json({ code: 4xx })` 改成 `res.status(4xx).json({...})`；把 `code` 的数字改成稳定字符串（见 §4.3）。

#### P0-3 core-api 没有 404 处理，未知路径返回 HTML

`services/core-api/server.js` 在路由、静态资源、SPA 回退之后直接挂 `errorHandler`，没有兜底 404。Express 默认返回 `Cannot GET /api/xxx` 的 `text/html`。

影响：`/api/core/typo`、`/api/core/users/xxx/yyy` 这类请求客户端拿到 HTML，`.json()` 抛异常；同时把框架默认页暴露给外部。

修法（放在路由之后、`errorHandler` 之前，且不要吞掉静态资源与 SPA 回退）：

```js
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: '接口不存在。',
        code: 'ROUTE_NOT_FOUND',
        requestId: req.id,
    });
});
```

#### P0-4 core-api 未映射 Mongoose 异常，非法 ObjectId 返回 500

`middleware/errorHandler.js` 只读 `err.statusCode || err.status || 500`。`CastError`、`ValidationError`、`code: 11000` 都没有分支，全部落到 500 并隐藏消息。

影响：`GET /api/users/not-an-objectid` 返回 500；监控上表现为服务故障，实际是客户端参数错误。`exam-api` 已经正确处理（`src/middleware/errorHandler.js:15-33`），**core-api 可以直接对照补齐**，不需要新设计。

#### P0-5 下载解析的 SSRF 防护可绕过

`services/platform-api/src/download-parse.mjs:56-70` 用**黑名单**匹配主机名字符串：

```js
const BLOCKED_HOST_PATTERNS = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, ...];
```

缺口：

1. 不做 DNS 解析。`evil.example.com` 解析到 `127.0.0.1` 可以通过。
2. 不覆盖 IPv4-mapped IPv6（`[::ffff:127.0.0.1]`）、十进制 IP（`2130706433`）、八进制/十六进制写法。
3. 不限制端口，`http://public-host:6379` 会被当成普通 URL 交给 yt-dlp。
4. 通用分支会把**任意** URL 传给 yt-dlp 在服务器上发起请求（只有抖音走直连 API）。

影响：任何持有平台会话的账号都能把它当内网探测代理（该端点已有 20 次/分钟限流，但不足以消除影响）。

修法（正列优先，而不是继续补黑名单）：

```js
// 只有受支持的平台才进入解析；其余直接 400。
const ALLOWED_SHARE_HOSTS = [/^(?:[\w-]+\.)?douyin\.com$/i, /^(?:[\w-]+\.)?iesdouyin\.com$/i, /* bilibili 等 */];

export async function assertFetchable(url) { /* scheme + host 允许列表 + 端口 80/443 */ }

// yt-dlp 之前解析 DNS，拒绝私有网段（含 IPv6、v4-mapped）
const { address } = await dns.promises.lookup(hostname);
if (isPrivateAddress(address)) throw resolveError(400, '该链接不受支持。', 'URL_NOT_ALLOWED');
```

另外建议给 yt-dlp 加 `--no-playlist`、限制重定向跳数，并在 `fetch`/下载路径上复用同一个 `isPrivateAddress`。

#### P0-6 iot-service 在 500 响应里回传原始错误信息

`services/iot-service/src/http/routes/system.js:82`：

```js
res.status(500).json({ error: error.message });
```

同一文件 59 行把 MQTT 连接测试的异常原文返回给客户端（可能包含 broker 地址、认证失败细节）。

修法：对外只返回通用文案 + `code`，原文写日志；同时补 `requestId`（iot 目前没有请求 ID 中间件）。

---

### P1 — 规范一致性问题（需独立议题 + ADR，不要夹在功能提交里）

#### P1-1 信封不统一，且 `code` 语义冲突

见 §1.3。这不是"改个字段"能解决的：4 个 Web 应用 + 2 个小程序 + Android 都在解析现有结构。建议按 §5 分阶段推进，**先统一错误（4xx/5xx），成功体保持不动**。

#### P1-2 core-api 校验覆盖率 24%

下表只列缺口最集中的文件，合计为整个 `routes/` 目录的口径：

| 文件 | 端点 | 写操作 | 有 schema |
| --- | ---: | ---: | ---: |
| `tuya.js` | 13 | 4 | 0 |
| `ct8Router.js` | 12 | 5 | 0 |
| `courseOrderRoutes.js` | 13 | 9 | 2 |
| `settings.js` | 13 | 9 | 4 |
| `todos.js` | 3 | 2 | 0 |
| `courseCategoryRoutes.js` | 4 | 2 | 0 |
| `platformConfigRoutes.js` | 3 | 2 | 0 |
| **合计** | **98** | **55** | **13** |

`middleware/validate.js:4` 还有两个与 exam-api 的实质差异：

```js
const { error } = schema.validate(req.body, { abortEarly: false });   // 只校验 body；没有 stripUnknown
```

- 只校验 `body`，`query` / `params` 全靠手写 `parseInt`；
- 不 `stripUnknown`，未声明字段会保留在 `req.body` 里（当前控制器都是显式解构，暂时没有被利用，但这是"下次重构就会踩"的隐患）。

对照 `exam-api/src/middleware/validate.js:18-38`：三处来源都校验、`stripUnknown: true`、校验后的值回写 `req[source]`。**这是仓内已有的正确范式，直接对齐即可。**

#### P1-3 分页响应缺元数据

见 §1.4。建议只统一**响应侧**（请求侧的 `limit`/`pageSize` 反向优先级保持不动）：

```json
{ "items": [], "page": { "page": 1, "pageSize": 20, "total": 123, "totalPages": 7 } }
```

#### P1-4 健康检查没有统一契约，网关没有自己的探针端点

见 §1.5。建议每个单元（含 `platform-api`）都提供：

- `GET /livez`：进程存活，不查任何依赖，永远 200；
- `GET /readyz`：依赖就绪（DB/存储），200 或 503；
- `GET /version`：构建版本（`GIT_SHA` / 镜像 tag），便于发布核对。

保留 `/health`、`/ready`、`/healthz` 作为别名至少一个发布周期，`service-targets.mjs` 的表改成"优先 `/readyz`，失败回落旧路径"，避免与滚动发布互相卡住。

#### P1-5 没有可执行契约

- 只有 notification-service 提供 `/openapi.json`；
- 没有契约测试，跨服务不变量（404 是 JSON、429 是 JSON、健康路径存在）无断言；
- 没有版本化与下线策略，`/api/github/*` 这类废弃别名没有退出条件。

建议：每个服务暴露 `GET /openapi.json`（由 Joi/zod schema 生成或手写后纳入 CI 快照），并新增一个 `test/contract/` 目录，用 `node --test` 启动内存替身断言 §4 的不变量。这与 `engineering-standards.md §5` 的"服务 check = lint + node --check + npm test"完全兼容。

#### P1-6 SSO 票据里的 `csrf` 声明无人校验

`packages/platform-auth/index.cjs:221-223` 在票据里签了 `csrf` 声明，但下游没有任何服务读取它（grep 全仓只有 core-api 自己的 CSRF Cookie 逻辑）。同时 `verifyInternalIdentity` 不校验票据最大生命周期（只校验 `exp > now - skew`），如果私钥误用，签一张 1 小时的票也能通过。

建议二选一，并写进 ADR：

- **删掉** `csrf` 声明（网关已用 `Origin` + `Sec-Fetch-Site` 拦截跨站写，见 `router.mjs:144-160`），避免"看起来有防护"；
- 或**真正校验**：下游对非安全方法比对 `csrf` 声明与 `X-CSRF-Token`。

另外补一行防御：

```js
claims.exp - claims.iat > 30   // 票据最长 30 秒，超出即拒绝
```

#### P1-7 网关分发是 120 行 if/else，且有一处硬编码超时

`services/platform-api/src/router.mjs:538-658` 按字符串前缀逐条判断，新旧路径（`/api/core` 与 `/core`、`/api/exam` 与 `/exam`）各写一遍。扩展一个服务要改 4 处，且没有一份"网关路由清单"可供文档/测试消费。

更具体的一处：`router.mjs:371-372`

```js
const timeoutMs = service === 'exam' && req.method === 'POST' && pathname === '/api/user/ai/question-analysis'
    ? examAiTimeout : upstreamTimeout;
```

一旦 exam 改了这个路径，网关会静默退回 15 秒，表现为"AI 解析偶发 504"。

建议改成声明式路由表（同时可导出为 `/api/__routes` 或测试快照）：

```js
const ROUTE_TABLE = [
  { prefix: '/api/core', service: 'core', rewrite: { apiByDefault: true, preserve: ['/uploads', '/public'] } },
  { prefix: '/api/exam/client', service: 'exam', rewrite: {} },
  { prefix: '/api/exam', service: 'exam', rewrite: { apiByDefault: true }, timeoutMs: examAiTimeout },
  // ...
];
```

超时按"路由条目"配置，而不是按"路径字符串相等"。

#### P1-8 文档错位

- `docs/core-api-usage.md` 实际内容是通知 API 教程（标题、示例、入口都是 `/api/notify`）。建议重命名为 `docs/notification-api-usage.md`。
- `AGENTS.md` 导航表把"外部项目接入 SSO"指向这份文档，应改指 `docs/external-project-sso.md`。
- 接口规范类内容目前散落在 `architecture.md`（鉴权模型）、`engineering-standards.md §7`（响应形态）、两份服务自述里，缺一份"怎么写一个接口"的单一入口。

---

### P2 — 演进项（可排期，不急）

| # | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| P2-1 | requestId 只存在于日志字符串，不是结构化字段 | `core-api/server.js:64-72` 把 morgan 行整体塞进 `logger.info(message)` | 用 winston `child({ requestId })` 或在 format 里注入字段 |
| P2-2 | 网关对 portal / 官网请求没有访问日志 | `server.mjs:157-164` 只为代理请求记录指标 | 给 `handler()` 加统一的 `finish` 日志（含 `service`/`status`/`durationMs`） |
| P2-3 | `Idempotency-Key` 只有课程订单实现 | `courseOrderController.js:198-224` + `CourseOrderBatch` 唯一索引 | 抽成通用中间件，至少覆盖"创建类"写接口 |
| P2-4 | `If-Match` / 428 / 409 只有 todos 实现 | `todoController.js:315-341` | 这是全仓最好的 HTTP 语义范例，应作为模板推广到"可并发编辑"的资源 |
| P2-5 | 重复实现 | SSO 包装器 ×2、`parsePagination` ×2、`requestId` ×2、`asyncHandler` ×2 | 抽 `packages/` 前先评估信任边界（Core/Exam 与网关已无进程隔离，见 `architecture.md:45`） |
| P2-6 | 前端错误映射各写各的 | `exam-admin/src/utils/http.js:149` 取 `message`；core-admin 取 `error` | 统一信封后由 `platform-browser-runtime` 提供单一解析器 |
| P2-7 | 网关与 nginx 超时不一致 | nginx `proxy_read_timeout 90s`（`my-platform.conf.example:54`），网关上限 120s | 让 nginx 至少比网关最大值多 10 秒，或统一收敛到 60s |
| P2-8 | 无请求体大小/字段长度总闸 | core-api `express.json({ limit: '1mb' })` 之外无字段级上限 | 在 schema 层统一加 `max()`，避免超长字符串写入 |

---

## 3. 值得保留的设计（不要"顺手统一"掉）

评审中发现以下几处明显高于平均水平，重构时应作为基准而不是被抹平：

1. **身份票据绑定过细**：`aud/role/method/path+query/session_exp/reauth_exp` 全部签进票据（`platform-auth/index.cjs:224-240`），网关还会剥离外部传入的内部头（`router.mjs:58-61,541`）。这是防重放与防伪造的核心，不要为了"简化"去掉任何一项。
2. **服务间 HMAC 含 body 摘要与 nonce**：`serviceRequestPayload()` 把 `sha256(body)` 纳入签名，`verifyServiceRequest` 有 30 秒窗口 + 5 秒未来偏移容忍 + `replayGuard`。
3. **会话缓存有负缓存与主动失效**：`session-cache.mjs` + `onConsoleSessionRevoked/Changed`，避免"退出后还能用 5 秒"。
4. **优雅停机有硬期限**：`server.mjs:194-227` 先 `server.close` 再等 10 秒强杀 WebSocket，最后 50 秒兜底 `exit(1)`。
5. **todos 的并发控制**：`If-Match`/`revision` → `428 Precondition Required` → `409 Conflict` → 返回新快照。这是 REST 语义用得最正的一处。
6. **课程订单的幂等键**：客户端键与请求头二选一、`sha256` 后落唯一索引、命中直接返回已有批次。
7. **notification-service 的 REST 成熟度**：201（创建）、202（异步受理）、204（删除）、`/openapi.json`、游标分页 `nextCursor`。
8. **网关的 502/504 归一化 + 按状态类打点**：`writeProxyError` + `finishProxyMetric`，排障时能区分 timeout / connect / aborted。

---

## 4. 目标规范 v1（建议稿）

> 定位：**只约束新代码与"下一次改动该端点时"的行为**，不要求一次性改造存量。存量端点保持现有形态直到被触碰。

### 4.1 URL 与版本

- 资源用复数名词 + HTTP 方法表达动作：`GET /users`、`POST /users`、`PATCH /users/:id`、`DELETE /users/:id`。
- 禁止新增 RPC 式路径（`/save`、`/list`、`/query`、`/do-something`）。确实无法用资源表达的动作用子资源：`POST /orders/:id/refunds`。
- 新端点从 `/v1` 开始：`/api/core/v1/users`（网关前缀剥离后服务内挂 `/v1`）。旧路径保留为别名，**并设定下线日期**。
- 废弃用响应头标注，而不是靠文档：

```http
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT
Link: </api/core/v1/users>; rel="successor-version"
```

### 4.2 响应信封

成功（单资源）：

```json
{ "ok": true, "data": { "id": "u_1" }, "requestId": "…" }
```

成功（列表）：

```json
{
  "ok": true,
  "data": [ { "id": "u_1" } ],
  "page": { "page": 1, "pageSize": 20, "total": 123, "totalPages": 7 },
  "requestId": "…"
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "用户不存在。",
    "details": [ { "field": "role", "message": "无效的角色类型" } ]
  },
  "requestId": "…"
}
```

约束：

- **HTTP 状态码表达传输语义，`error.code` 表达业务语义**，两者不得互相顶替（禁止 `HTTP 200 + code: 400`，也禁止把 HTTP 状态当业务码）。
- `message` 面向终端用户，可本地化；`code` 面向程序，稳定不变、全大写蛇形、全局唯一。
- `details` 只在 400/422 出现，且必须是数组。
- 5xx 一律返回通用文案，不返回堆栈、不返回上游原文。
- `requestId` 顶层必填，与 `X-Request-Id` 响应头一致。

### 4.3 错误码注册表

新增 `config/error-codes.json`（无密钥，属于契约配置）：

```json
{
  "AUTH_TOKEN_EXPIRED": { "http": 401, "zh": "登录已过期，请重新登录。" },
  "PLATFORM_SESSION_REQUIRED": { "http": 401, "zh": "统一登录会话已失效。" },
  "RATE_LIMITED": { "http": 429, "zh": "请求过于频繁，请稍后再试。" },
  "ROUTE_NOT_FOUND": { "http": 404, "zh": "接口不存在。" }
}
```

由 `scripts/checks/` 增加一条只读校验（接入 `npm run check`，与 `check:conventions` 同层）：

- 代码里出现的 `code` 必须已注册；
- 同一 `code` 不能映射两个 HTTP 状态；
- 注册表里的 `http` 与使用时实际状态一致（可用正则扫描 `code: 'X'` 附近的 `status(...)`）。

这样错误码不会随提交漂移，也不需要额外的运行时依赖。

### 4.4 输入校验

- 每个写端点必须有 schema，覆盖 `body` + `query` + `params`。
- 统一 `stripUnknown: true`、`allowUnknown: false`、`abortEarly: false`。
- 校验失败返回 400 + `error.code = "VALIDATION_FAILED"` + `details[]`（字段级）。
- 字符串字段声明 `max()`；数组字段声明 `maxItems`；金额/数量声明 `integer()`/`precision()`。
- 沿用各服务既有校验库（core/exam 用 Joi、notify 用 zod），**不引入新的校验库**。

core-api 的 `middleware/validate.js` 可以直接对齐 exam-api 的实现，然后按"先写接口、后读接口"的顺序补 schema：`secrets` → `platform-config` → `tuya` → `ct8` → `course-category` → `todos`。

### 4.5 幂等与并发

- 创建类写接口接受 `Idempotency-Key`（16–128 字符），命中直接返回首次结果 + `Idempotent-Replay: true`。
- 可并发编辑的资源用 `ETag` + `If-Match`，缺失返回 `428`，不匹配返回 `409` 并回传当前快照。
- 幂等键与服务端唯一索引必须同时存在（只有键没有唯一索引，等于没有幂等）。

### 4.6 限流

- 超限统一 429 + `Retry-After` 头 + `error.code = "RATE_LIMITED"` + `retryAfter` 秒数。
- 限流维度写进注释（IP / 账号 / API Key），并在响应头暴露 `RateLimit-*`（`standardHeaders: true` 已有）。
- 网关层只做粗粒度保护（如 `/api/*/auth/*` 按 IP），细粒度留给业务服务，避免两处都调阈值。

### 4.7 健康检查与元信息

| 路径 | 语义 | 依赖 | 状态码 |
| --- | --- | --- | --- |
| `/livez` | 进程存活 | 无 | 永远 200 |
| `/readyz` | 可接流量 | DB / 存储 / 迁移完成 | 200 / 503 |
| `/version` | 构建信息 | 无 | 200 |

响应体固定 `{ "status": "ok|ready|not-ready", "service": "...", "version": "..." }`。`platform-api` 必须提供**自己**的三个端点（当前靠门户代答，响应体 `service` 是 `admin-console`，且 compose 没有为它配置 healthcheck）。

### 4.8 观测

- 每个请求一条结构化访问日志：`{ event, requestId, method, path, status, durationMs, service, outcome }`。
- `requestId` 作为**独立字段**，不要拼进 message。
- 网关对 portal / 官网 / 静态资源也要有访问日志（当前只有代理指标）。
- 不记录 `Authorization`、Cookie、`X-API-KEY`、查询串中的 token（`sanitizeRequestUrl` 已有，需覆盖新端点）。

### 4.9 契约

- 每个服务 `GET /openapi.json`，OpenAPI 3.1；请求体 schema 从 Joi/zod 生成，响应体手写（生成器对响应支持普遍较差）。
- CI 把 `openapi.json` 与仓库内快照做 diff，**破坏性变更必须显式更新快照**——这就是"契约测试"的最低成本形态。
- `test/contract/*.test.js` 断言本文 §4.2/4.6/4.7 的不变量（404 是 JSON、429 是 JSON、`/livez` 不依赖 DB）。

---

## 5. 落地路线（四个阶段，每阶段可独立提交）

### Phase 1 — 修行为，不改协议（1–2 天，风险低）

1. 三个限流器改共用 `rateLimited` handler（P0-1）。
2. core-api 补 `/api` 兜底 404（P0-3）。
3. `errorHandler` 补 CastError / ValidationError / 11000 映射（P0-4）。
4. `adminCourseOrderController` / `courseOrderController` 的 `res.json({code:4xx})` 改真实状态码（P0-2）。
5. 下载解析改允许列表 + DNS 私网校验（P0-5）。
6. iot-service 500 脱敏（P0-6）。

> 验收：新增 `test/contract/errorShape.test.js`，对上述 6 项各断言一次。这一步不触碰任何前端，但会让 4xx 首次真正出现在监控里——上线前先确认告警阈值。

### Phase 2 — 统一错误契约（3–5 天，需要前端配合确认）

1. 每个服务加本地 `respond.js`（**先不进 `packages/`**，避免动信任边界）：`ok(res, data, meta)` / `fail(res, code, message, status)`。
2. 先迁 4xx/5xx（错误体最容易统一，影响面最小），成功体保持不动。
3. 建立 `config/error-codes.json` + 校验脚本，接入 `npm run check`。
4. 前端 `platform-browser-runtime` 增加统一错误解析器，兼容新旧两种形态至少一个版本。

### Phase 3 — 健康、观测、网关路由表（2–3 天）

1. 六个单元补齐 `/livez` `/readyz` `/version`，旧路径保留别名。
2. `service-targets.mjs` 改"优先新路径、失败回落旧路径"。
3. 网关分发改声明式路由表，超时按条目配置（P1-7）。
4. 网关补访问日志；core-api 把 requestId 变成结构化字段。

### Phase 4 — 契约与版本（持续）

1. 每个服务输出 `/openapi.json` + CI 快照 diff。
2. 新端点走 `/v1`；旧路径加 `Deprecation`/`Sunset` 头，设定下线日期。
3. 分页响应统一为 `{data, page}`（先在新端点上用，再逐域迁移）。
4. 幂等键与 `If-Match` 抽成中间件，按资源逐个接入。

---

## 6. 明确不做的事

| 不做 | 原因 |
| --- | --- |
| 一次性把 5 种信封改成 1 种 | 会同时改动 4 个 Web 应用、2 个小程序、Android，回归成本远超收益 |
| "对齐" `limit` / `pageSize` 的优先级 | 两侧注释已锁定为有意分歧（`engineering-standards.md §14.2`） |
| 替换现有日志库（winston/pino/morgan/自实现） | 日志格式与运维检索、审计链路绑定（`§7`） |
| 为统一而统一模块系统（ESM/CJS） | 仓内三种形态并存是既成事实（`§6`） |
| 把 SSO 验签抽到 `packages/` 就完事 | Core/Exam 与网关已共享进程与信任边界（`architecture.md:45`），抽取不改变隔离强度，需单独评估 |
| 引入 jest/vitest/Prettier | 门禁明确只用 `node --test`，且无格式化器（`§5`、`§4`） |

---

## 7. 附录：证据索引

| 结论 | 位置 |
| --- | --- |
| 网关剥离外部身份头、注入 requestId | `services/platform-api/src/router.mjs:58-61,538-544` |
| 网关分发 if/else 与硬编码 AI 超时 | `router.mjs:538-658`、`371-372` |
| 网关 502/504 归一化 | `router.mjs:78-108` |
| 身份票据签发与校验 | `packages/platform-auth/index.cjs:201-288` |
| `csrf` 声明未被消费 | `packages/platform-auth/index.cjs:221-223` |
| 服务间 HMAC（body 摘要 + nonce） | `index.cjs:100-199` |
| core-api 全局/扫码/兑换限流返回字符串 | `services/core-api/middleware/rateLimit.js:3-9,28-36,37-45` |
| core-api 错误信封 | `services/core-api/middleware/errorHandler.js:26-44` |
| core-api 无 404 兜底 | `services/core-api/server.js`（路由后直接 `errorHandler`） |
| core-api 校验只覆盖 body | `services/core-api/middleware/validate.js:4` |
| HTTP 200 + 业务错误码 | `services/core-api/controllers/adminCourseOrderController.js:70`、`courseOrderController.js:516,535` |
| core-api 手写分页、无页码元数据 | `services/core-api/controllers/userController.js:35-37,60` |
| exam-api 统一响应助手 | `services/exam-api/src/utils/response.js:5-11` |
| exam-api 三源校验 + stripUnknown | `services/exam-api/src/middleware/validate.js:18-38` |
| exam-api Mongoose 异常映射 | `services/exam-api/src/middleware/errorHandler.js:15-33` |
| 健康检查路径表 | `services/platform-api/src/service-targets.mjs:61-67` |
| core-api `/health` 混合就绪语义 | `services/core-api/server.js:132-140` |
| exam-api `/ready` `/version` | `services/exam-api/src/app.js:164-168` |
| notification `/healthz` `/readyz` `/openapi.json` | `services/notification-service/src/app.js:734-743` |
| notification REST 语义（201/202/204） | `services/notification-service/src/app.js:820,967,977,1207` |
| campus `{ok,error}` 与 `totalPages` | `services/campus-service/server.js:2111,512` |
| iot 500 泄露 error.message | `services/iot-service/src/http/routes/system.js:82` |
| 下载解析黑名单 | `services/platform-api/src/download-parse.mjs:56-70` |
| todos 并发控制（428/409） | `services/core-api/controllers/todoController.js:315-341` |
| 课程订单幂等键 | `services/core-api/controllers/courseOrderController.js:198-224` |
| 文档名不副实 | `docs/core-api-usage.md:1-16` |
| nginx 90 秒读超时 | `infra/nginx/my-platform.conf.example:54` |
