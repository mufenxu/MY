# 接口规范 v1

> 状态：生效中（2026-10-30 起）
> 定位：**约束新代码，以及存量端点的下一次改动**。不要求为了对齐而重写存量接口。
> 来由：[docs/api-contract-review.md](api-contract-review.md) 的评审结论。
> 校验入口：`npm run check:contract`（已接入 `npm run check`）。

---

## 1. URL 与方法

- 资源用复数名词 + HTTP 方法表达动作：`GET /users`、`POST /users`、`PATCH /users/:id`、`DELETE /users/:id`。
- 禁止新增 RPC 式路径（`/save`、`/list`、`/do-something`）。确实无法资源化的动作用子资源：`POST /orders/:id/refunds`。
- 新资源从 `/v1` 开始：`/api/core/v1/users`。旧路径作为别名保留，**并在引入 `/v1` 的那个 PR 里写下线日期**。
- 废弃用响应头标注，不靠文档：

```http
Deprecation: true
Sunset: Wed, 31 Dec 2026 23:59:59 GMT
Link: </api/core/v1/users>; rel="successor-version"
```

## 2. 响应信封

### 2.1 失败响应（4xx / 5xx，**已统一**）

```json
{
  "ok": false,
  "success": false,
  "code": "VALIDATION_FAILED",
  "error": "提交的内容不合法，请检查后重试。",
  "message": "提交的内容不合法，请检查后重试。",
  "details": [{ "field": "role", "message": "无效的角色类型" }],
  "requestId": "req-m3k9-1a2b3c4d"
}
```

| 字段 | 说明 |
| --- | --- |
| `ok` / `success` | 新契约字段 / 兼容字段。两者都写 `false`，因为 `apps/core-admin` 仍有多处 `res.data.success` 判断。 |
| `code` | 稳定字符串枚举，来自错误码注册表。**不要把 HTTP 状态码写进来**。 |
| `error` / `message` | 同一句面向用户的文案，两个字段并存是兼容措施，见 2.3。 |
| `details` | 只在 400/422 出现，数组，元素为 `{ field, message }`。`field` **必须带来源前缀**：`body.email`、`query.page`、`params.id`。 |
| `requestId` | 与响应头 `X-Request-Id` 一致，排障时用它串日志。 |

- **HTTP 状态码表达传输语义，`code` 表达业务语义**，两者不得互相顶替：禁止 `HTTP 200 + code: 400`，也禁止把 HTTP 状态当业务码。
- 5xx 一律只回通用文案，**不回传原始 `error.message`**（可能包含上游地址、连接串、内部路径）。
- **网关不得例外**：502 / 503 / 504 同样是这份信封，而且必须带 `requestId`——故障时最常看到的就是它。实现：`services/platform-api/src/http-errors.mjs` 的 `writeError()` / `writeRateLimited()`。
- 实现：各服务本地 `respond.js` 的 `fail(res, { status, code, message, details, requestId })`。

### 2.2 成功响应（**本轮不动**）

存量成功体保持原样，因为 4 个 Web 应用、2 个小程序与 Android 都在解析：

| 服务 | 成功体 |
| --- | --- |
| core-api | `{ success: true, ... }`、课程订单域 `{ code: 200, data }` |
| exam-api | `{ code: 0, data, message }`（多处 `res.data.code === 0` 判断） |
| notification-service | 各自既有结构 + `{ errcode, errmsg }` |
| campus-service | `{ ok: true, data }` |
| iot-service | 裸资源 JSON |

新端点（`/v1` 起）用 `ok(res, data, { page })` 输出 `{ ok: true, data }`；**不要把存量端点改成这个形状**。

### 2.3 为什么 `error` 与 `message` 同时保留

- `apps/core-admin`、`apps/admin-console`、两个小程序读 `data.error`（字符串）；
- `apps/exam-admin` 读 `data.message`；
- 一次性改成 `error: { code, message }` 会让这些读取点显示 `[object Object]`。

