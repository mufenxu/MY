# Android App 工作与设计规范 (2026 升级版)

## 1. 页面安全区与脚手架

- **系统安全区由外壳统一管理**：认证后的页面统一由 `AuthenticatedShell` 处理 `WindowInsets.safeDrawing`；页面内部**严禁再次调用 `statusBarsPadding()`**，避免产生双重顶部空白。
- **推荐统一使用标准脚手架 `AppSubPage`**：
  新增二级页面一律使用共享脚手架 `AppSubPage`（位于 `ui/components/layout/AppLayout.kt`），它已自动集成 `BackHandler`、`AppSecondaryHeader`、主题背景、大屏宽度限制（`AppTabletContentMaxWidth = 1120.dp`）、统一间距与可选下拉刷新。禁止再手写冗余的 `LazyColumn` 样板代码。
- **统一滚动规则**：
  所有主页面与二级页面仅固定顶部悬浮胶囊栏，以叠层覆盖内容，周围留白透明；首屏避让使用滚动内容内边距，禁止固定整块顶部占位。自定义 `body` 使用脚手架传入的顶部内边距。副标题、统计、筛选、课表切换和快捷指令进入内容滚动区；聊天输入框等必要操作区保留原位。`AppSubPage` 不再提供 `pinHeader` 开关，下拉刷新只作用于内容区。
- **路由与返回约束**：
  新增二级路由必须在 `parentTabForSubScreen` 登记唯一父页面；页头返回和系统返回统一调用认证导航外壳的回退方法，页面内部不得混用状态关闭与 `NavController.popBackStack()`。

## 2. 视觉与材质约束

- **主题表面与背景**：
  - 当前固定采用选定的 Material 分区方案，深浅色取自 `Theme.kt` / `Color.kt`；不保留候选方案切换或演示账号入口。
  - 面板复用 `AppPanel`，使用主题实色表面、20.dp 圆角与 0 阴影；不要重新添加旧版顶部高光渐变。
  - `Glassmorphism.kt` 保留共享接口：`glassCardColor()` 返回主题表面色，`auroraBackdrop()` 返回主题背景色；`glassPanel()` 保留细描边，加载微光仍由 `glassShimmer()` 提供。
- **顶部悬浮胶囊导航**：
  采用“迷你浮岛”：滚动超过 64dp 收拢至约 186dp 宽、44dp 视觉高度，回到顶部 12dp 内展开；按钮保留 48dp 热区，操作进入“更多”。固定首屏内容内边距，不随收缩改变。搜索输入栏保留展开。
  主页面与二级页面统一使用 `AppSecondaryHeader` / `AppTopBarSurface`，标题单行省略，说明放在栏外；搜索输入嵌入同一胶囊表面。保留原有返回与业务操作，触控区至少 48dp，深浅色跟随主题。
- **底部浮动胶囊导航**：
  使用统一的轻量胶囊底栏：清晰的未选中图标、浅色选中背景与克制的颜色过渡，不使用图标弹跳或高饱和度光晕。手机端助手入口与导航并列停靠，禁止覆盖内容区；系统手势区避让由外层处理。
- **布局间距标准**：
  - 列表项垂直间距统一为 `12.dp`，新增列表一律使用 `12.dp`，不得引入 `10.dp`/`14.dp` 等新变体；
  - 组件内部紧凑排布与图标-文字间隙可用 `4.dp`/`8.dp`；`AppPanel` 只提供表面，不添加内容内边距，普通内容由调用方设置 `16.dp`；设置列表使用 `AppGroupedCard`，行内边距交给 `AppActionRow`；
  - 页面水平边距统一引用 `AppPageHorizontalPadding` (16.dp)，底部边距统一引用 `AppPageBottomSpacing` (16.dp)。
  - 设计检查禁止业务页面使用垂直 `spacedBy(10.dp)` / `spacedBy(14.dp)`；保留紧凑内容所需的 `4.dp` / `8.dp`，不要把所有组件内部间距机械替换为 `12.dp`。

