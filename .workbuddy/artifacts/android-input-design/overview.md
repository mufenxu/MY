# 输入框重设计 · 方案 A「填充胶囊」落地记录

## 结论

用户从 4 套候选中选定 **A 填充胶囊**，已落地到共享组件层，全 App 所有输入框与搜索栏自动生效，业务页面零改动。

## 问题诊断（为什么原来不好看）

原 `AppTextField` 三个问题叠加：

1. 用 `Modifier.shadow(2.dp)` 撑形，而 `unfocusedBorderColor = Color.Transparent` —— 默认态没有任何边界线，视觉上像一颗按钮而不是输入区。
2. 深色模式下 2dp 阴影在 `#101419` 底上完全读不出来，输入框与页面糊成一片。
3. 只有聚焦才突然出现一圈 1dp 蓝边，状态切换是"跳变"而不是渐变。

## 最终规格（方案 A）

| 属性 | 取值 |
| --- | --- |
| 填充色 | `colorScheme.surfaceVariant`（= `FieldSurface`，浅 `#EDF0F6` / 深 `#293340`） |
| 聚焦填充 | `colorScheme.surface`（浅色转白 / 深色转深，靠亮度差 + 描边双重反馈） |
| 圆角 | 单行 `RoundedCornerShape(50)` 胶囊；多行 `24.dp` |
| 高度 | 最小 `54.dp`（原 58dp，热区仍 > 48dp） |
| 阴影 | **移除**（`Modifier.shadow` 已删） |
| 边框 | 默认/禁用 `Transparent`；聚焦 `primary`；错误 `error` |
| 光标 | `primary` |

> 注：`OutlinedTextFieldDefaults.colors()` 在项目当前 Compose BOM(2026.06.00) 的签名里**没有** `focusedBorderWidth` 系列参数，聚焦描边宽度只能取 M3 默认实现。若要更粗的 2dp 内框，得换自定义 `decorationBox` 或 `Modifier.border` 叠加，属于后续可选优化。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `app/src/main/java/.../ui/components/input/AppTextField.kt` | 移除 shadow 与 import；高度 58→54dp；colors 全面切换为填充式（容器、边框、错误态） |
| `app/src/main/java/.../ui/components/input/AppSearchBar.kt` | 圆角 16dp→胶囊；容器 `surfaceContainerLow`→`surfaceVariant`；聚焦从"细描边"改为"转亮容器 + 主色描边"；删除不再需要的 `isAppInDarkTheme` 分支 |
| `app/src/main/java/.../ui/feature/auth/LoginFields.kt` | 登录页自绘 `LoginTextField` 对齐：圆角 16dp→胶囊，聚焦底色 `surfaceContainerHigh`→`surface` |
| `app/src/debug/java/.../ui/components/DesignSystemPreviews.kt` | 预览补齐密码 / 多行 / 禁用 / 搜索栏四种状态，便于 IDE 内直接核对真实渲染 |

## 验证

- `npm run check:android-design`：通过（138 个业务文件）
- `./gradlew :app:compileDebugKotlin`：BUILD SUCCESSFUL
- 本机未出包（按项目口径，包只由 GitHub Actions 产出）。**真机视觉需以下一个 CI 包确认**，重点看深色模式下聚焦态对比度是否足够。

## 回滚

单提交内 4 个文件，`git revert` 即可完全还原；不涉及资源、Manifest、依赖变更，无数据迁移风险。

## 未采用的方案

- B 柔和描边卡（14dp + 常显 1dp 描边 + 聚焦光晕）：状态区分最稳，若后续觉得胶囊"太像按钮"，这是首选替换项。
- C 浮动标签盒：标签挖洞色必须跟随宿主面板，放 `AppPanel` 白卡上会出现补丁。
- D 图标槽：只适合登录/绑定类重点表单，不适合全 App 铺开。

预览页：`index.html`（同目录），含 4 套方案的浅/深色六状态对照。