因此 v1 里的 `error` **仍是字符串**。等所有客户端都切到 `platform-browser-runtime` 的统一错误解析器后，再在 `/v1` 上收紧为嵌套对象；在那之前不要"顺手改"。

## 3. 错误码注册表

- 唯一来源：`packages/api-contract/error-codes.json`
- 运行时门面：`packages/api-contract/index.cjs`（`getErrorCode` / `httpStatusFor` / `messageFor`）
- 为什么放在 `packages/` 而不是 `config/`：每个镜像都要能读到它，而 `packages/` 已经被所有 Dockerfile 整体复制（`infra/docker/*.Dockerfile`），`config/` 只挂了单个文件。

条目形状：

```json
{ "RATE_LIMITED": { "http": 429, "zh": "请求过于频繁，请稍后再试。" } }
```

规则：

1. `code` 全大写蛇形、全局唯一、语义稳定（改名等于破坏契约）。
2. 一个 `code` 只能对应一个 HTTP 状态；`http` 是唯一真相，`errorHandler` 会以它为准。
3. `zh` 是兜底文案；调用方可以传更具体的 `message`，但不能传英文技术细节。
4. 新增 `code` **必须**同时登记，否则 `npm run check:contract` 失败。

校验的棘轮范围：只扫描**引用了 `respond` 助手**的文件里的 `code: 'X'`。存量端点没接助手，不会被一次性判红；改造到哪个文件，哪个文件就被收口。

## 4. 输入校验

- 每个写端点必须有 schema，覆盖 `body` + `query` + `params`。
- 统一 `abortEarly: false`、`stripUnknown: true`、`allowUnknown: false`。
- 失败返回 400 + `code: "VALIDATION_FAILED"` + `details[]`。
- 字符串声明 `max()`，数组声明 `maxItems`，金额/数量用 `integer()`/`precision()`。
- 沿用各服务既有校验库（core/exam 用 Joi，notify 用 zod），**不引入新的校验库**。

core-api 的 `middleware/validate.js` 支持两种写法：

```js
// 存量写法：只校验 body（现有 13 处保持不变）
router.put('/me', validate(updateMeSchema), updateMe);

// 新写法：三处来源都校验，与 exam-api 行为一致
router.post('/orders', validate({
    body: createOrderSchema,
    query: listQuerySchema,
}), createOrder);
```

注意：Express 5 把 `req.query` 定义成只读 getter，`validate` 对 query 采用**原地替换**，不要改成 `req.query = value`。

## 5. 分页

**请求侧不动**：`core-api` 的 `limit` 优先、`exam-api` 的 `pageSize` 优先，是面向不同客户端的有意设计（见 `engineering-standards.md §14.2`）。

**响应侧统一**：分页列表在既有响应上增量挂 `page`：

```json
{
  "success": true,
  "items": [],
  "total": 123,
  "page": { "page": 1, "pageSize": 20, "total": 123, "totalPages": 7, "hasMore": true }
}
```

实现：`utils/pagination.js` 的 `buildPageMeta({ page, limit, total })`。老客户端忽略 `page` 即可，不需要同步改造。

## 6. 限流

- 超限统一 429 + `Retry-After` 头 + `code: "RATE_LIMITED"` + `retryAfter` 秒数。
- **禁止**给 `express-rate-limit` 传字符串 `message`：v8 会走 `res.send(string)`，Content-Type 变成 `text/html`，前端 `response.json()` 直接抛 `SyntaxError`。用 `handler` + `fail()`。
- 限流维度写进注释（IP / 账号 / API Key），并在响应头暴露 `RateLimit-*`（`standardHeaders: true`）。
- 网关只做粗粒度保护，细粒度留给业务服务，避免两处各调一套阈值。

## 7. 健康检查与元信息

