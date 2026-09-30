# Engineering Standards

工程规范总纲。本文件是**唯一权威事实来源**：当其它文档（README、AGENTS.md、注释）与本文件冲突时，以本文件为准；当本文件与代码冲突时，**以代码为准并修正本文件**。

规范的目标不是"统一风格"本身，而是：让改动可预测、让门禁可复现、让新人（含 AI 助手）不需要靠猜。

---

## 1. 仓库边界

| 目录 | 职责 | 不做什么 |
| --- | --- | --- |
| `apps/` | 用户直接使用的前端：3 个管理台、官网、2 个微信小程序、Android 应用 | 不放可复用的后端逻辑 |
| `services/` | 可独立测试的后端模块与容器入口 | 不直接读写其它服务的数据库 |
| `packages/` | 跨服务共享的轻量基础能力（平台身份签发、浏览器运行时） | 不依赖任何 `services/` 或 `apps/` 代码 |
| `automation/` | 不常驻服务器的任务（CT8 自动化） | 不进入生产容器 |
| `config/` | 不含密钥的服务注册表与拓扑契约 | **严禁**写入任何密钥或账号 |
| `docs/` | 架构、运维、发布与工程规范 | — |
| `infra/` | Docker、反向代理、部署配置 | — |
| `scripts/` | 工作区维护与 CI 辅助脚本 | 不放业务逻辑 |

架构与服务所有权的细节见 [architecture.md](architecture.md)；部署与故障处置见 [operations.md](operations.md)。

**功能归属规则**：新功能必须扩展规范所有者或调用其内部 API。兼容路由可以临时重定向或代理，但**不得包含该功能的第二份实现**。所有者清单见 [architecture.md](architecture.md) 的 *Feature ownership*。

---

## 2. Node 与包管理

- 运行时基线 **Node.js ≥ 20.11**（根 `package.json` 的 `engines`）。这个下限不是随手写的：`scripts/` 中有多个脚本使用 `import.meta.dirname`（需 ≥ 20.11），`check-official-website-build.mjs` 使用 `fs.readdirSync(dir, { recursive: true })`（需 ≥ 20.1）。CI 实际只测 **Node 24**，且**没有** Node 版本矩阵，所以低于 20.11 的组合从未被验证。`services/*` 与 `apps/*` 中另有若干子项目声明了 `>=20.0.0`，尚未与根下限对齐。
- 每个子项目**独立** `package.json` + `package-lock.json`，不使用 npm workspaces。安装入口是 `npm run install:ci`（即 `scripts/install-workspace.mjs`），它按固定顺序对每个子项目执行 `npm ci`。
- **新增子项目必须同时登记到三处**，否则不会被安装、审计或校验：
  1. `scripts/install-workspace.mjs` 的 `projects`
  2. `scripts/audit-workspace.mjs` 的项目列表
  3. 根 `package.json` 相应的 `check:*` 脚本
- 依赖**只提交 `package-lock.json`，不提交 `node_modules`**（已由 `.gitignore` 覆盖）。

---

## 3. 包命名与元数据

- 包名统一为 **`@my-platform/<目录名>`**，全部 `private`。例外仅有 `examples/` 下的示例工程。
- 每个子项目 `package.json` 必须满足：
  - `name` 符合上述约定；
  - `private: true`（除示例外）；
  - `description` 非空（中文即可，说明用途）；
  - 若存在入口文件，`main`/`exports` **必须指向真实存在的文件**；
  - 若目录内有自动化检查，必须提供 `check` 脚本（见 §5）。
- `package.json` 使用 **2 空格缩进**，与其它 JSON 一致。

---

## 4. 缩进与格式化（重要例外）

根 [.editorconfig](../.editorconfig) 是格式化约定的权威来源：

- 默认 **2 空格**缩进，LF 换行，UTF-8，文件末尾留空行，去行尾空格（Markdown 例外）。
- **已声明例外**：`services/core-api/**.js` 与 `services/exam-api/**.js` 使用 **4 空格**。这两个目录是真正意义上的单一风格（core-api 约 4385 行 4 空格 vs 12 行 2 空格；exam-api 约 4884 行 4 空格 vs 0 行），且 `services/exam-api/.eslintrc.json` 用 `"indent": ["error", 4]` 强制执行。

