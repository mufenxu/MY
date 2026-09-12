# Android App 工作与设计规范 (2026 升级版)

## 1. 页面安全区与脚手架

- **系统安全区由外壳统一管理**：认证后的页面统一由 `AuthenticatedShell` 处理 `WindowInsets.safeDrawing`；页面内部**严禁再次调用 `statusBarsPadding()`**，避免产生双重顶部空白。
- **推荐统一使用标准脚手架 `AppSubPage`**：
  新增二级页面一律使用共享脚手架 `AppSubPage`（位于 `ui/components/layout/AppLayout.kt`），它已自动集成 `BackHandler`、`AppSecondaryHeader`、缓存极光背景、大屏宽度限制（`AppTabletContentMaxWidth = 1120.dp`）、统一间距与可选下拉刷新。禁止再手写冗余的 `LazyColumn` 样板代码。
- **二级页头交互模式规范 (`pinHeader`)**：
  - **吸顶模式 (`pinHeader = true`)**：适用于**长信息流、大量数据列表、全局搜索、操作日志、发布管理**等页面。页头固定悬浮在顶部并透出毛玻璃背景，确保用户深层滑动后标题上下文不丢失、随时可一键返回或执行页头操作。
  - **随动模式 (`pinHeader = false`，默认)**：适用于**短卡片页、设置表单页、概要信息页**等内容较短的页面，页头作为列表首项随内容滑动。
- **路由与返回约束**：
  新增二级路由必须在 `parentTabForSubScreen` 登记唯一父页面；页头返回和系统返回统一调用认证导航外壳的回退方法，页面内部不得混用状态关闭与 `NavController.popBackStack()`。

## 2. 视觉与材质约束

- **毛玻璃拟态 (Glassmorphism)**：
  - 核心质感见 `ui/components/layout/Glassmorphism.kt`：半透明磨砂表面 (`glassCardColor()`) + 顶部高光渐变 + 发丝描边 (`1.dp outlineVariant`，alpha ≈ 0.45) + **0 阴影投影**（严禁添加深色阴影，防止出现灰色脏晕边）。
  - 极光背景 (`auroraBackdrop`) 已采用 `drawWithCache` 缓存径向渐变着色器；严禁在滑动项内部私自构建高频重绘的渐变画笔。
- **底部浮动胶囊导航**：
  保持现有浮动胶囊底栏的形状、尺寸、颜色和弹性选中动画；系统手势区避让由外层处理。
- **布局间距标准**：
  - 列表项垂直间距严格统一为 `12.dp`，不得出现 `8.dp`/`10.dp`/`14.dp` 等杂乱变体；
  - 页面水平边距统一引用 `AppPageHorizontalPadding` (16.dp)，底部边距统一引用 `AppPageBottomSpacing` (16.dp)。

## 3. 触控热区与无障碍 (A11y & Touch Target)

- **48×48 dp 触控热区准则**：
  - 遵循 Android 与 Material 3 官方无障碍规范，所有可点击交互元素（按钮、页头操作图标、开关等）必须满足 **至少 48×48 dp** 的触摸判定范围。
  - 页头图标按钮统一使用 `AppHeaderIconButton`，其视觉大小保持精致的 `36.dp`，底层通过 `.minimumInteractiveComponentSize()` 自动扩展触控判定热区至 48dp。
- **语义与文本无障碍**：
  - 所有图标按钮必须配置语义清晰的中文 `contentDescription`（如“返回”、“刷新”、“新建 Release”），禁止传空或无意义文本；
  - 关键卡片和列表项设置 `role = Role.Button` 或 `Role.Tab`；
  - 文本排版禁止使用定死容器高度（如严禁 `.height(40.dp)` 包裹未知长度文字），应使用 `.heightIn(min = 40.dp)` 或内边距自撑开，防止系统大字号模式下文本被截断。

## 4. 动效与触觉反馈系统 (Motion & Haptics)

- **动效令牌 (`ui/theme/Motion.kt`)**：
  - 禁止在页面内散落手写随意的时间常量；
  - 微交互（图标缩放、指示器、高亮切换）：`MotionTokens.DurationShort` (160ms)；
  - 组件与卡片过渡展开：`MotionTokens.DurationMedium` (240ms)；
  - 页面级转场与弹窗展开：`MotionTokens.DurationLong` (320ms)；
  - 弹性回弹使用 `MotionTokens.BouncySpring`。
- **触觉微反馈 (`AppHaptics`)**：
  - 底部导航 Tab 切换、`AppSwitch` 开关切换、分段选择：触发 `AppHaptics.tick(haptics)`；
  - `PullToRefresh` 下拉刷新超过临界刻度：触发 `AppHaptics.refreshSnap(haptics)`；
  - 危险操作（如删除、强制同步、权限确认）：触发 `AppHaptics.heavy(haptics)`。

## 5. 组件与视觉令牌（唯一来源）