## 3. 触控热区与无障碍 (A11y & Touch Target)

- **48×48 dp 触控热区准则**：
  - 遵循 Android 与 Material 3 官方无障碍规范，所有可点击交互元素（按钮、页头操作图标、开关等）必须满足 **至少 48×48 dp** 的触摸判定范围。
  - 页头图标按钮统一使用 `AppHeaderIconButton`，其视觉大小保持精致的 `36.dp`，底层通过 `.minimumInteractiveComponentSize()` 自动扩展触控判定热区至 48dp。
- **语义与文本无障碍**：
  - 所有图标按钮必须配置语义清晰的中文 `contentDescription`（如“返回”、“刷新”、“新建 Release”），禁止传空或无意义文本；
  - 关键卡片和列表项设置 `role = Role.Button` 或 `Role.Tab`；筛选项必须暴露选中语义，单选筛选组使用 `selectableGroup`；
  - 文本排版禁止使用定死容器高度（如严禁 `.height(40.dp)` 包裹未知长度文字），应使用 `.heightIn(min = 40.dp)` 或内边距自撑开，防止系统大字号模式下文本被截断。

## 4. 动效与触觉反馈系统 (Motion & Haptics)

- **动效令牌 (`ui/theme/Motion.kt`)**：
  - 禁止在页面内散落手写随意的时间常量；
  - 微交互（图标缩放、指示器、高亮切换）：`MotionTokens.DurationShort` (160ms)；
  - 组件与卡片过渡展开：`MotionTokens.DurationMedium` (240ms)；
  - 页面级转场与弹窗展开：`MotionTokens.DurationLong` (320ms)；加载微光、设备状态旋转和呼吸分别使用 `DurationShimmer`、`DurationStatusRotation`、`DurationStatusPulse`。验证码倒计时等业务时钟保留真实时间，不套用装饰动效时长；
  - 已选定“柔韧跟手”：按下使用 `MotionTokens.pressTween()`，松开使用 `releaseSpring()`，按压缩放幅度不超过 3%；导航指示器、开关位移、展开和页面进入使用 `softSpring()`，弹层进入使用 `sheetSpring()`。颜色、透明度和退出仍使用短缓动，不循环弹跳。
- **触觉微反馈 (`AppHaptics`)**：
  - 底部导航 Tab 切换、`AppSwitch` 开关切换、分段选择：触发 `AppHaptics.tick(haptics)`；
  - `PullToRefresh` 下拉刷新超过临界刻度：触发 `AppHaptics.refreshSnap(haptics)`；
  - 危险操作（如删除、强制同步、权限确认）：触发 `AppHaptics.heavy(haptics)`。

## 5. 组件与视觉令牌（唯一来源）

- **颜色令牌**：只能取自 `ui/theme/Color.kt` 与 `ColorTokens`，严禁在页面内硬编码 `Color(0x...)`。品牌操作使用 `MaterialTheme.colorScheme.primary/onPrimary`；状态使用 `ColorTokens` 的成组前景/底色；扫描器等业务专用色也集中定义在 `Color.kt`。`Theme.kt` 直接组装最终深浅配色，不再二次覆盖。
- **字体与形状**：排版样式使用 `MaterialTheme.typography`（由 `AppTypography` 注入），业务页面不覆盖数值字号。正文用 `body*`、辅助标签用 `label*`、大数值或验证码用 `display*`；圆角规范使用 `AppShapes`（独立卡片统一为 20.dp 圆角）。
- **通用组件复用**：
  - 二级页面骨架：`AppSubPage`
  - 卡片面板：`AppPanel`
  - 页头操作：`AppSecondaryHeader` / `AppHeaderIconButton`
## 6. 统一按钮体系与操作规范 (Button System Specification)

全 App 所有页面的按钮必须统一使用封装好的主题实色胶囊按钮族（位于 `ui/components/button/AppButtons.kt`），**严禁在任何业务界面裸写 Material 3 原生 `Button`、`FilledTonalButton`、`OutlinedButton`**。