**未被声明为例外的混排区域**（如实登记，不是许可）：`apps/core-admin`、`apps/exam-admin`、`apps/admin-console`、`apps/official-website` 以及两个小程序都存在同一目录内 2 空格与 4 空格文件并存的情况（例如 `exam-admin` 约 20 个文件 4 空格、4 个文件 2 空格；`admin-console` 两者接近各半）。

规则：

- **不要把既有代码整体重排缩进**，无论哪个目录。缩进改动会淹没真正的逻辑改动，使 review 与 `git blame` 失效。
- 新增文件**一律 2 空格**。若在既有 4 空格文件内改动，**跟随该文件**已有缩进，不要顺手重排整文件。
- 若某个目录确实要长期采用 4 空格，必须在根 `.editorconfig` 中显式声明、在本文件登记，并且**该目录已是单一风格**。当前不存在这样的前端目录，因此不要为上面这些混排目录添加豁免——那会把混乱固化成标准。

**关于格式化器**：仓库**没有** Prettier 或任何格式化器，根 `package.json` 也没有 `devDependencies`。因此不存在"自动格式化"这一步；缩进只能靠 `.editorconfig`（编辑器支持）与 review。不要声称格式化已被自动校验。


---

## 5. 质量门禁

唯一入口：

```powershell
npm run check
```

它由根 `package.json` 以 `&&` 串联 18 个子检查组成，**第一步是 `check:conventions`**——一个只读的仓库约定校验器（`scripts/check-workspace-conventions.mjs` + `scripts/lib/workspace-conventions.mjs`）。它把本文件的以下规则变成可执行的断言，因此规范不会悄悄漂移：

- 每个自带 `package-lock.json` 的项目都登记在 `scripts/install-workspace.mjs` 与 `scripts/audit-workspace.mjs`，且两处列表一致；
- 每个这样的项目都有 `check` 脚本，且根 `check:*` 链能到达它；
- 包名符合 `@my-platform/<项目目录名>`（嵌套项目按**所属项目**目录命名，如 `apps/smart-campus-miniapp/miniprogram` → `@my-platform/smart-campus-miniapp`）；
- `private: true` 与 `description` 非空；
- `main`/`module`/`types` 若为相对路径则必须真实存在；
- `package.json` 为 2 空格缩进（除非该路径在 `.editorconfig` 中声明了 4 空格例外）；
- `config/service-topology.json` 的每个 `registryId` 都存在于两个 `config/platform.services.*.json` 中。

新增规则时改 `scripts/lib/workspace-conventions.mjs`、在 `scripts/workspace-conventions.test.mjs` 补一条单测、并在本节登记，**三处同一次提交完成**。

**新增或修改任何子项目时，必须让该子项目的 `check` 保持可通过，并在根 `check` 中可达。**

子项目 `check` 的既有范式：

- **服务**：`npm run lint && node --check <入口> && npm test`（如 `notification-service`、`exam-api`）。
- **前端应用**：`npm run lint && npm test && npm run build`（如 `admin-console`）。
- **小程序**：类型检查 + 结构检查脚本 + `node --test`（如 `apps/exam-miniapp`、`apps/smart-campus-miniapp/miniprogram`）。

其它必须知道的约定：

- 测试一律使用 Node 内置测试运行器 `node --test`，断言使用 `node:assert/strict`。**不要引入 jest / mocha / vitest。**
- 服务测试文件放在 `test/`，命名 `*.test.js`；包测试为 `*.test.cjs` 或 `*.test.mjs`，与模块系统一致。
- 测试**不连接真实数据库**：使用内存替身（`MemoryDatabase`、`createMemoryNotificationStore`、`MemoryCampusRepository`、`Fake*Model`）。需要真实进程时用 `spawnSync(process.execPath, ...)` 起子进程。
- Lint 配置有两代并存：**flat config（eslint 9）是新代码的标准**（`eslint.config.js` / `eslint.config.mjs`）。`services/exam-api` 仍在用旧式 `.eslintrc.json`（eslint 8），迁移它属于待办而非当前要求。
- `services/core-api` 目前**没有** eslint 配置、依赖或 lint 脚本，因此它没有 lint 覆盖。补齐它是已知待办；在此之前不要把"lint 通过"当作 core-api 的质量证据。

