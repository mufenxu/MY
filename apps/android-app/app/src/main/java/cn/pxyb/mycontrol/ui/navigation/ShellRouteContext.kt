package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.foundation.layout.PaddingValues
import cn.pxyb.mycontrol.ui.AppViewModel
import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState
import cn.pxyb.mycontrol.ui.feature.search.GlobalSearchItem

/**
 * 认证外壳交给各路由分组的共享上下文。
 *
 * 路由注册按业务域拆在 `*Routes.kt` 里，它们原先直接闭包捕获外壳的局部变量；
 * 拆出去后统一从这里取。字段名与外壳内的局部变量保持一致，搬迁路由时不必改写调用。
 * 外壳用 `remember` 按字段值缓存实例：只有字段变化才会重建导航图，与拆分前的行为一致。
 */
internal class ShellRouteContext(
    val viewModel: AppViewModel,
    val state: AppEntryUiState,
    val currentRoute: String,
    val searchTarget: GlobalSearchItem?,
    val contentPadding: PaddingValues,
    val onRefresh: () -> Unit,
    val navigateBackFromSubScreen: () -> Unit,
    val navigateToTab: (MainTab) -> Unit,
    val navigateToSubScreen: (String) -> Unit,
    val onSensitiveActionConfirmation: suspend () -> Boolean,
)