- **三级按钮体系选型准则**：
  1. **主行动按钮 (`AppButton`)**：
     - **视觉形态**：全圆角胶囊 `RoundedCornerShape(50)`，最小高度 `48.dp`；
     - **实色表面**：使用 `colorScheme.primary` 实色；浅色为蓝底白字，深色为浅蓝底深字，文字取 `onPrimary`；
     - **层次**：不添加阴影、高光或渐变描边；
     - **纯净原则（坚决不泛白）**：**绝对禁止在按钮表面叠加半透明白色高光雾蒙层**，蓝白文字对比必须锋利纯正；
     - **交互触觉**：内置 `pressFeedback` 物理弹性微缩放（按下最多 0.97 缩放）+ `AppHaptics.tick` 细腻物理微震动；
     - **状态集成**：直接支持 `loading = true` 平滑加载转圈动画与 `icon` 矢量图标，无需外层手写 `CircularProgressIndicator` 样板代码。
  2. **次要行动按钮 (`AppSecondaryButton`)**：
     - 采用全圆角胶囊、中性 `surfaceContainerHigh` 实色底色，不加阴影或彩色渐变边框，用于“取消”、“查看说明”、“返回查询”、“写入 NFC”等次要操作，清爽通透，绝不发灰泛白。
  3. **危险/破坏性按钮 (`AppDangerButton`)**：
     - 采用主题 `error` / `onError` 实色配对，用于“删除”、“撤销”、“清空”、“重置”等不可逆高危操作，警示明确、质感高级。
  4. **弹窗按钮配套**：
     - 弹窗内的操作按钮统一使用 `AppDialogPrimaryButton`、`AppDialogSecondaryButton`、`AppDialogDangerButton`，底层已全量委托映射至上述三级胶囊按钮。
     - 注意这三个符号位于同包的 **`ui/components/button/AppDialogButtons.kt`**（不是 `AppButtons.kt`）；`AppButtons.kt` 只放三级胶囊主体与行内危险微胶囊。
  5. **行内轻量危险微胶囊 (`AppInlineDangerButton`)**：
     - 专用于列表项、卡片行内右侧的次要危险操作（如“撤销会话”、“移除设备”、“解绑”），高度自适应约 `26~28.dp`，采用柔和微透危险红 + 浅红发丝微切边 + 全圆角胶囊，警示明确且体量克制，严禁在列表项行内塞入全尺寸大红实心按钮以防遮挡同行信息。
     - 真实取色以 `ColorTokens.Red` 为准：`container = #FEF2F2`、`foreground = #B91C1C`、`border = #FECACA`（`AppButtons.kt`）。严禁硬编码形如 `#FEE2E2` 的近似色。

- **按钮设计红线**：
  - **严禁**使用直角、小圆角（如 8dp/10dp/12dp）或方形按钮，必须保持 `RoundedCornerShape(50)` 胶囊圆角；
  - **严禁**在按钮表面覆盖白色渐变雾层导致表面泛白起雾；
  - **严禁**在业务页面私自使用原生 `Button(...)`、`OutlinedButton(...)` 拼凑粗糙按钮。

- **表单与选择**：输入框统一使用 `AppTextField`；日期、时间等弹出选择器的入口使用 `AppPickerField`，不要用禁用输入框包裹点击事件。输入框和选择框统一 16dp 圆角与主题字段底色；`AppSelectField` 使用共享底部选择面板，保留单选语义与可滚动选项。弹窗不叠加白色高光，按钮区间距为 12dp。

## 7. 加载与网络容错规范 (Loading & Resilience)

- **骨架屏优先原则**：
  - 页面初次加载或长列表异步拉取时，严禁使用突兀的居中大菊花。应采用 `GlassShimmerList` 预占位，数据到达后自然渲染；
  - 微光动画必须使用 `Modifier.glassShimmer(dark)`，渐变光斑自适应深浅色，禁止生硬刺眼的白光。