CI（[ci.yml](../.github/workflows/ci.yml)）在 `main` 推送与 PR 上运行，共 6 个 job：

| job | 作用 | 触发范围 |
| --- | --- | --- |
| `quality` | `install:ci` → `check` → `audit:prod` | push 与 PR |
| `repository-security` | Trivy 扫描依赖/密钥/配置，HIGH/CRITICAL，`exit-code: 1` | push 与 PR |
| `codeql` | javascript-typescript 分析 | push 与 PR |
| `image-targets` | 按改动文件解析需要重建的镜像目标 | push 与 PR |
| `container-images` | 构建并推送 GHCR 镜像 | push 与 PR（PR 不推送） |
| `docker-smoke` | 起完整 compose 栈做冒烟（readiness、官网、IoT、会话与指标、Mongo 隔离） | **仅 PR 与手动触发** |

**关键事实**：`docker-smoke` 的条件包含 `github.event_name != 'push'`，因此 **`main` 推送时不跑完整栈冒烟**；`container-images` 的 `needs` 只含 `quality`/`repository-security`/`codeql`/`image-targets`，**不含** `docker-smoke`。也就是说 main 推送会发布 GHCR 镜像，而完整栈冒烟被跳过。真正在发布前做"精确候选镜像"冒烟的是 ACR 流水线（[aliyun-acr.yml](../.github/workflows/aliyun-acr.yml)），它先等待该 commit 的 CI 成功，再冒烟，最后才把可移动的 `*-latest` 部署标签指向已验证的候选 digest。

`.github/workflows/` 下只跟踪本仓的 5 个流程；`automation/ct8-automation/.github/workflows/ssh-login.yml` 属于自动化子项目，**不在本仓根 `.github/workflows/`**，因此无法从本仓直接 dispatch。

---

## 6. 模块系统与入口

三种形态在仓内并存，**新增代码按目录既有形态书写，不要跨服务统一**：

| 形态 | 子项目 |
| --- | --- |
| `"type": "module"` + ESM | `platform-api`、`campus-service`、`platform-browser-runtime`、三个管理台、官网、`ct8-automation` |
| 显式 `"type": "commonjs"` | `notification-service` |
| 无 `type` 字段（隐式 CJS） | `core-api`、`exam-api`、`iot-service`、`platform-auth` |

入口文件命名**不统一**（`server.mjs`、`server.js`、`src/server.js`、`src/index.js`），这是既成事实。因此：

- 新增服务时，`main`/`start`/`check` 三者必须指向**同一个真实存在的入口**。
- 修改入口位置时，必须同步 `package.json` 的 `main`、`start`、`check` 与 Dockerfile。

---

## 7. 后端服务约定

- **配置**：早期服务用 `require('dotenv').config()`；`exam-api`、`notification-service` 有集中配置模块；`campus-service` 自实现 `loadDotEnv`；`iot-service` 无 dotenv，另有持久化配置存储。新增服务优先采用集中配置模块，并在缺失关键环境变量时**快速失败**。
- **日志**：winston（core-api）、pino + pino-pretty（exam-api）、morgan（notification-service）、自实现 JSON logger（campus-service）、`console.*`（iot-service、platform-api）。**不要为了统一而替换既有日志库**——日志格式与现有运维检索、审计链路绑定。
- **校验**：`joi`（core-api 用 `schemas/`，exam-api 用 `src/validators/`，后者还校验 query/params 并 `stripUnknown`）、`zod`（notification-service）、其余为手写规范化。新增或改动接口时沿用所属服务的既有校验库。
- **数据层**：`core-api`、`exam-api` 用 mongoose，模型在 `models/` 或 `src/models/`；`notification-service`、`campus-service`、`iot-service` 用原生 `mongodb` 驱动 + 单一仓储模块。
- **数据库命名**：一个服务一个库，**禁止跨服务直接读对方数据库**。库名：`platform_app`、`core_app`、`exam_app`、`campus_app`、`iot_app`、`notification_app`。env 变量名不统一（`MONGO_URI`、`MONGODB_URI`、`CORE_MONGODB_URI` 风格各异），以各服务 `package.json` 所在目录的 `.env.example` 为准。
- **响应形态**：五种并存（`{success}`、`{code,data,message}`、`{errcode,errmsg}`、`{ok,data}`、裸 JSON + `{error,code}`）。**改动接口时保持所属服务现有形态**；跨服务的形态统一属于独立议题，不在日常改动范围内。