| 单元 | `/livez` | `/readyz` | `/version` | 保留的旧路径 |
| --- | --- | --- | --- | --- |
| platform-api（网关） | ✅ | ✅（下游 + 门户存储） | ✅ | `/healthz`（= readyz） |
| core-api | ✅ | ✅（MongoDB） | ✅ | `/health` |
| exam-api | ✅ | ✅（MongoDB） | ✅ | `/ready` |
| notification-service | ✅ | ✅（存储） | ✅ | `/healthz` |
| campus-service | ✅ | ✅（存储） | ✅ | `/api/ready`、`/api/health` |
| iot-service | ✅ | ✅（存储 + MQTT 订阅） | ✅ | `/api/ready`、`/api/health` |

- `/livez`：不查任何依赖，进程能响应就 200。
- `/readyz`：依赖就绪 200，否则 503；**不要把存活与就绪合并成一个 500**，否则 DB 抖动会触发容器重启风暴。
- `/version`：`{ status, service, version, node? }`，`version` 取 `PLATFORM_RELEASE_REVISION` / `GIT_SHA`，便于发布核对。
- 网关的 `service-targets.mjs` 优先探 `/readyz`，**只在 404 时**回落旧路径；503 必须如实判定为不就绪。
- 镜像 `HEALTHCHECK` 指向 `/readyz`；容器探针不要指向业务接口。
- 门户的服务注册表（`config/platform.services.*.json` 的 `healthPath`）本轮仍指向旧路径（`/api/ready`），这是**有意的**：它没有回落逻辑，跟随下一次发布再切，避免滚动发布期间误报 down。

## 8. 网关分发

`services/platform-api/src/router.mjs` 的 `SERVICE_ROUTE_TABLE` 是**唯一**的服务前缀清单：

```js
{ prefix: '/api/core', service: 'core', rewrite: { apiByDefault: true, preserve: ['/uploads', '/public'] } }
{ prefix: '/api/exam/client', service: 'exam', rewrite: {} }
{ prefix: '/api/exam', service: 'exam', rewrite: { apiByDefault: true },
  longRunning: ['/api/user/ai/question-analysis'] }
```

- 新增服务前缀只改这张表，不要再写 if/else。
- 匹配按**最长前缀**优先；`/api/exam/client` 不会被 `/api/exam` 抢走。
- 超时按**条目**配置（`longRunning`），不按路径字符串相等去猜；改 AI 端点路径时同步改这张表。
- `rewriteServicePrefix` 的保留清单包含 `/health`、`/healthz`、`/livez`、`/readyz`、`/version`、`/ws`、`/favicon`；新增探针路径要加进这个清单，否则会被改写成 `/api/readyz`。
- 通知服务的 `/api/notify`（精确命中改写成 `/notify`）与 `/api/app`（需额外授权）仍是手写分支，改动前先读注释。

## 9. 幂等与并发

- 创建类写接口接受 `Idempotency-Key`（**1–128 字符**，建议客户端用 ≥16 的随机串）。服务端只校验上限：短键不影响正确性，但碰撞概率高。命中时直接返回首次结果 + `Idempotent-Replay: true`。
- 键缺失时不允许静默跳过幂等。`courseOrderController` 的兜底是 `legacy:<digest>:<5 分钟桶>`，**只能防连点，不能防重试**——超过 5 分钟的同请求会再执行一次。新资源要么强制要求键（缺失返回 400），要么像 todos 一样用 `If-Match`。
- 可并发编辑的资源用 `ETag` + `If-Match`：缺失返回 `428`，不匹配返回 `409`/`412` 并回传当前快照。
- 幂等键必须与服务端唯一索引同时存在（只有键没有唯一索引，等于没有幂等）。
- 现成范本：`controllers/courseOrderController.js` 的幂等键 + `CourseOrderBatch` 唯一索引；`controllers/todoController.js` 的 `If-Match`/`revision` → 428 → 409。新资源照抄这两个，不要另发明一套。

## 10. 外部链接与 SSRF

下载解析（`services/platform-api/src/download-parse.mjs`）的规则：

