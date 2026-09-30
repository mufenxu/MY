# MY 工作区 — 协作与工程规范

本文件是**仓库级入口**。任何改动前先读这里，再按所属领域读对应文档。

## 规范优先级

1. 用户/系统的直接指令
2. 领域规范：`apps/android-app/AGENTS.md`（仅 Android）
3. [docs/engineering-standards.md](docs/engineering-standards.md) — **工程规范总纲，唯一权威事实来源**
4. 目录内 README / 注释
5. 本文件（只做导航与红线速览）

**冲突处理**：文档与代码冲突时**以代码为准，并修正文档**。不要把文档里的过时描述当成需求实现。

## 仓库地图

```text
MY/
|-- apps/
|   |-- admin-console/          React 19 + Express 5，统一运维/安全/发布/容灾门户（服务端与客户端同包）
|   |-- core-admin/             React 19 + antd，综合业务管理台
|   |-- exam-admin/             Vue 3 + Element Plus，考试管理台
|   |-- official-website/       单页官网（无框架，手写 HTML + main.js）
|   |-- android-app/            Android 客户端（Kotlin + Compose，Gradle 根项目 MYControl）
|   |-- exam-miniapp/           考试学习微信小程序（原生 + TS）
|   `-- smart-campus-miniapp/   智慧校园微信小程序（原生 + TS，源码根 miniprogram/）
|-- services/
|   |-- platform-api/           统一网关与模块路由（唯一对外入口）
|   |-- core-api/               综合业务 API
|   |-- exam-api/               考试业务 API
|   |-- notification-service/   企业微信通知模块
|   |-- campus-service/         校园系统连接器
|   `-- iot-service/            MQTT / 设备 / 遥测
|-- packages/
|   |-- platform-auth/          平台内部身份签发与 SSO/HMAC 验签（CJS + ESM 双入口）
|   `-- platform-browser-runtime/ 浏览器侧共享运行时（SSO、超时请求、体验上报）
|-- automation/ct8-automation/  非常驻自动化任务
|-- config/                     无密钥的服务注册表与拓扑契约
|-- docs/                       架构、运维、发布与工程规范
|-- infra/                      Docker、反向代理与部署配置
`-- scripts/                    工作区维护与 CI 辅助脚本
```

*（本树与根 [README.md](README.md) 保持一致；两侧任一处改动时同步另一处。）*

## 红线速览

- **门禁**：提交前 `npm run check` 必须通过。它是根 `package.json` 里 `&&` 串联的全量检查，**第一步是 `check:conventions`**（只读的仓库约定校验器，会断言包名、`private`、`description`、`main` 可解析、`check` 脚本存在且可达、`package.json` 缩进、项目登记一致性）。新增子项目必须同时登记到 `scripts/install-workspace.mjs`、`scripts/audit-workspace.mjs` 和根 `check:*`。
- **测试**：只用 Node 内置 `node --test` + `node:assert/strict`。不要引入 jest / mocha / vitest。测试**不连真实数据库**，用内存替身。
- **密钥**：`.env`、`**/project.private.config.json`、任何令牌/私钥**绝不提交**。`config/` 内不得出现密钥。
- **包名**：`@my-platform/<目录名>` + `private: true` + 非空 `description`；`main`/`exports` 必须指向真实存在的文件。
- **缩进**：默认 2 空格。**禁止**为"顺手整齐"批量重排既有文件缩进——它会让 review 与 `git blame` 失效。唯一的 4 空格例外是 `services/core-api/**.js` 与 `services/exam-api/**.js`。
- **模块系统**：仓内 ESM 与 CJS 并存，**跟随所在目录既有形态**，不要跨服务统一。
- **服务边界**：一个服务一个数据库（`platform_app`/`core_app`/`exam_app`/`campus_app`/`iot_app`/`notification_app`），**禁止跨服务直接读对方数据库**；功能归属见 [docs/architecture.md](docs/architecture.md) 的 *Feature ownership*，新功能必须扩展规范所有者，不得造第二份实现。
- **内部认证**：用户身份走 `x-my-platform-sso`（Ed25519，15 秒），服务间走 HMAC `x-my-service-*` 签名（30 秒 + nonce）。禁止绕过网关直连业务容器，禁止自造第二套认证头。
- **前端**：四个 Web 应用技术栈不同，**不要试图统一框架**；共享能力必须取自 `packages/`，不要在应用内抄一份。注意 `exam-admin` 的 lint 实质无效。
- **Android**：设计与 UI 红线见 [apps/android-app/AGENTS.md](apps/android-app/AGENTS.md)；版本只从 `gradle/libs.versions.toml` 取。仓内**没有** detekt/ktlint/spotless。
- **提交**：一个提交只做一件事，标题必须有信息量（避免"修复"、"优化"单独成题）；缩进重排、依赖升级、功能改动不得混在同一提交。

## 按任务找文档

| 我要做的事 | 先读 |
| --- | --- |
| 任何改动 | 本文件 → [docs/engineering-standards.md](docs/engineering-standards.md) |
| 改 Android UI / 新增页面 | [apps/android-app/AGENTS.md](apps/android-app/AGENTS.md) |
| 改服务、接口、数据库、鉴权 | [docs/architecture.md](docs/architecture.md) |
| 部署、镜像、故障处置 | [docs/operations.md](docs/operations.md)、[docs/single-domain-deployment.md](docs/single-domain-deployment.md) |
| 发布中心 / 构建产物 | [docs/release-center.md](docs/release-center.md) |
| 镜像仓库与发布流程 | [docs/aliyun-acr.md](docs/aliyun-acr.md) |
| 外部项目接入 SSO | [docs/external-project-sso.md](docs/external-project-sso.md)、[docs/core-api-usage.md](docs/core-api-usage.md) |
| 小程序发布前合规 | `apps/exam-miniapp/README.md`（发布清单） |

## 需要知道的历史包袱

以下都是**已核实**的偏差，登记在 [docs/engineering-standards.md §14](docs/engineering-standards.md) 中，附证据与"为何不要顺手改"的说明。改到相关区域前请先看一眼，避免把**有意的分歧**当成 bug 修掉：

- 分页参数 `limit` / `pageSize` 在 `core-api` 与 `exam-api` 中优先级**相反**——这是面向不同客户端的有意设计，两侧均已加注释锁定。
- 依赖大版本分裂（express 4/5、mongoose 8/9、eslint 8/9、Vite 5/7/8、dotenv 有/无）。
- 大量跨服务重复实现（SSO 包装器 ×4、限流器 ×4、分页 ×3、前端 `sequentialPoller`/`readCookie`/体验上报/头像生成器各有多份）。
- `services/core-api` 目前**没有** lint 覆盖；`services/iot-service` 的 `check` 不含 `test`。
