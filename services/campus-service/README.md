# 地大智览

一个可部署到自己服务器的校园信息工作台，对接河北地质大学能耗计费平台 `nrg.hgu.edu.cn`、校园一卡通/公寓平台 `ykt.hgu.edu.cn` 和本科教务学生端。

## 本地运行

```bash
cd hgu-energy-dashboard
npm ci
npm start
```

需要 Node.js 20 或更高版本。提交代码前运行 `npm run verify`，它会执行语法检查、ESLint 和自动化测试。

打开：

```text
http://127.0.0.1:22101
```

## 项目结构

```text
public/      浏览器端页面、样式和交互
scripts/     账号、备份和部署辅助命令
src/lib/     可复用且可独立测试的后端基础模块
test/        单元测试和端到端 HTTP 集成测试
server.js    学校系统连接器、业务编排和 API 路由
```

基础能力应放在 `src/lib/` 并配套测试；学校接口协议和跨系统会话编排保留在 `server.js`，避免把通用安全逻辑与易变化的上游协议混在一起。

## 微信内置浏览器登录兼容性（维护必读）

微信/X5 WebView 可能在登录响应已经包含 `Set-Cookie` 的情况下，仍然不保存 Cookie，尤其容易发生在原生表单跳转和重定向之后。表现为账号密码验证成功、页面短暂加载，然后再次回到系统登录页。普通浏览器通常不会复现这个问题。

当前实现使用两层认证路径：

- Secure、HttpOnly、SameSite Cookie 始终是主认证方式。
- 只有 `User-Agent` 包含 `MicroMessenger` 的微信客户端，登录响应才会附带签名会话令牌。`public/browser-check.js` 将它保存在微信专用的 `localStorage` 键，并在当前页面保留 `sessionStorage` 副本；`public/app.js` 通过 `x-hgu-app-session` 请求头发送。这样关闭并重新打开微信页面后仍可恢复登录，服务端会忽略普通浏览器发送的同名请求头。
- 微信请求头令牌和 Cookie 使用相同的签名、过期时间及账号会话版本，默认有效期均为 720 小时（30 天）。账号停用、退出、修改密码或签名到期后都会失效；浏览器会在发现本地记录到期时主动删除它。
- 持久化令牌是微信 Cookie 兼容措施，只能保存在 `hgu_wechat_app_session_v1` 专用键中。不要向普通浏览器返回令牌，不要改成无期限令牌，也不要引入可读取该键的第三方脚本；现有 CSP 和同源限制必须保留。

修改系统登录、Cookie、静态资源加载或浏览器兼容代码时，必须遵守以下约束：

1. 不要删除 `server.js` 中的微信会话头兜底，也不要把微信登录的主路径改回依赖 303 跳转后 Cookie 立即生效的原生表单流程；原生表单只作为异步登录失败或超时后的兼容兜底。
2. 保持 `public/browser-check.js` 在 `public/app.js` 之前加载；前者负责在主应用启动前提供微信会话存储兼容层。
3. 修改上述两个浏览器脚本后，必须同步更新 `public/index.html` 中的 `?v=` 版本。版本化资源使用一年 immutable 缓存，不更新版本会让微信继续执行旧代码。
4. 必须运行 `npm run verify`。`test/embedded-session.test.js` 验证关闭并重建 WebView 后仍能恢复令牌、普通浏览器不能启用兜底且过期记录会被删除；`test/server.integration.test.js` 验证 30 天 TTL、无 Cookie、残留旧 Cookie 以及普通浏览器隔离场景。
5. 发布后使用真实微信客户端完成一次系统账号登录，关闭页面后重新打开并刷新，确认不会重新出现登录门。HTTPS 部署仍需保持 `HGU_APP_COOKIE_SECURE=true`；微信兜底不是降低 Cookie 安全配置的理由。

## 连接学校接口