- **就地一键重试 (Inline Retry)**：
  - 异步请求失败时，`AppFeedbackBanner(message, error = true, onRetry = { ... })`（位于 `ui/components/feedback/AppFeedbackBanner.kt`，注意符号名带 `App` 前缀）必须尽可能传入重试操作，允许用户就地重新发起请求，严禁迫使用户只能退出重进或整页下拉。

- **反馈类型与持续时间**：
  - `Success` 表示已完成的操作，默认 4 秒后关闭，并采用系统无障碍建议的停留时间；
  - `Info` / `Warning` / `Error` 默认持续显示。离线、待同步、功能边界等持续状态使用 `Info` 或 `Warning`，并设置 `showCloseButton = false`，由真实状态解除提示；
  - `error = false` 仅用于成功结果，不用于一般说明；重试优先重读数据，不自动重放删除、预约等有副作用的操作。
- **长列表**：可增长的记录列表接入页面 `LazyListScope`，不要把整个记录集合放进单个 `item` 的 `Column`；保留加载、空状态和稳定的项目标识。

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
- **纯文字操作的现状说明**：内部 `TextButton` 仍用于少量行内文字操作，当前**尚未**封装对应的胶囊化纯文字组件。这属于已知技术债：新增纯文字操作请优先复用 `AppSecondaryButton` 或 `AppInlineDangerButton`；确需行内纯文字入口时，暂沿用现有 `TextButton` 写法，**不要**自行新造第四套按钮样式，也不要直接补丁式扩展 `AppButtons.kt`。
- **严禁页面内部重复调用 `statusBarsPadding()`**。
- **严禁混用状态跳转与路由栈**：二级路由必须登记在 `parentTabForSubScreen`。
- **用户可见文案保持规范中文**（保留产品名、标准代码或国际协议字段原样）。

## 10. 标准公共组件库体系 (Component Library)

工程已建立公共组件库，所有通用 UI 必须优先复用位于 `cn.pxyb.mycontrol.ui.components` 及 `cn.pxyb.mycontrol.util` 中的标准化组件，严禁在业务界面私自复制粘贴或手写重复实现：

业务页面、状态和业务专用组件归入 `ui.feature.<业务>`；导航与认证外壳归入 `ui.navigation`，启动界面归入 `ui.startup`。公共组件不依赖业务包。业务请求沿用现有 StateHolder / Controller，必须接入账号切换时的状态重置和锁屏、退出时的请求取消。