- **颜色令牌**：只能取自 `ui/theme/Color.kt` 与 `ColorTokens`，严禁在页面内硬编码 `Color(0x...)`。
- **字体与形状**：排版样式使用 `AppTypography`，圆角规范使用 `AppShapes`（卡片统一为 20.dp 圆角）。
- **通用组件复用**：
  - 二级页面骨架：`AppSubPage`
  - 卡片面板：`AppPanel`
  - 页头操作：`AppSecondaryHeader` / `AppHeaderIconButton`
## 6. 统一按钮体系与操作规范 (Button System Specification)

全 App 所有页面的按钮必须统一使用封装好的现代胶囊流光按钮族（位于 `ui/components/button/AppButtons.kt`），**严禁在任何业务界面裸写 Material 3 原生 `Button`、`FilledTonalButton`、`OutlinedButton`**。

- **三级按钮体系选型准则**：
  1. **主行动按钮 (`AppButton`)**：
     - **视觉形态**：全圆角胶囊 `RoundedCornerShape(50)`，标准高度 `46.dp`；
     - **色彩渐变**：采用明媚活力的清澈科技蓝微渐变（顶部 `BrandCyan #3B82F6` $\rightarrow$ 底部 `BrandBlue #2563EB`），色彩纯净透亮，杜绝死暗深蓝与纯平单色；
     - **立体光感**：外圈附带 `2.5.dp` 柔和天蓝微辉光立体阴影（`spotColor = #3B82F6 0.35f`）与浅天蓝同色发丝微描边，呈现自然微凸浮起的立体感；
     - **纯净原则（坚决不泛白）**：**绝对禁止在按钮表面叠加半透明白色高光雾蒙层**，蓝白文字对比必须锋利纯正；
     - **交互触觉**：内置 `pressFeedback` 物理弹性微缩放（按下 0.96 缩放）+ `AppHaptics.tick` 细腻物理微震动；
     - **状态集成**：直接支持 `loading = true` 平滑加载转圈动画与 `icon` 矢量图标，无需外层手写 `CircularProgressIndicator` 样板代码。
  2. **次要行动按钮 (`AppSecondaryButton`)**：
     - 采用全圆角胶囊磨砂质感 + 顶部微弱发丝微切边 + 轻量微阴影，悬浮在界面背景上，用于“取消”、“查看说明”、“返回查询”、“写入 NFC”等次要操作，清爽通透，绝不发灰泛白。
  3. **危险/破坏性按钮 (`AppDangerButton`)**：
     - 采用珊瑚红立体微凸渐变（`#EF4444` $\rightarrow$ `#DC2626`）+ 红色微光晕投影，用于“删除”、“撤销”、“清空”、“重置”等不可逆高危操作，警示明确、质感高级。
  4. **弹窗按钮配套**：
     - 弹窗内的操作按钮统一使用 `AppDialogPrimaryButton`、`AppDialogSecondaryButton`、`AppDialogDangerButton`，底层已全量委托映射至上述三级胶囊按钮。
  5. **行内轻量危险微胶囊 (`AppInlineDangerButton`)**：
     - 专用于列表项、卡片行内右侧的次要危险操作（如“撤销会话”、“移除设备”、“解绑”），高度自适应约 `26~28.dp`，采用柔和微透危险红（`#FEE2E2` / `#7F1D1D`）+ 浅红发丝微切边 + 全圆角胶囊，警示明确且体量克制，严禁在列表项行内塞入全尺寸大红实心按钮以防遮挡同行信息。

- **按钮设计红线**：
  - **严禁**使用直角、小圆角（如 8dp/10dp/12dp）或方形按钮，必须保持 `RoundedCornerShape(50)` 胶囊圆角；
  - **严禁**在按钮表面覆盖白色渐变雾层导致表面泛白起雾；
  - **严禁**在业务页面私自使用原生 `Button(...)`、`OutlinedButton(...)` 拼凑粗糙按钮。

## 7. 加载与网络容错规范 (Loading & Resilience)

- **骨架屏优先原则**：
  - 页面初次加载或长列表异步拉取时，严禁使用突兀的居中大菊花。应采用 `GlassShimmerList` 预占位，数据到达后自然渲染；
  - 微光动画必须使用 `Modifier.glassShimmer(dark)`，渐变光斑自适应深浅色，禁止生硬刺眼的白光。
- **就地一键重试 (Inline Retry)**：
  - 异步请求失败时，`FeedbackBanner(message, error = true, onRetry = { ... })` 必须尽可能传入重试操作，允许用户就地重新发起请求，严禁迫使用户只能退出重进或整页下拉。

## 8. 隐私安全与系统集成 (Security & System)

- **多任务后台防窥屏 (FLAG_SECURE)**：
  - `MainActivity` 在 `onPause` 时自动追加 `FLAG_SECURE`，在用户切入 Recent Apps 多任务界面或分屏预览时遮蔽缩略图，防止临时录屏或系统截屏泄露凭据密码；`onResume` 前台恢复时自动解除，保障用户正常截屏与使用。