打开网页后，先使用本系统账号登录；进入工作台后，再在“连接学校账号”里输入统一身份认证账号密码。后端会模拟 CAS 登录，并自动连接能耗、校园一卡通、生活用水、公寓管理和教务课表。项目只保存学校返回的会话 Cookie / Token，不保存学校密码。

一卡通生活用水平台在同一账号换取新 token 时会立即废弃旧 token，并返回“账号在其他地方登录”。校园余额、用水和住宿连接器共用同一份 UIAS/CAS 会话，`getCampusSummary` 必须保持串行调用，不能改回 `Promise.all` 并发；UWC 请求还会进行有上限的自动会话恢复，前端在最终认证错误时会自动补查一次用水数据。调整校园接口编排后必须运行 `test/auth-recovery.test.js`，并验证首次打开页面无需手动点“查询”即可显示用水码。

`campus_app` MongoDB 数据库会按系统账号隔离保存学校会话、一卡通临时 Token 或个人课表缓存。学校 Cookie/Token 会使用 AES-256-GCM 加密后入库；生产环境必须配置并长期备份独立的 `HGU_DATA_ENCRYPTION_KEY`。请勿提交或公开分享数据库和密钥。

默认会在首次启动时创建管理员账号。开发环境默认账号为 `admin`，密码为 `admin12345678`；公网部署请务必通过 `.env` 设置 `HGU_ADMIN_USERNAME` 和 `HGU_ADMIN_PASSWORD`。创建更多系统账号：

```bash
npm run user:add -- student001 "a-long-random-password"
npm run user:list
```

管理员也可以登录网页后进入顶部“用户”页面创建账号、生成邀请码、重置密码、启用/停用账号或删除账号。普通用户看不到该入口。邀请码会在管理员列表中完整显示并可复制，发给同学后，对方可在登录页使用邀请码自助注册系统账号。

## 可选：手动 Cookie 兜底

如果 CAS 登录暂时不可用，能耗平台也可以继续使用手动 Cookie 兜底：

```bash
HGU_ALLOW_GLOBAL_NRG_COOKIE=true
NRG_COOKIE="这里放 nrg.hgu.edu.cn 已登录请求里的 Cookie 头"
```

也可以用文件：

```bash
NRG_COOKIE_FILE=/run/secrets/hgu_nrg_cookie
```

## Docker / Docker Compose 一键部署

本项目推荐使用 **Docker Compose** 进行一键部署与管理，支持数据持久化（自动保存学校登录态和课表缓存）以及方便的环境变量管理。

### 快速启动

1. 在统一平台仓库根目录复制 `.env.example` 为 `.env`，生成并填写所有随机密码、会话签名密钥和数据加密密钥。
2. 检查根目录 `.env` 中的 MongoDB 与校园服务参数。
3. 在统一平台仓库根目录执行：
   ```bash
   docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build campus-service
   ```
4. 生产 Compose 不发布 `22101`；请通过 `https://pxyb.cn/apps/campus/` 或经统一网关转发的独立域名访问。

详细的服务器部署步骤、反向代理配置以及备份说明，请参阅：[Docker Compose 部署指南](./DOCKER_DEPLOY.md)。

## 公网部署要求

这个项目会代理学校登录态、课表、一卡通、住宿和能耗数据，公网部署时必须先开启系统访问门禁：

```bash
NODE_ENV=production
HGU_ADMIN_USERNAME=admin
HGU_ADMIN_PASSWORD=一段足够长的系统管理员密码
HGU_APP_SESSION_SECRET=另一段足够长的随机签名密钥
HGU_DATA_ENCRYPTION_KEY=32字节随机数据的Base64URL编码
HGU_APP_SESSION_TTL_HOURS=720
HGU_APP_COOKIE_SECURE=true
HGU_PUBLIC_ORIGIN=https://hgu.pxyb.cn
```

容器内部监听 Docker 网络地址，不发布宿主机端口：

```bash
HGU_HOST=0.0.0.0
PORT=22101
```

