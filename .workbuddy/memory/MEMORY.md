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

- 导航只保留一个 `#reservation`「预约」入口（快速导航保持 7 项），页内一级页签分「研讨间 / 图书馆座位」，二级页签：研讨间 = 单次预约 / 已约空间 / 自动任务；座位 = 查询座位 / 我的预约 / 自动预约任务。
- 外壳由 `public/reservation-hub.js` 建（导航项 + 页签 + `window.HguReservation`），子页分别挂到 `#resvLibroomBook`、`#resvLibroomRecords`、`#resvLibroomAuto`、`#resvSeatQuery`、`#resvSeatRecords`、`#resvSeatWaitlist`。跨模块通知用 `document` 上的 `resv:activate` / `resv:refresh` 事件。
- 座位平面图用 `/api/campus/library-seat/layout` 的真实坐标。**不要改回百分比定位**（2026-11-07 踩过）：百分比 + 固定 36×30 方块会让 188 个座位的编号糊成一团。现在的做法是 `coordinateGap()` 求坐标最小列距/行距 → 算出画布最小宽高 → px 绝对定位 → `.seat-plan` 自己 `overflow:auto` 横向滚动，网格背景挂在 `.seat-plan-canvas` 上。窄屏方块缩到 30×24。
- 选中阅览区后其余卡片折叠（`.resv-grid.is-collapsed` + 「展开其他 N 个阅览区」），`queryState.areasExpanded` 控制；`selectArea` 与 `runQuery` 都会重置为折叠态。
- 预约相关状态**一律不写 localStorage/sessionStorage**（多人共用浏览器会串号）。自动任务也没做「本机草稿」。
- **「研讨间自动任务」和「座位候补预约」是两套东西，别混**（2026-11-07 已踩过一次）：
  - 研讨间 = **一次性定时闹钟**。字段是「预约目标日期 + 任务运行日期 + 运行时间 + 候选空间列表」；`libroom-auto-reservation.js` 用 `runKey = targetDate:executeDateTexecuteTime` 做幂等锁，到点跑一次就结束（抢到 `succeeded`，抢空 `failed`）。研讨间**可提前 3 天**预约，`defaultExecuteDate` 默认取目标日期前 3 天；网页端默认运行时间 **07:00**（2026-11-07 用户指定，安卓端仍是 08:30，不要跟着改）。
  - 座位候补 = **时段内持续蹲守**。字段是「日期 + 开始时间 + 时长 + 座位号范围」；`library-seat-waitlist.js` 用 `LIBRARY_SEAT_BOOKING_OPEN_MINUTE = 21:55` 卡住**目标日前一天 21:55** 放号时刻，到点开始扫描，抢不到就 `listening` 继续下一轮，直到时段结束才 `expired`。
  - **网页端不叫「候补预约」**（2026-11-07 用户要求）：座位的这个页签在 UI 上叫「自动预约任务」，面板/按钮/空态/确认框同步改了。但内部标识符仍是 `waitlist`（`data-resv-tab="waitlist"`、`#resvSeatWaitlist`、`/api/campus/library-seat/waitlists`），**后端接口与字段一律不动**——安卓端 `LibrarySeatReservationScreen.kt` 还叫「候补预约」，那是它自己的文案，网页端改名不得牵动安卓与接口。
  - 21:55 只属于图书馆座位，别往上套研讨间。
- `test/asset-budget.test.js` 是硬闸门：`app.js`/`styles.css` 只剩个位数余量，新增前端代码必须走独立文件并同步登记 `package.json` 的 `check`/`lint` 和预算表。