### 服务间通信（安全关键）

- 浏览器 → 网关 → 业务服务的用户身份走 **`x-my-platform-sso`**：Ed25519 签名票据、绑定目标服务/方法/路径/查询参数、默认 15 秒有效。各服务有一个 7 行的验签包装器，只有 `audience` 不同（`core`/`exam`/`campus`/`iot`/`notify`）。
- 服务 → 服务（`core-api`、`campus-service` → `notification-service`）走 **HMAC-SHA256 服务请求签名**：`x-my-service-caller`/`-nonce`/`-signature`/`-timestamp`，有效期 30 秒并校验 nonce 防重放。
- 平台私钥只在主容器；独立容器（campus/iot/notification）**只持有公钥**。
- **严禁**绕过网关让公网请求直连业务容器；**严禁**在新增代码里自造第二套内部认证头。

---

## 8. 前端应用约定

四个 Web 应用，**四个不同的技术栈**，且都通过 Vite 构建、都是 ESM（`"type": "module"`）：

| 应用 | 形态 | 技术栈 | Vite | 开发端口 |
| --- | --- | --- | --- | --- |
| `admin-console` | 单包内含 Express 服务端 + React 客户端 | React 19 + `lucide-react`，服务端 Express 5 + `mongodb` | 7 | 5180（API 8788） |
| `core-admin` | 纯前端 SPA | React 19 + `react-router` + Ant Design | 7 | 5173（默认） |
| `exam-admin` | 纯前端 SPA | Vue 3 + `vue-router` + Element Plus | 8 | 5173 |
| `official-website` | 单页官网 | 无框架，手写 HTML + `main.js` | 5 | 5188 |

**保持技术栈多样是有意的现状，不要试图统一框架。** 但以下几点是强制约定：

- **无 TypeScript**：四个应用都没有 `tsconfig.json`。不要未经决策就引入 TS。
- **共享能力必须来自 `packages/`**：`core-admin`、`exam-admin` 通过 `@my-platform/platform-browser-runtime` 获取 SSO、`fetchWithTimeout`、体验上报等；`admin-console` 的服务端通过 `@my-platform/platform-auth` 的 `issueServiceRequest` 签名。**不要在应用内复制这些实现。**
- **`check` 三件套**：前端应用的 `check` 必须是 `npm run lint && npm test && npm run build`。
- **测试**放在 `test/*.test.js`，用 `node --test`。`admin-console` 提供共享测试夹具 `test-support/fetch-server.js`，新测试优先复用它。

### 已知的实质性问题（改前端前必读）