所有流量都经过 `platform-api` 后才设置 `HGU_TRUST_PROXY=true`。独立域名仍可使用 `HGU_PUBLIC_ORIGIN=https://hgu.pxyb.cn` 修正 HTTP 到 HTTPS 跳转，但 Nginx 必须代理到 `22100` 网关。只有叠加 `infra/docker/compose.debug.yml` 的本地调试才会在回环地址发布 `22101`。

备份 `campus_app` 时必须同时安全备份 `HGU_DATA_ENCRYPTION_KEY`，但两者应分开保存。`/api/health` 是存活检查，`/api/ready` 会验证 MongoDB 可用性。

统一备份、恢复和旧 SQLite 迁移步骤见根目录 `docs/operations.md`。

## 当前功能

- 页面内登录学校统一身份认证
- 自动保存/续用学校会话，显示预计失效时间，支持退出会话
- 账户和房间信息
- 钱包余额、余额状态、套餐备注
- 指定月份账单
- 仪表列表、在线状态、实时读数
- 校园一卡通余额、绑定钱包、卡信息
- 校园一卡通当月完整账单、最近记录、指定月份账单查询
- 生活用水码查询、重新获取用水码、当月完整生活用水账单、指定月份生活用水账单查询
- 公寓住宿信息、入住状态、入住周期、宿友列表
- 本科教务选课结果课表、周视图、课程清单
- 私有 ICS 课表订阅，可随时轮换订阅地址或停用
- 企业微信课程提醒，可设置接收人和提前时间并由服务端定时扫描
- 新校区空闲教室查询，支持今天/明天/后天、节次和教学楼筛选
- 教学评估助手：同步待评课程、默认满分预填、主观评价编辑、逐门确认提交
- 教务课表 live 同步失败时显示最近一次本地缓存

除教学评估助手外，项目主体只实现查询接口；评估助手不会自动批量提交，会保留教务系统的开放时间、重复评估和问卷阅读等待校验，并要求每门课程单独确认。一卡通充值仅提供学校官方充值页跳转，不在本系统内创建订单、收集支付密码或完成支付。

## 教务课表说明

教务系统 `newjwxs.hgu.edu.cn` 外层有 WebVPN / aTrust 校验。项目会先建立 WebVPN/CAS 会话，再实时请求学校的选课结果 JSON 接口 `/student/courseSelect/thisSemesterCurriculum/callback` 生成课表；如果学校校验未放行，会回退到 `data/academic-timetable-cache.json` 最近缓存，并在页面标记“实时同步失败”。

服务器启动后会按 `ACADEMIC_AUTO_REFRESH_MS` 定时刷新教务缓存，默认 10 分钟一次；设置为 `0` 可以关闭后台刷新。即使关闭后台刷新，打开页面或调用 `/api/academic/timetable` 仍会实时同步一次。

课表页可以创建不可猜测的私有 ICS 订阅地址，订阅令牌仅以哈希形式保存在 `campus_app`。`POST /api/academic/calendar/rotate` 会让旧地址立即失效，`DELETE /api/academic/calendar` 可停用订阅。课程提醒偏好同样按系统用户保存在 MongoDB；Compose 会通过内部签名把到期提醒加入通知服务队列。`CAMPUS_REMINDER_INTERVAL_MS` 控制扫描间隔，重复扫描使用稳定幂等键，不会重复创建同一课程提醒。

空闲教室使用教务系统“教学资源 / 自习查询 / 空闲教室查询”的实时接口，仅默认展示新校区。页面可按日期、节次和教学楼查询，适合找自习教室。

教学评估助手实时读取教务系统“教学评估”列表。打开待评课程后，系统获取该门课的动态问卷字段和一次性令牌，分数题默认填写该题满分（当前问卷为 10 分），主观评价默认填写“好”，用户可修改。提交按钮会遵守官方页面的问卷阅读等待时间；最终提交前还会显示课程、教师和满分题数并再次确认。
