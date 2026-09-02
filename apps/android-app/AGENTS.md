# Android App 工作规范

## 页面安全区

- 认证后的页面统一由 `AuthenticatedShell` 处理 `WindowInsets.safeDrawing`；页面内部不要再次调用 `statusBarsPadding()`，避免双重顶部留白。
- 页面主体统一使用 `appPageContentPadding(contentPadding)`；只有明确的紧凑页面才覆盖 `topSpacing` 或 `bottomSpacing`。
- 新增二级页面统一使用 `AppSecondaryHeader`，返回按钮放左侧，标题和副标题居中占据剩余空间，页面操作放右侧。
- 新增二级路由必须在 `parentTabForSubScreen` 登记唯一父页面；页头返回和系统返回统一调用认证导航外壳的回退方法，页面内部不得混用状态关闭与 `NavController.popBackStack()`。
- 登录、锁屏、扫码和弹窗不经过认证导航外壳，需要在各自根容器处理系统栏安全区。

## 视觉约束

- 保持现有浮动胶囊底部导航的形状、尺寸、颜色和选中动画；系统手势区避让由外层处理。
- 卡片、搜索框、弹窗和页头操作沿用共享组件与圆角令牌，不新增直角面板或彩色边缘装饰线。
- 页面默认边距遵循 `AppLayout.kt` 共享常量（水平 `16.dp`、底部 `16.dp` 等）；不要在页面内复制另一套常量。

## 标准页面骨架

所有认证后的新增页面（含二级页）必须套用统一骨架，代码对照 `GlobalSearchScreen.kt`、`GoogleAccountDeskScreen.kt` 和最近的 `GitHubProjectsScreen.kt`：

- 根容器统一为 `LazyColumn`：`Modifier.fillMaxSize().auroraBackdrop(dark)` + `contentPadding = appPageContentPadding(contentPadding)` + `verticalArrangement = Arrangement.spacedBy(12.dp)`。
- 页面底层必须绘制极光背景 `auroraBackdrop`（毛玻璃卡片需要它透出统一质感）；不要漏掉这一层，直接画纯色背景会与整体风格脱节。
- 二级页头 `AppSecondaryHeader` 作为 `LazyColumn` 的第一个 `item` 随内容滚动，不要固定悬浮在页面顶部。
- 加载中统一使用共享 `LoadingBlock("文案")` 作为列表项；空状态用居中文本块或共享 `EmptyBlock`，不要自绘整屏转圈或整屏空态。
- 列表内容用 `item`/`items` 输出，列表项间距统一 `12.dp`，不再出现 `8.dp`/`10.dp` 等变体。

## 组件与视觉令牌（唯一来源）

- 视觉令牌只能取自 `ui/theme/Color.kt`（颜色）、`ui/theme/Type.kt`（`AppTypography`/`AppShapes`）、`ui/AppLayout.kt`（间距与页头）；页面内禁止硬编码 `Color(0x...)`、字号或圆角，新颜色先加入 `Color.kt`/`ColorTokens`。
- 卡片统一为 `Surface` + 圆角 `20.dp` + `glassCardColor()` + `1.dp` `outlineVariant`（alpha ≈ `0.45`）描边 + 无投影；不新增直角面板，也不加深投影（毛玻璃面板一律靠发丝描边与顶部高光分层）。
- 弹窗一律用 `AppDialog`（含 `AppDialogPrimaryButton`/`AppDialogSecondaryButton`）；开关用 `AppSwitch`；弹窗输入用 `DialogTextField`；反馈条用 `FeedbackBanner`；指标格用 `MetricCell`。
- 状态徽标/图标底色只允许使用 `Amber/Coral/Ocean/Forest` 等语义色及其 Pale 容器色，不做页面私有色板。
- 毛玻璃视觉语言见 `ui/Glassmorphism.kt`：半透明表面 + 顶部高光 + 发丝描边，不加彩色边缘装饰线。
- 边距、页头操作尺寸等一律引用 `AppLayout.kt` 共享常量（如 `AppPageHorizontalPadding`、`AppPageActionSize`），不在页面里复制另一套常量。

## 红线

- 不改浮动胶囊底部导航的形状、尺寸、颜色和选中动画；系统手势区避让由外层处理。
- 不新增直角面板、彩色边缘装饰线或色条。
- 页面内部不二次调用 `statusBarsPadding()`。
- 不混用状态关闭与 `NavController.popBackStack()`；二级路由必须登记唯一父页面。
- 用户可见文案保持中文（保留产品名/协议字段等英文术语原样）。

## 新增页面检查清单

1. 二级路由在 `parentTabForSubScreen` 登记唯一父页面，返回统一走外壳回退。
2. 套用“标准页面骨架”：极光背景 + 页头入列表 + `12.dp` 间距 + `appPageContentPadding`。
3. 复用共享组件与令牌，不硬编码颜色/字号/圆角/间距。
4. 弹窗、开关、输入、徽标、加载与空状态走共享组件。
5. 完成后与 `ProfileScreen`/`GlobalSearchScreen` 对照自查，不允许出现“另一个皮肤”的突兀感。
