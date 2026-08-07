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
- 页面默认水平边距 `16.dp`、顶部内容间距 `8.dp`、底部内容间距 `16.dp`；不要在页面内复制另一套常量。