1. 只接受 `http` / `https`，拒绝带凭证的 URL，只允许 80/443。
2. 平台白名单（douyin / iesdouyin / haijiao）跳过 DNS 校验；其余主机名**必须**解析，任何一条结果落在内网/保留网段即拒绝。
3. 内网判定覆盖 IPv4 私有段、CGNAT、链路本地、组播、IPv6 ULA/链路本地、IPv4-mapped、NAT64 与十进制/十六进制 IP 变体。
4. 短链跳转**逐跳校验**，最多 5 跳；不要用 `redirect: 'follow'` 把跳转目标交给运行时。

## 11. 契约校验清单

| 命令 | 作用 |
| --- | --- |
| `npm run check:contract` | 注册表合法性 + **全量扫描 `services/` 的 code 字面量** + 基线漂移检查 + 自测 |
| `npm run check:gateway` | 网关路由表、探针路径、代理超时、错误信封与限流响应头 |
| `npm run check:core` / `check:exam` / `check:iot` / `check:notification` / `check:campus` | 各服务的语法 + lint + 单测 |

契约测试断言的不变量：404 是 JSON、429 是 JSON 且带 `Retry-After`、CastError 映射 400、`/livez` 不依赖数据库、网关保留探针路径不被改写、网关 5xx 也是统一信封。

错误码的棘轮分两层：

- **注册表**（`packages/api-contract/error-codes.json`）：唯一真相，63 个码。
- **基线**（`packages/api-contract/error-code-baseline.json`）：21 个存量码按「code → 允许出现的文件」放行。**新代码不允许往基线里加**；某个码登记后，对应基线条目必须删除，否则 `check:contract` 失败。

## 12. 字段命名与序列化

新端点（`/v1` 起）必须遵守；存量不做批量改名。

| 项 | 规则 |
| --- | --- |
| 字段名 | lowerCamelCase。禁止新增 snake_case，也禁止 `createTime` 这种"表字段直出"的命名 |
| 时间 | ISO 8601 UTC 字符串：`2026-10-30T07:44:22.000Z`。新字段一律用它 |
| 布尔 | 真 `true` / `false`。不用 `0`/`1`，也不用 `"1"` |
| 金额 | 整数分（`amountCents`）。不要用浮点元 |
| 空值 | 对象字段无值时给 `null` 并**保留键**；数组无值时给 `[]`。不要省略键 |
| 枚举 | 首发即稳定。新增值只能追加，不能改既有值的含义 |

存量已经有三套风格，**不要为了整齐去统一**：

- core-api：`createdAt`（模型里用 `Number` 存 `Date.now()`，响应是**数字**时间戳）
- exam-api：`createTime` / `updateTime`（mongoose `timestamps`，响应是 **ISO 串**）
- campus-service：`created_at` / `updated_at`（snake_case）

`createdAt` 在 core-api 是数字、在别处是字符串，**同名字段类型不同**。客户端解析前先判类型，不要直接 `new Date(value)`。

## 13. 排序、过滤与搜索

此前全仓只有零散的 `status` / `keyword` / `type`，没有排序约定；新增列表接口按此执行：

- 排序用单参数 `sort`，`-` 表示降序，多字段逗号分隔：`?sort=status,-createdAt`
- 排序字段**必须走白名单**，禁止把 `sort` 直接拼进 Mongo 的 `sort()`（注入 + 走不了索引）
- 排序要有稳定兜底（末尾追加 `_id`），否则翻页会重复或漏项
- 过滤参数直接用资源字段名，多值逗号分隔：`?status=Completed,Failed`（不要用 `status[]=`）
- 全文搜索用 `q`，不要在同一个服务里并存 `keyword` / `search` 两套
- 分页沿用 §5，不要在列表接口里再发明 `offset` / `skip`

## 14. 成功状态码