- **`exam-admin` 的 lint 几乎不校验任何东西**：`eslint.config.js` 只启用 `no-debugger`/`no-dupe-keys`/`no-unreachable` 三条规则，没有 `extends` `js.configs.recommended`、没有 `globals`，虽然 `vue-eslint-parser` 在依赖里但**没有装 `eslint-plugin-vue`**，因此 Vue 模板与组件规则完全不生效。所以"exam-admin lint 通过"**不能**当作质量证据。
- **`official-website` 没有 lint、没有 test、没有 check**，也没有 `.gitignore`。它的唯一校验是根 `check:website`（`node --check main.js` 语法检查 + `vite build` + `scripts/check-official-website-build.mjs` 对产物的断言）。
- **`admin-console` 的 lint 会报约 31 条 react-hooks 警告**（`set-state-in-effect`、`exhaustive-deps`），ESLint 对 warning 返回 0，所以门禁仍通过。这些是真实的技术债，不是误报。
- **无共享设计令牌**：`packages/` 里没有 token 包，四个应用各有独立的 CSS 变量命名空间；深色模式机制也不一致（`admin-console`、`official-website` 用 `:root[data-theme="dark"]`，`core-admin` 用 `html.dark` + 预绘制脚本，`exam-admin` 无主题切换）。
- **`exam-admin/src/assets/css/admin.css` 在同一个文件内重复打开 `:root` 三次**，`--primary-color` 依次为 `#1b6ef3` → `#1d63e9` → `#1f5fbf`（最后一个生效），`--border-radius` 为 20px → 22px → 12px。改这个文件的配色前必须先合并重复的 `:root`。
- **重复实现**：`sequentialPoller.js` 在 `core-admin` 与 `exam-admin` 各有一份且内容不同（无 SHA 相同）；`admin-console/src/client/experience.js` 把 `platform-browser-runtime` 的 `reportExperience` 与 FNV-1a 哈希整体抄了一份且已经漂移；`readCookie` 有 3 份副本；两个应用各有一套种子里生成的 SVG 头像生成器；四套 HTTP 层各自重复 `timeout = 12000`。
- **`core-admin` 与 `exam-admin` 的开发端口都是 5173**（`core-admin` 的 `vite.config.js` 未设置 `server.port`），同时启动会冲突。
- **`core-admin/README.md` 已过期**：标题仍是 `# admin-web`，写"React Router 7"而实际依赖是 8.x。

---

## 9. 微信小程序约定

- 两个小程序：`apps/exam-miniapp`、`apps/smart-campus-miniapp`（源码根 `miniprogram/`）。**原生小程序**，不使用 Taro/uni-app。TypeScript 为主，允许按目录既有情况混用 `.js`。
- 每个小程序已有**结构不变量检查脚本**，修改时必须一并通过，它们校验的是真实约束而非风格：
  - `exam-miniapp/scripts/check-miniprogram-paths.js`：相对 import/`@import`、`usingComponents`、页面 `.json` 是否齐全，以及被禁的旧根路由。
  - `exam-miniapp/scripts/check-miniprogram-source.js`：乱码字符、**禁用 `?.` 与 `??`**、考试流程关键不变量（服务端截止时间校准、恢复策略、进度上传串行化）。
  - `exam-miniapp/scripts/check-compliance-config.js`：运营主体名称与客服邮箱不得为占位值。**发布前必须手动执行** `npm run check:compliance:trial|release`（两脚本已被文档要求，但未接入 CI）。
  - `smart-campus-miniapp/miniprogram/scripts/check-miniprogram.mjs`：非法 JSON、AST 语法、`usingComponents`、页面文件齐全、登录分包必须惰性加载、登录 logo 体积/尺寸预算、待办 outbox 与存储命名空间不变量。
- **`?.` / `??` 的差异是有意的**：exam-miniapp 全面禁用（其检查脚本会失败），smart-campus 目前在 9 个文件中有约 35 处。新增 exam-miniapp 代码时不要使用这两个语法。
- 路由必须集中在 `utils/routes.ts`（exam）或 `utils/constants.ts` 的 `ROUTES`（smart）。**新增页面必须登记并复用常量**，不要硬编码路径字符串；smart 现存 9 处硬编码属于待清理债务。
- 基础地址：exam 在 `miniprogram/config/runtime.ts`，smart 在 `miniprogram/utils/config.ts`。发布前必须替换占位运营信息。
- `project.private.config.json` 由 `.gitignore` 排除，**不得提交**。

---

## 10. Android 约定

设计规范见 [apps/android-app/AGENTS.md](../apps/android-app/AGENTS.md)（唯一的设计事实来源，含脚手架、毛玻璃、按钮体系、动效、无障碍红线）。

工程事实：

- 目录名 `apps/android-app`，Gradle 根项目名 `MYControl`，命名空间 `cn.pxyb.mycontrol`，模块 `:app`、`:baselineprofile`、`:core:network`、`:core:security`。
- 版本只从 `gradle/libs.versions.toml` 取。新增依赖**必须**登记到版本目录，不得在 `build.gradle.kts` 里硬编码坐标与版本。
- 单测在 `app/src/test/java/**`，命名 `*Test.kt`，JUnit 4。**没有** instrumented 测试；设备侧代码只有 baseline profile 模块。
- CI 门禁（[android-ci.yml](../.github/workflows/android-ci.yml)）：
  `./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:lintDebug :app:assembleDebug`