| 模块子包 | 组件名称 | 核心功能与设计亮点 |
| :--- | :--- | :--- |
| **`ui.components.input`** | `AppTextField` | 主题实色圆角输入框，自动带清空图标、密码眼睛显隐、Leading 图标与浮动错误避让 |
| | `AppSearchBar` | 现代全圆角胶囊搜索栏，支持实时清空按键与回车键盘响应 |
| | `AppPickerField` | 日期、时间等选择器入口，与选项字段共享表面与按钮语义 |
| | `AppSelectField` / `AppSelectOption` | 统一下拉选择字段，按选项值管理选中态，支持说明、禁用态与占位文字 |
| **`ui.components.picker`** | `AppWheelPicker<T>` | 解耦的高性能惯性轮盘，集成触觉微震动反馈与正居中选中刻度指示 |
| | `AppDatePickerModal` | 年月日标准滚轮弹窗，支持“今天/明天/周几”智能相对标签 |
| | `AppTimePickerModal` | 时分滚轮弹窗，支持开放范围、步长限制与弹窗自适应联动 |
| | `AppTimeRangePicker` | 起止双联时段卡片选择器，支持最短/最长时长合规校验与常用时长快速顺延推算 |
| **`ui.components.display`** | `AppActionRow` | 标准单元格行，支持图标底衬、双行文案、自定义尾部与按压弹性缩放 |
| | `AppSwitchRow` | 标准设置开关行，严格满足 48×48 dp 无障碍判定，自带振动反馈 |
| | `AppDetailRow` | 键值详情行，支持单行/折行对齐与一键点击/长按复制到剪贴板 |
| | `AppMetricCard` | 现代指标展示小卡片与自适应网格看板 (`AppMetricDashboard`) |
| | `AppAvatar` | 支持网络加载、首字母自动散列主题状态色兜底与在线状态圆点 |
| | `AppQrCode` | 二维码白底、留白与加载失败占位；登录和绑定流程由业务处理 |
| | `AppDivider` | 统一规范的发丝分割线，支持自定义起止内边距 |
| **`ui.components.feedback`** | `AppFeedbackBanner` | 主题反馈横幅；成功默认 4 秒关闭，信息/警告/错误默认持续显示，支持读屏播报、系统建议停留时间与就地重试 |
| | `AppEmptyState` | 标准居中空状态，带主题圆形底衬图标、主副说明文案与主次操作胶囊按键 |
| | `AppErrorState` | 标准错误面板，集成就地一键重试机制 |
| **`ui.components.filter`** | `AppFilterChip` / `AppFilterBar` | 带选中语义的胶囊多维筛选栏，支持横向平滑滚动 |
| | `AppSegmentedControl` / `AppChoiceRow` | 分段单选与带标题的选项行，统一选中语义和交互 |
| **`ui.components.dialog`** | `AppDialog` / `AppDialogSize` | 主题实色弹窗容器与尺寸档位，统一遮罩、圆角与进出场 |
| | `AppConfirmDialog` | 标准二次确认弹窗，危险操作必须走此组件而非自绘 |
| | `AppDialogForm` | 弹窗内表单容器，统一字段间距与校验提示位 |
| **`ui.components.interaction`** | `pressFeedback` | 统一按压弹性微缩放修饰符，自带触觉反馈；禁止各页面自行实现缩放动画 |
| **`util`** | `QrUtils` | 集中统一的 Data URL Base64 二维码安全解析工具，杜绝各 Screen 私有重复实现 |
| | `DateTimeUtils` | 集中统一的平台时间、分钟值和相对时间格式化；仅需日末端点的业务显式传入 `allowEndOfDay = true` 解析 `24:00` |
| | `BoundedInput` / `DeviceAuthentication` | 输入长度与格式边界校验、设备生物特征/凭据认证包装 |

> 本表记录**公共约定面**，不是全量清单。其余已抽取但仍未登记的公共组件包括：`AppSwitch`、`AppNotificationButton`、`AppLoadingState` / `AppShimmer` / `AppSkeleton*` / `AppToast`、`AppIconTile` / `AppListCard` / `AppMetricCell` / `AppSectionHeader` / `AppStatusBadge` / `AppStatusStyle` / `QuickActionGlassTile`、`AppGroupedCard`、`UiLayout.kt` 自适应网格助手，以及顶层 `ui.legal`、`ui.scanner`、`ui.state`（`ActionStateHolder` / `FeatureStateHolder`）。新增代码复用这些组件前，先确认签名再引用；不要把未登记的组件当成不存在而另写一份。

## 11. 设计检查与组件预览

- 根目录运行 `npm.cmd run check:android-design`，检查业务页面的原生按钮/字段/弹窗、硬编码颜色/字号和非标准垂直间距；已接入根 `check` 和 Android CI。
- 专用验证码输入保留 `BasicTextField`，身份码全屏展示保留专用 `Dialog`；这些例外不允许扩展成普通表单的替代体系。
- `app/src/debug/java/cn/pxyb/mycontrol/ui/components/DesignSystemPreviews.kt` 提供浅色、深色和 1.5 倍字号预览，仅进入 Debug 源集。预览涵盖按钮状态、字段错误、筛选选中、持续反馈、头像与指标。
- 源码检查和 Kotlin 编译不能代替实际渲染、TalkBack 或真机性能验证；报告时分别说明。