- **预测性手势物理转场**：
  - 路由栈切换采用 `slideInHorizontally` / `slideOutHorizontally` 水平推拉结合微缩放与淡入淡出，动效时长严格对齐 `MotionTokens`，呼应 Android 14/15 边缘手势的自然惯性。

## 9. 架构与设计红线

- **严禁私造页面骨架**：二级页面必须统一接入 `AppSubPage`，不得自行拼凑带有未避让安全区的容器。
- **严禁直角与彩色边框**：不新增直角面板、彩色粗边框或高饱和度投影。
- **严禁私造与裸写按钮**：严禁在任何业务页面直接使用 Material 3 原生 `Button`、`FilledTonalButton`、`OutlinedButton`；严禁使用直角或方形按键，所有按钮必须统一引用 `AppButton`、`AppSecondaryButton` 或 `AppDangerButton`。
- **严禁按钮表面泛白**：严禁在按钮上方覆盖半透明白色反光雾层，确保科技蓝纯净通透。
- **严禁页面内部重复调用 `statusBarsPadding()`**。
- **严禁混用状态跳转与路由栈**：二级路由必须登记在 `parentTabForSubScreen`。
- **用户可见文案保持规范中文**（保留产品名、标准代码或国际协议字段原样）。

## 11. 标准公共组件库体系 (Component Library)

工程已全面完成公共组件模块化抽取，所有通用 UI 必须优先复用位于 `cn.pxyb.mycontrol.ui.components` 及 `cn.pxyb.mycontrol.util` 中的标准化组件，严禁在业务界面私自复制粘贴或手写重复实现：

业务页面、状态和业务专用组件归入 `ui.feature.<业务>`；导航与认证外壳归入 `ui.navigation`，启动界面归入 `ui.startup`。公共组件不依赖业务包。业务请求沿用现有 StateHolder / Controller，必须接入账号切换时的状态重置和锁屏、退出时的请求取消。

| 模块子包 | 组件名称 | 核心功能与设计亮点 |
| :--- | :--- | :--- |
| **`ui.components.input`** | `AppTextField` | 毛玻璃圆角输入框，自动带清空图标、密码眼睛显隐、Leading 图标与浮动错误避让 |
| | `AppSearchBar` | 现代全圆角胶囊搜索栏，支持实时清空按键与回车键盘响应 |
| | `AppSelectField` / `AppSelectOption` | 统一下拉选择字段，按选项值管理选中态，支持说明、禁用态与占位文字 |
| **`ui.components.picker`** | `AppWheelPicker<T>` | 解耦的高性能惯性轮盘，集成触觉微震动反馈与正居中选中刻度指示 |
| | `AppDatePickerModal` | 年月日标准滚轮弹窗，支持“今天/明天/周几”智能相对标签 |
| | `AppTimePickerModal` | 时分滚轮弹窗，支持开放范围、步长限制与弹窗自适应联动 |
| | `AppTimeRangePicker` | 起止双联时段卡片选择器，支持最短/最长时长合规校验与常用时长快速顺延推算 |
| **`ui.components.display`** | `AppActionRow` | 标准单元格行，支持图标底衬、双行文案、自定义尾部与按压弹性缩放 |
| | `AppSwitchRow` | 标准设置开关行，严格满足 48×48 dp 无障碍判定，自带振动反馈 |
| | `AppDetailRow` | 键值详情行，支持单行/折行对齐与一键点击/长按复制到剪贴板 |
| | `AppMetricCard` | 现代指标展示小卡片与自适应网格看板 (`AppMetricDashboard`) |
| | `AppAvatar` | 支持网络加载、首字母自动散列双色极光渐变兜底与在线状态圆点 |
| | `AppQrCode` | 二维码白底、留白与加载失败占位；登录和绑定流程由业务处理 |
| | `AppDivider` | 统一规范的发丝分割线，支持自定义起止内边距 |
| **`ui.components.feedback`** | `AppFeedbackBanner` | 极光微光毛玻璃胶囊操作反馈横幅，支持方案 D 倒计时微光进度环、4秒平滑淡出、3D 同心微徽标与胶囊重试 |
| | `AppEmptyState` | 标准居中空状态，带毛玻璃圆形底衬图标、主副说明文案与主次操作胶囊按键 |
| | `AppErrorState` | 标准错误面板，集成就地一键重试机制 |
| **`ui.components.filter`** | `AppFilterChip` / `AppFilterBar` | 胶囊形微凸毛玻璃多维筛选栏，支持横向平滑滚动 |
| | `AppSegmentedControl` / `AppChoiceRow` | 分段单选与带标题的选项行，统一选中语义和交互 |
| **`util`** | `QrUtils` | 集中统一的 Data URL Base64 二维码安全解析工具，杜绝各 Screen 私有重复实现 |
| | `DateTimeUtils` | 集中统一的平台时间、分钟值和相对时间格式化；仅需日末端点的业务显式传入 `allowEndOfDay = true` 解析 `24:00` |