- **没有** detekt / ktlint / spotless。因此 Kotlin 风格靠 review 与 `lintDebug`，不要声称"格式化已自动校验"。

---

## 11. 环境变量与密钥

- `.env` 与任何 `**/.env` **绝不提交**（已在 `.gitignore`）。提交的只有 `.env.example`。
- `.env.example` 必须与 `scripts/validate-deployment-env.mjs` 的校验规则保持一致；密钥名变更时同步更新 `scripts/check-ci-env-contract.mjs` 与 CI 缓存/契约。
- 生产环境校验会拒绝弱会话密钥、公开模板密钥、占位值；`create-ci-env.mjs` 生成的 `.env.ci` 是一次性环境，仅用于 Docker 冒烟测试。
- 已被自动校验的部分（可依赖）：`validate-deployment-env.mjs` 的 26 个必需项 + 8 个可选项 + 2 个 Base64URL-32 字节密钥 + 跨键取值唯一性；以及 `check-ci-env-contract.mjs` 保证 `compose.yml` 中每个 `${VAR:?}` 都由 `create-ci-env.mjs` 生成。
- **未被该规则覆盖的缺口**：约 62 个被 compose 或脚本引用、但**不在 `.env.example`** 中的变量名，其中运维相关的包括 `BACKUP_RETENTION_DAYS`、`PLATFORM_BLACKBOX_*` 系列、`LEGACY_CAMPUS_DB`、`LEGACY_IOT_DATA_DIR`、`PLATFORM_BACKUP_*` 与 `PLATFORM_RESTORE_COMMAND`。它们多数有 compose 内置默认值。**新增这类变量时同步补进 `.env.example`**，否则运维无法从模板发现它。
- **严禁**把密钥、令牌、真实账号、私钥写入 `config/`、文档、注释或测试固件。

---

## 12. 脚本约定（`scripts/`）

- 一律 `.mjs`（根 `package.json` 无 `"type"` 字段，`.mjs` 是显式声明 ESM 的机制），100% ESM：**不使用 `require(`**。
- 命名 kebab-case、动词开头（`check-*`、`verify-*`、`backup-*`、`resolve-*`）。
- 失败必须产生**非零退出状态**并打印可定位的完整原因（不要只打印 `Error`）。仓内两种写法都合法且都在用：`process.exit(1)`（9 个脚本，多为校验器）与 `process.exitCode = 1`（8 个脚本，多为 async/转换脚本）。新脚本择一即可，但不要"打印了错误却返回 0"。
- 需要共享的进程级工具放在 `scripts/lib/`；已有 `scripts/lib/npm-command.mjs` 解析 npm CLI（含 Windows `npm.cmd` 回退），**不要在新脚本里再写 `process.platform === 'win32' ? 'npm.cmd' : 'npm'`**。
- 只读校验脚本**不得**修改仓库内容（`check-*` 只读，`migrate-*`/`backup-*` 才允许写入）。
- 写入密钥或备份产物的脚本必须使用 `0o600`/`0o700` 权限。

**测试登记机制（重要）**：根 `package.json` 用**显式文件名**而非 glob 列出测试文件（`node --test scripts/a.test.mjs scripts/b.test.mjs …`）。因此**新增 `*.test.mjs` 后必须手动加入根 `check:*` 脚本，否则它永远不会被执行**。当前有 11 个测试文件、22 个脚本完全没有测试，属于已知覆盖缺口而非可接受标准。

---

## 13. Git 与提交

历史提交信息质量参差（存在"修复"、"做了优化"这类无信息量的标题，也有单个提交塞入多个特性的大段落）。从本规范起：

- 标题写**做了什么**，可读的祈使句，中文即可，但必须有信息量。避免"修复"、"更新"、"优化"单独成题。
- **一个提交只做一件事**。缩进重排、依赖升级、功能改动**不要混在同一提交**。
- 正文（可选）说明**为什么**改，以及无法从 diff 看出的取舍或已知遗留。
- 不要在提交信息里粘贴大段功能清单当作正文；那属于变更日志。
- **分支**：`main`，直接推送；无 PR 强制要求，但 CI 必须通过。
- 发布与镜像推送：`main` 推送会按改动文件重建受影响的 ACR 镜像（见根 README 与 [aliyun-acr.md](aliyun-acr.md)）。

