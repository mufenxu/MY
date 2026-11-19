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
- **「研讨间自动任务」「座位自动预约任务」「座位候补预约」是三套东西，别混**（2026-11-07、11-08 各踩过一次）：
  - 研讨间 = **一次性定时闹钟**。字段是「预约目标日期 + 任务运行日期 + 运行时间 + 候选空间列表」；`libroom-auto-reservation.js` 用 `runKey = targetDate:executeDateTexecuteTime` 做幂等锁，到点跑一次就结束（抢到 `succeeded`，抢空 `failed`）。研讨间**可提前 3 天**预约，`defaultExecuteDate` 默认取目标日期前 3 天；网页端默认运行时间 **07:00**（2026-11-07 用户指定，安卓端仍是 08:30，不要跟着改）。
  - **图书馆座位有「两个不同功能」，一个网页端一个安卓端**（2026-11-08 用户明确纠正两次，这是重点）：
    - 网页端「**自动预约任务**」= **定点执行型**。用户填「预约目标日期 + 任务运行日期 + 任务运行时间」，运行日期默认目标日期前一天、运行时间默认 **21:55**（学校放号时刻）。到点跑一次：先抢指定座位 → 抢不到按距离换相邻号 → 再按号码顺序在本区挑 → 都没有就抢整个阅览区任意空位（兜底）。抢到即 `success`；连续 3 轮确认整区约满才 `failed`。独立集合 `library_seat_auto_tasks`、独立接口 `/api/campus/library-seat/auto-tasks`、独立库 `src/lib/library-seat-auto-task.js`。
    - 安卓端「**候补预约**」= **持续监听**。字段没有运行时间（`LibrarySeatWaitlistRequest` 只有 venueId/floorId/date/startMinute/endMinute/minLabel/maxLabel/seatLabels），进时段就盯，有人退座就抢，一直盯到时段结束。接口 `/api/campus/library-seat/waitlists`，`library-seat-waitlist.js` 按 `due = now < endMs` 判断，抢不到就 `listening` 循环到 `expired`。**没有任何时间门槛**（11-08 已把误加的 21:55 等待整块回滚，`5194801` 版即原样）。
    - **两套物理隔离**：不同集合、不同路由、不同核心库、不同调度分支，`grep` 验证互不引用。网页建的任务在 `/waitlists` 里查不到（端到端实测 `WAITLISTS_STILL_EMPTY`），安卓零感知。
    - UI 上网页端这个页签仍叫「自动预约任务」，但内部标识符保留 `waitlist`（`data-resv-tab="waitlist"`、`#resvSeatWaitlist`），因为它是挂载点、不是接口。
  - 21:55 只是「座位自动预约任务」的默认运行时间，既不属于候补，也不属于研讨间。
- `test/asset-budget.test.js` 是硬闸门：`app.js`/`styles.css` 只剩个位数余量，新增前端代码必须走独立文件并同步登记 `package.json` 的 `check`/`lint` 和预算表。

## 安卓卡片外观（2026-11-18 用户否掉全局投影）

`AppPanel` 保持「主题实色 + 20dp 圆角 + 0 阴影 + 默认无描边」，**不要再给卡片加投影或统一描边**——加过两版都被否。那张好看的「登录已批准」卡是 `QrLoginScreen` 自己手写的 `Surface`（默认黑 8dp 投影），属局部特例，不要推广到 `AppPanel`。`ColorTokens.CardShadowLight` 现在只有底栏在用。

## 后台「返回统一控制台」入口（2026-11-19 用户选型后定稿）

- **唯一实现**：`packages/pearl-tokens/components.css` 的 `.pearl-console-switch`。不要在应用外壳里另写按钮样式——这次之所以三个地方三种长相，就是因为每个应用各写了一份。
- **唯一落位**：顶栏工具组最左（主题 / 全屏 / 通知之前）。core-admin 的 `.topbar-right`、exam-admin 的 `.topbar-actions` 各一处。exam-admin 原来侧栏底部的入口已删，别加回去。
- **唯一图标**：16×16 网格手绘「层叠」SVG（上层实心菱形 + 两条 .62/.3 折线），内联在 `core-admin/src/components/MainLayout.jsx`、`exam-admin/src/views/DashboardView.vue`、`exam-admin/src/views/ExamDetailView.vue`、`campus-service/public/index.html`、`iot-service/public/index.html` **共 5 处**。改形**必须全部同步**（`grep "M8 2.1 13.9 5"` 可找全）；不要再换回 antd `AppstoreOutlined` / Element `Grid`（缩小到 14px 就是四个点）。
- 文案：可见「统一控制台」、aria-label / tooltip「返回统一控制台」、弹窗确认「返回统一控制台」。不要再出现「返回统一服务控制台」「返回控制台」。
- 窄屏 ≤768px 由 CSS 收成 32px 纯图标（隐藏 `> span`），不要再用 JS 的 `isMobile` 分支控制这个按钮的显隐。
- **campus-service / iot-service 是「单组件分发」，不是整包引入**（2026-11-19 试过后定的）：这两页没有 pearl 令牌，`generate.mjs` 从 `components.css` 的 `/* --- pearl-console-switch:start/end --- */` 标记之间原样提取，生成 `public/console-switch.css`（各自带本页色板的令牌映射，campus 用 `body.dark-theme`、iot 默认暗色 + `[data-theme="light"]`）。**改按钮只改 `components.css` 然后 `npm run generate`**，手改生成物会被 `check` 打回。
  - 不要再尝试把 `tokens.css` / 整份 `components.css` 引进这两页：包不在服务镜像里（Dockerfile 只 COPY 自己的 public/src）、`components.css` 2195 行含 `.btn/.field` 等通用类、两页主题机制与 pearl 相反（iot 默认暗色），且 campus 的 `--surface/--text/--shadow` 与 pearl 同名不同义。
  - 这两页**只统一材质不统一尺寸**：campus 桌面端顶栏是左侧栏、按钮是一列 46px 整宽，硬塞 32px 胶囊会矮一截。高度/内距/字号交给宿主 `.actions a` / `.button`，只换底色、描边、投影和 hover 强调色。
  - campus 的 `styles.css` 只剩 ~160B 余量、`index.html` 剩 1.4KB，新样式必须走独立文件并在 `test/asset-budget.test.js` 登记预算。