- 创建 `201` + `Location` 指向新资源（`courseOrderController` 的批量下单是现成例子）
- 删除 `204`，无响应体
- 其它成功一律 `200`
- 批量部分失败用 `207`，见 §16
- **存量一律 200 的不要顺手改**：`core-admin` 存在 `status === 200` 判断，改成 201 会走到错误分支。只有新端点用 201 / 204

## 15. 文件上传

- `multipart/form-data`，文件字段名固定 `file`（`core-api/routes/settings.js` 的备份恢复即此约定），元数据放普通字段
- 必须声明 `limits.fileSize`；超限返回 `413` + `PAYLOAD_TOO_LARGE`，不要让它掉成 500
- MIME 与扩展名**双白名单**校验，不信任 `Content-Type`
- `memoryStorage` 只用于 ≤20MB；更大的走流式落盘
- 响应给出可直接使用的资源：`{ id, url, size, mime }`

## 16. 批量与长任务

- 批量写单次上限 100 条（课程订单按业务收紧到 20 条），并在 schema 里用 `maxItems` 卡住
- 批量结果：全成功 `200`；部分失败 `207` + `{ items: [{ ok, code?, message? }] }`。**不允许**"部分失败还返回 200 空 body"
- 预期耗时 >10s 的操作不要占着请求：返回 `202` + `Location: /jobs/{id}`，任务资源至少有 `status`（`queued|running|succeeded|failed`）、`progress`、`result`、`error`
- 现状：`/api/user/ai/question-analysis` 仍同步执行，靠网关 `longRunning` 的 60s 超时兜住。新增同类能力优先走 202，不要继续加长超时

## 17. 什么算破坏性变更

判定标准，用来决定是否必须新开 `/v1`：

**破坏性——必须走 `/v1` 或改为新增字段**

- 删除 / 重命名字段
- 改字段类型（含 number → string、可空 → 非空）
- 收紧校验：新增 required、缩小 `max` / `min`、减少枚举取值
- 改枚举值的**含义**（不是新增值）
- 改分页默认页大小，或改 `total` 的口径
- 改已有 `code` 的语义，或把某个 `code` 换一个 HTTP 状态
- 状态码变更（把 200 改成 201 / 204 也算）

**非破坏性——可以直接发**

- 新增可选字段、新增端点、新增错误码
- 放宽校验（去掉 required、放大 `max`）
- 新增枚举取值（前提：客户端对未知值有兜底）

旧路径下线前至少保留一个发布周期，并带 §1 的 `Deprecation` / `Sunset` 头。

## 18. 仍未统一的部分（已知边界）

以下差异是**已知且有意保留**的，改动它们需要单独议题：

- notification-service 的 `{ errcode, errmsg }`：外部对接方在解析，改动等于破坏第三方契约。
- campus-service 部分路径只回 `{ ok:false, error }`，没有 `code`：3160 行手写路由，按"改到才收口"推进。
- 成功体仍是 5 种。
- `/v1` 尚未引入；OpenAPI 尚未覆盖全部端点（当前只有 notification-service 提供 `/openapi.json`）。
- 幂等与 `If-Match` 仍是"按资源手写"，尚未抽成通用中间件。
- **校验文案不全是中文**：core-api 的关键 schema 写了 `.messages()`，其余 schema 与 exam-api 多数还在用 Joi 默认的英文文案（`"name" is required`），经 `details[].message` 直接到了界面上。改到哪个 schema 就补哪个，不批量重写。
- **门户（admin-console）还有 112 个未登记错误码**：它在本规范的扫描范围之外（`services/` 才算服务单元）。要收口需要单独一轮，把门户的码按前缀分组登记。
- **压缩与缓存头不一致**：只有 exam-api 引入了 `compression()`；campus-service / iot-service 的 API 响应没有 `Cache-Control`。网关层做压缩会改变 `Content-Length`，属于独立议题。
- **`PLATFORM_READ_ONLY` 名不副实**：网关的 `rejectReadOnlyWrite` 用它表达"只读角色"，而注册表里它是"系统只读状态"。code 已被测试与前端引用，暂不改名。
