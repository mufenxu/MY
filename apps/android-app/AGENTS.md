# Android App 工作与设计规范 (2026 升级版)

## 1. 页面安全区与脚手架

- **系统安全区由外壳统一管理**：认证后的页面统一由 `AuthenticatedShell` 处理 `WindowInsets.safeDrawing`；页面内部**严禁再次调用 `statusBarsPadding()`**，避免产生双重顶部空白。
- **推荐统一使用标准脚手架 `AppSubPage`**：
  新增二级页面一律使用共享脚手架 `AppSubPage`（位于 `ui/AppLayout.kt`），它已自动集成 `BackHandler`、`AppSecondaryHeader`、缓存极光背景、大屏宽度限制（`AppTabletContentMaxWidth = 1120.dp`）、统一间距与可选下拉刷新。禁止再手写冗余的 `LazyColumn` 样板代码。
- **二级页头交互模式规范 (`pinHeader`)**：
  - **吸顶模式 (`pinHeader = true`)**：适用于**长信息流、大量数据列表、全局搜索、操作日志、发布管理**等页面。页头固定悬浮在顶部并透出毛玻璃背景，确保用户深层滑动后标题上下文不丢失、随时可一键返回或执行页头操作。
  - **随动模式 (`pinHeader = false`，默认)**：适用于**短卡片页、设置表单页、概要信息页**等内容较短的页面，页头作为列表首项随内容滑动。
- **路由与返回约束**：
  新增二级路由必须在 `parentTabForSubScreen` 登记唯一父页面；页头返回和系统返回统一调用认证导航外壳的回退方法，页面内部不得混用状态关闭与 `NavController.popBackStack()`。

## 2. 视觉与材质约束

- **毛玻璃拟态 (Glassmorphism)**：
  - 核心质感见 `ui/Glassmorphism.kt`：半透明磨砂表面 (`glassCardColor()`) + 顶部高光渐变 + 发丝描边 (`1.dp outlineVariant`，alpha ≈ 0.45) + **0 阴影投影**（严禁添加深色阴影，防止出现灰色脏晕边）。
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
  - 弹窗：`AppDialog`（含 `AppDialogPrimaryButton`/`AppDialogSecondaryButton`/`AppDialogDangerButton`）
  - 开关：`AppSwitch`（内置 48dp 热区与微震动）
  - 反馈条：`FeedbackBanner`
  - 加载态与空状态：`LoadingBlock("文案")` / `EmptyBlock("标题", "说明")`

## 6. 红线

- **严禁私造页面骨架**：二级页面必须统一接入 `AppSubPage`，不得自行拼凑带有未避让安全区的容器。
- **严禁直角与彩色边框**：不新增直角面板、彩色粗边框或高饱和度投影。
- **严禁页面内部重复调用 `statusBarsPadding()`**。
- **严禁混用状态跳转与路由栈**：二级路由必须登记在 `parentTabForSubScreen`。
- **用户可见文案保持规范中文**（保留产品名、标准代码或国际协议字段原样）。

## 7. 新增页面标准检查清单

1. **路由登记**：在 `parentTabForSubScreen` 中登记唯一父页面，返回由导航外壳调度。
2. **骨架选型**：直接使用 `AppSubPage`。长信息流设置 `pinHeader = true`，短卡片设置 `pinHeader = false`。
3. **触控与无障碍**：操作按钮必须使用 `AppHeaderIconButton`，图标注明中文 `contentDescription`。
4. **令牌对齐**：使用 `Color.kt`、`AppTypography` 与 `12.dp` 列表垂直间距。
5. **触感动效**：关键交互接入 `AppHaptics` 与 `MotionTokens`。
6. **视觉回归对照**：与 `GlobalSearchScreen`、`GitHubProjectsScreen` 对照自查，确保毛玻璃与极光风格浑然一体。