---

## 14. 已知偏差与技术债

以下为**已核实**的偏差，登记在此以免被反复当作"新发现的 bug"，也避免有人"顺手统一"而改变行为。修或不修需要单独决策。

1. **依赖大版本分裂**：express 5 与 4.22（notification-service 仍为 4）；mongoose 9 与 8；eslint 9 与 8；`express-rate-limit` 8 与 7；dotenv 17 与 16 与"不用 dotenv"。升大版本需逐个服务回归，**不要夹在其它改动里做**。
2. **分页参数的优先级相反**：`core-api/utils/pagination.js` 优先 `limit`，`exam-api/src/utils/pagination.js` 优先 `pageSize`（两者其余逐字节相同）。这是面向不同客户端的有意分歧，**两侧都已加注释锁定意图，禁止"对齐"**。
3. **重复实现**：SSO 验签包装器 ×4、`platformSsoAccountService.js` ×2、`httpShutdown.js` ×2、通知客户端 ×2、请求 ID 中间件 ×2、限流器 ×4、静态资源与密码哈希各 ×2、分页 ×3。抽取到 `packages/` 是候选工作，但会触及多服务信任边界，需独立评估。
4. **`services/core-api` 无 lint 覆盖**（无配置、无依赖、无脚本）。
5. **`services/exam-api` 使用旧式 `.eslintrc.json` + eslint 8**。
6. **`services/iot-service` 的 `check` 不含 `test`**，由根 `check:iot` 在外部补跑。
7. **小程序**：`smart-campus-miniapp` 的 `tsconfig.json` 排除了不存在的 `scratch` 目录；其 `preloadRule` 校验因 `app.json` 无 `preloadRule` 而暂为空转；`ROUTES` 缺 `SCAN` 与热泵设置项，导致 9 处硬编码路径。
8. **前端**：`exam-admin` lint 实质无效（3 条规则、无 `eslint-plugin-vue`）；`official-website` 无 lint/test/check/`.gitignore`；`admin-console` 约 31 条 react-hooks 警告长期存在；无共享设计令牌包；`core-admin` 与 `exam-admin` 开发端口同为 5173；`exam-admin/src/assets/css/admin.css` 内重复打开 `:root` 三次导致同名令牌三重定义；`core-admin/README.md` 标题与依赖版本已过期。详见 §8。
9. **Android**：`ui/feature` 中约 150 处 `spacedBy(8|10|14.dp)` 与"12.dp 标准"不符；`TextButton` 仍散落于 6 个文件（无对应胶囊化组件）；存在若干零引用组件（`AppAvatar`、`AppFilterBar`、`AppMetricDashboard`、`AppGroupedCard`、`ImmersiveHeader`、`ModernHeaderIconButton`）。
10. **前端 Vite 大版本四分**：5 / 7 / 7 / 8。与第 1 条同理，升级需独立评估。
11. **小程序 README 过期**：曾描述不存在的 `backend/`、`admin-web/`、`admin-server/` 等目录（已在本轮修正）。若再发现文档描述不存在的东西，按"文档服从代码"处理：改文档，不改代码。
12. **CLI 惯用法不统一**（风格问题，无行为风险）：入口守卫在 `pathToFileURL(...).href === import.meta.url` 与 `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)` 之间分裂；参数解析有手写三种风格；失败有 `process.exit(1)` 与 `process.exitCode = 1` 两种。新脚本按 §12 任选其一即可，不必回改存量。
13. **镜像目标/别名/标签映射有三份副本**：`config/image-build-targets.json`（唯一被 `resolve-image-targets.mjs` 校验）、`scripts/trigger-acr-build.mjs` 内硬编码的 `TARGETS`（**完全不读配置文件**）、以及 `aliyun-acr.yml` 中的 bash `declare -A`（且在同一 workflow 内重复了一次）。三者目前一致，但后两份无任何校验。
14. **ACR 触发路径与镜像目标图不一致**：`config/image-build-targets.json` 把 `infra/docker/compose.split.yml` 映射到 `platform` 目标，但 `aliyun-acr.yml` 的 32 项 `paths:` 允许列表不含该文件。结果是改回滚叠加层按图应重建 platform 镜像，却不会自动触发，只能手动 dispatch。
15. **GHCR 发布不受完整栈冒烟约束**：`main` 推送时 `docker-smoke` 被跳过，而 `container-images` 的 `needs` 不含它，因此 GHCR 会发布未经完整栈冒烟的镜像。ACR 路径反而有精确候选冒烟——两套发布链的保证强度不同，见 §5。
16. **无自动化观测的删除决策逻辑**：`scripts/qiniu-android-retention.mjs` 导出决定"哪些 APK 会被删除"的函数，却既无单测也未被根 `package.json` 引用（因此连 `node --check` 都不跑）；`scripts/acr-image-probe.mjs` 的删除守卫同样无测试。另有 8 个脚本完全不在 `npm run check` 覆盖内。
17. **`.env.example` 缺 62 个被引用变量**（详见 §11），其中 `BACKUP_RETENTION_DAYS` 尤其容易误导：代码默认且**硬上限为 14 天**，而文档曾写 30 天（已修正文档）。该变量至今不在模板中。
18. **`automation/ct8-automation/README.md` 曾与自身 workflow 矛盾（本轮已修）**：README 曾记录 7 个 `PANEL_*`/`*_SELECTOR` 变量与 `SSH_PRIVATE_KEY`/`SSH_PASSPHRASE`，但 `ssh-login.yml` 一个都不读（它硬性要求 `SSH_HOST` + `SSH_PASSWORD`，用 `sshpass`），而 workflow 真正使用的 `RESULT_CALLBACK_*`、`EMAS_*` 反而未记录。现已按 workflow 实际读取的 11 个 secrets 重写。**仍存在的结构问题**：该 workflow 位于 `automation/ct8-automation/.github/workflows/`，`gh`/Actions 不会执行它，且无法从本仓根 dispatch；而 `config/platform.services.*.json` 仍把 `ct8-automation` 宣传为在线服务、`.env.example` 的 `GH_WORKFLOW=ssh-login.yml` 指向根目录并不存在的同名文件。这需要产品决策（是把 workflow 迁到根目录，还是停止把它当在线服务），不在本轮范围内。
19. **Dependabot 覆盖曾有两处空洞（本轮已修）**：`npm` 条目漏了 `/apps/official-website`；`docker` 条目指向根目录 `/`，而根目录没有任何 Dockerfile 或 compose 文件，导致所有 digest 固定的基础镜像从不更新。现改为列出 `/infra/docker` 与 `/infra/blackbox`。
20. **`.env.release-smoke` 曾未被 `.gitignore` 覆盖（本轮已修）**：`aliyun-acr.yml` 用 `create-ci-env.mjs` 生成该文件（含随机密钥），但当时 `.gitignore` 只忽略了 `.env` 与 `.env.ci`。现已连同 `release-artifacts.tsv`、`changed-files.txt`、`build-metadata-*.json`、`blackbox-spool.jsonl` 一并忽略。
21. **`ci.yml` 曾遗漏 `.github/workflows/android-profile.yml`（本轮已修）**：该文件已存在且仅手动触发，但不在 `paths-ignore` 中，因此修改它会触发全量 CI。

---

## 15. 改动检查清单

提交前自问：

- [ ] `npm run check` 通过（或说明了为何无法本地运行）。
- [ ] 若改了某个子项目，它的 `check` 脚本仍存在且不被绕过。
- [ ] 若新增子项目，已登记到 `install-workspace.mjs`、`audit-workspace.mjs` 与根 `check`。
- [ ] 若改了入口文件位置，`main`/`start`/`check`/Dockerfile 已同步。
- [ ] 若改了用户可见行为，`README.md` 或相关 `docs/` 已同步（文档服从代码）。
- [ ] 没有把缩进重排、依赖升级与功能改动混在同一提交。
- [ ] 没有提交 `.env`、密钥、`project.private.config.json`。
- [ ] 若触及上面的"已知偏差"，没有顺带"统一"掉有意的分歧。
