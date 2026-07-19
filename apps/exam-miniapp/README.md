# 考试学习小程序

一个用于题库学习、模拟考试、错题复习和后台题库管理的微信小程序项目。

## 项目结构

```text
backend/        Node.js + Express + MongoDB 后端与管理后台
miniprogram/    微信小程序前端
typings/        小程序类型定义
```

## 这次已经补上的上线能力

- 考试结果保存题目快照，避免题库修改后历史记录变形
- 试卷新增 `isPublished` 发布开关，支持后台隐藏但不删除
- 公开接口统一按“已发布试卷 + 可见科目”过滤
- 新增账号注销接口，支持删除账号、考试记录、做题进度
- 小程序新增 `账号与数据`、`隐私政策`、`用户协议` 页面
- 管理后台扫码登录改为运行时配置，管理员会话改为 `localStorage` 持久保存，并保留 `sessionStorage` 兜底
- 新增旧成绩快照回填脚本与基础单元测试

## 后端环境变量

考试后端位于 `../../services/exam-api/`，环境变量参考该目录的 `.env.example`。

关键变量：

- `MONGODB_URI`
- `JWT_SECRET`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `CORS_ORIGINS`
- `DEFAULT_ADMIN_USERNAME`
- `DEFAULT_ADMIN_PASSWORD`
- `SCAN_LOGIN_QR_TTL_MS`
- `SCAN_LOGIN_TEMP_AUTH_CODE_TTL_MS`
- `SCAN_LOGIN_CLEANUP_TTL_MS`
- `SCAN_LOGIN_QR_CODE_MODE`
- `SCAN_LOGIN_QR_LINK_BASE`
- `SCAN_LOGIN_WXACODE_PAGE`
- `SCAN_LOGIN_WXACODE_CHECK_PATH`
- `ALIYUN_AI_CAPTCHA_PREFIX`
- `ALIYUN_AI_CAPTCHA_SCENE_ID`
- `SUB2API_BASE_URL`
- `SUB2API_API_KEY`
- `SUB2API_MODEL`
- `AI_RATE_LIMIT_MAX`
- `AI_BATCH_MAX_PER_RUN`
- `AI_BATCH_COOLDOWN_MS`
- `AI_GENERATION_DAILY_LIMIT`
- `AI_USAGE_RETENTION_DAYS`

说明：

- `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 在 `production` 环境下是强制项。
- `CORS_ORIGINS` 在 `production` 环境下不能使用 `*`。
- `SCAN_LOGIN_QR_CODE_MODE` 支持 `scheme`、`link`、`wxacode`。个人主体小程序建议使用 `wxacode`，电脑端会展示官方小程序码，微信扫一扫后直接进入 `subpackages/user/scan-login/scan-login` 确认页。
- `SCAN_LOGIN_QR_LINK_BASE` 仅用于 `link` 模式，例如 `https://admin.example.com/wx-login?qrToken=...`。该模式需要在微信小程序后台配置“扫普通链接二维码打开小程序”，个人主体不可用。
- `SCAN_LOGIN_WXACODE_PAGE` / `SCAN_LOGIN_WXACODE_CHECK_PATH` 仅用于 `wxacode` 模式；如果页面尚未发布，可临时设 `SCAN_LOGIN_WXACODE_CHECK_PATH=false` 和 `SCAN_LOGIN_WXACODE_ENV_VERSION=trial` 测试体验版，正式发布建议改回 `SCAN_LOGIN_WXACODE_CHECK_PATH=true` 并使用 `release`。
- 阿里云 ESA AI 验证码默认场景 ID 为 `e5isq0ly`，生产环境还需要配置控制台里的 `ALIYUN_AI_CAPTCHA_PREFIX`。
- 题目 AI 解析使用 OpenAI-compatible `/v1/chat/completions` 调用；`SUB2API_BASE_URL` 可填网关根地址、`/v1` 地址，或完整 `/v1/chat/completions` 地址。普通用户可查看已经保存到数据库的 AI 解析；只有绑定后台管理员微信或 `ops_admin/super_admin` 账号可以请求 AI 生成/重新生成，重新生成会覆盖该题原有的 AI 解析。
- AI 解析默认按保守频率运行：`AI_RATE_LIMIT_MAX` 控制 15 分钟内 AI 接口请求数，`AI_BATCH_MAX_PER_RUN` 控制单次批量最多生成题数，`AI_BATCH_COOLDOWN_MS` 控制批量生成冷却时间，`AI_GENERATION_DAILY_LIMIT` 控制每日真实调用上游 AI 的次数，`AI_USAGE_RETENTION_DAYS` 控制生成计数记录保留天数。
- 示例数据默认只在非生产环境写入；也可以通过 `SEED_SAMPLE_DATA=true` 手动开启。

## 小程序运行时配置

小程序请求域名和通用配置在 [runtime.ts](./miniprogram/config/runtime.ts) 中维护；体验版、正式版的真实运营主体和联系邮箱在 [compliance-profile.js](./miniprogram/config/compliance-profile.js) 中分别维护。

发布前至少要改这几项：

- `baseUrl`
- `companyName`
- `supportEmail`
- `privacyPolicyVersion`
- `userAgreementVersion`

体验版和正式版会在运行时拒绝占位信息。上传前还应显式执行对应闸门：

```bash
npm run check:compliance:trial
npm run check:compliance:release
```

## 开发运行

### 1. 启动后端

```bash
cd backend
npm install
npm run dev
```

默认管理后台入口：

- `http://localhost:3110/login.html`

### 2. 打开小程序

使用微信开发者工具打开当前 `apps/exam-miniapp` 目录。

## 旧数据回填

如果数据库里已经有历史考试结果，建议在发布前先回填快照：

```bash
cd backend
npm run migrate:exam-snapshots
```

## 上线前 checklist

### 代码与数据

- 配好 `backend/.env`
- 执行 `npm run migrate:exam-snapshots`
- 确认后台试卷 `isPublished` 状态
- 确认不需要公开的科目 `showOnHome=false`

### 微信小程序后台

- 配置合法请求域名
- 配置业务域名
- 个人主体小程序：设置 `SCAN_LOGIN_QR_CODE_MODE=wxacode`，无需配置“扫普通链接二维码打开小程序”
- 非个人主体如使用 `link` 模式：配置“扫普通链接二维码打开小程序”，URL 规则使用 `SCAN_LOGIN_QR_LINK_BASE` 的前缀，目标页面为 `subpackages/user/scan-login/scan-login`
- 配置 HTTPS 证书
- 填写隐私保护指引
- 提交最新隐私政策与用户协议内容

### 服务器

- 配置正式 MongoDB 备份
- 配置日志与错误告警
- 配置反向代理与 HTTPS
- 限制管理后台暴露范围

### 发布前人工验证

- 小程序登录
- 拉取题库
- 模拟考试交卷
- 错题本与成绩回看
- 账号退出登录
- 账号注销
- 管理后台账号密码登录
- 管理后台扫码绑定/扫码登录

## 仍然需要你手动完成的外部事项

- 微信公众平台里的隐私指引内容填写
- 正式域名备案和 HTTPS
- 正式 AppID / AppSecret / 请求域名白名单配置
- 生产监控、备份、告警
