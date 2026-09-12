package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.ui.AppUiState

@Immutable
data class GoogleAccountDeskUiState(
    val busyAction: String?,
    val googleAccounts: List<GoogleAccountRecord>,
    val googleAccountMigrationPending: Boolean,
    val loading: Boolean = false,
    val error: String? = null,
)

internal fun AppUiState.toGoogleAccountDeskUiState() = GoogleAccountDeskUiState(
    busyAction = actions.running.firstOrNull { it == "google-accounts" },
    googleAccounts = googleAccounts,
    googleAccountMigrationPending = googleAccountMigrationPending,
    loading = googleAccountsLoading,
    error = googleAccountsError,
)
