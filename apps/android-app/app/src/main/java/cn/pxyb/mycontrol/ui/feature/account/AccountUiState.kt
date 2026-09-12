package cn.pxyb.mycontrol.ui.feature.account

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources

@Immutable
data class AccountManagementUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val security: SecurityData?,
    val androidPasskeySupported: Boolean,
    val appLockEnabled: Boolean,
    val totpEnrollment: TotpEnrollment?,
    val recoveryCodes: List<String>,
    val passkeys: List<PlatformPasskey>,
    val reauthenticatedUntil: Long,
    val error: String?,
    val message: String?,
    val actionErrors: Map<String, String> = emptyMap(),
    val actionCompletions: Map<String, Int> = emptyMap(),
)

internal fun AppUiState.toAccountManagementUiState() = AccountManagementUiState(
    refreshing = isRefreshing(DataSection.Security),
    sectionError = sectionError(DataSection.Security),
    busyAction = busyAction ?: actions.running.firstOrNull { "security" in actionResources(it) },
    user = user,
    security = security,
    androidPasskeySupported = androidPasskeySupported,
    appLockEnabled = appLockEnabled,
    totpEnrollment = totpEnrollment,
    recoveryCodes = recoveryCodes,
    passkeys = passkeys,
    reauthenticatedUntil = reauthenticatedUntil,
    error = error,
    message = message,
    actionErrors = actions.errors.filterKeys { "security" in actionResources(it) },
    actionCompletions = actions.completions.filterKeys { "security" in actionResources(it) },
)
