package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.GoogleAccountRecord

/**
 * 邮箱台账界面（`GoogleAccountDeskScreen`）使用的投影。
 *
 * 与 [GoogleAccountsUiState] 的差别只在多了全局的 [busyAction]：
 * 写操作走共享的 `ActionStateHolder`，忙碌标记天然属于全局动作通道。
 */
@Immutable
data class GoogleAccountDeskUiState(
    val busyAction: String?,
    val googleAccounts: List<GoogleAccountRecord>,
    val googleAccountMigrationPending: Boolean,
    val loading: Boolean = false,
    val error: String? = null,
)

internal fun GoogleAccountsUiState.toGoogleAccountDeskUiState(busyAction: String?) = GoogleAccountDeskUiState(
    busyAction = busyAction,
    googleAccounts = accounts,
    googleAccountMigrationPending = migrationPending,
    loading = loading,
    error = error,
)
