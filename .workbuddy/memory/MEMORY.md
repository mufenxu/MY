# 项目长期约定（MY）

## 安卓改动：本机验证口径（用户 2026-10-30 明确要求，长期生效）

产物只由 GitHub Actions 出，本机**不出包**。默认只跑两条，约 20 秒：

```bash
npm.cmd run check:android-design
cd apps/android-app && ./gradlew :app:compileDebugKotlin
```

- 不默认跑：`assembleDebug`（要装真机才跑）、`assembleRelease`（本机无 keystore，签名是仓库 secrets）、`connectedDebugAndroidTest`（需设备）、`lintDebug`/`lintRelease`（交给 CI）。
- 按改动类型追加：动 JVM 单测 → `testDebugUnitTest`；动 androidTest → `compileDebugAndroidTestKotlin`；动 Manifest/资源/权限/新增组件/依赖 → `lintDebug`（lint 红会让 CI 失败，必须补跑）。
- JAVA_HOME 已设为用户级环境变量 `D:\My-ruanjian\Android Studio\jbr`，直接 `./gradlew`，不再手动 export。
- 完整口径见 `apps/android-app/AGENTS.md` §13。

## 校园服务 / 安卓学校账号登录

- campus-service 的 401 统一码：`SCHOOL_ACCOUNT_REQUIRED`（判定在 `src/lib/auth-errors.js`，`respondApiError` 出口归一化）。安卓侧 `isSchoolAccountRequired` 刻意不并入 `shouldInvalidatePlatformSession`，否则会误把用户踢回登录页。
- 学校会话**已按平台用户隔离**（2026-11-07 核实）：`server.js` 的 `readSessionJar`/`saveSessionJar` 走 `currentUserId()`，`school_sessions` 以 `user_id` 建唯一索引，并用 `replaceSchoolSessionIfVersion` 乐观锁写。旧记忆里"全局共享一份"已过时。
- 仍存在的共享口子：平台 SSO 令牌**不带 `account_id`** 时，`server.js:871` 会退回 `PLATFORM_SSO_CAMPUS_USERNAME`（默认 admin），这些用户共享同一个校园账号及其学校会话。该分支仅 `role=admin` 可过。

## 校园服务网页端「预约」结构（2026-11-07 定，用户拍板）

- 导航只保留一个 `#reservation`「预约」入口（快速导航保持 7 项），页内一级页签分「研讨间 / 图书馆座位」，二级页签：研讨间 = 单次预约 / 已约空间 / 自动任务；座位 = 查询座位 / 我的预约 / 候补预约。
- 外壳由 `public/reservation-hub.js` 建（导航项 + 页签 + `window.HguReservation`），子页分别挂到 `#resvLibroomBook`、`#resvLibroomRecords`、`#resvLibroomAuto`、`#resvSeatQuery`、`#resvSeatRecords`、`#resvSeatWaitlist`。跨模块通知用 `document` 上的 `resv:activate` / `resv:refresh` 事件。
- 座位平面图用 `/api/campus/library-seat/layout` 的真实坐标，按包围盒归一化到百分比绘制，不做安卓那种写死的二层 1–45 网格。
- 预约相关状态**一律不写 localStorage/sessionStorage**（多人共用浏览器会串号）。自动任务也没做「本机草稿」。
- `test/asset-budget.test.js` 是硬闸门：`app.js`/`styles.css` 只剩个位数余量，新增前端代码必须走独立文件并同步登记 `package.json` 的 `check`/`lint` 和预算表。
