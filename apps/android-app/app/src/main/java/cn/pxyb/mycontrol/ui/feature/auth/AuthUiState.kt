package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination

@Immutable
data class AppEntryUiState(
    val booting: Boolean,
    val locked: Boolean,
    val user: PlatformUser?,
    val selectedTab: MainTab,
    val pendingTabNavigation: MainTab? = null,
    val loginBusy: Boolean,
    val secondFactorRequired: Boolean,
    val recoveryCodeAllowed: Boolean,
    val loginEnrollment: TotpEnrollment?,
    val loginRecoveryCodes: List<String>,
    val botChallengeRequired: Boolean,
    val botChallengeReady: Boolean,
    val androidPasskeySupported: Boolean,
    val suggestedUsername: String,
    val deviceLoginBusy: Boolean,
    val deviceLoginQrDataUrl: String?,
    val deviceLoginError: String?,
    val qrLoginOpen: Boolean,
    val pendingAuthenticatorUri: String?,
    val accountManagementOpen: Boolean,
    val googleAccountDeskOpen: Boolean,
    /** 参与 [cn.pxyb.mycontrol.ui.navigation.requestedRoute] 的二级界面推导，不能当作纯展示字段删除。 */
    val githubProjectsOpen: Boolean,
    val globalSearchOpen: Boolean,
    val assistantOpen: Boolean,
    val assistantButtonVisible: Boolean,
    val workspaceDestination: WorkspaceDestination?,
    val pendingLibrarySeatMyReservations: Boolean,
    val pendingChaoxingOpen: Boolean,
    val error: String?,
    val message: String?,
    val loginCapabilitiesLoading: Boolean = false,
    val loginCapabilitiesError: String? = null,
)

@Immutable
data class QrLoginUiState(
    val qrLoginBusy: Boolean,
    val qrLoginTarget: QrLoginTarget?,
    val qrLoginError: String?,
)

internal fun AppUiState.toEntryUiState() = AppEntryUiState(
    booting = booting,
    locked = locked,
    user = user,
    selectedTab = selectedTab,
    pendingTabNavigation = pendingTabNavigation,
    loginBusy = loginBusy,
    secondFactorRequired = secondFactorRequired,
    recoveryCodeAllowed = recoveryCodeAllowed,
    loginEnrollment = loginEnrollment,
    loginRecoveryCodes = loginRecoveryCodes,
    botChallengeRequired = botChallengeRequired,
    botChallengeReady = botChallengeReady,
    androidPasskeySupported = androidPasskeySupported,
    loginCapabilitiesLoading = loginCapabilitiesLoading,
    loginCapabilitiesError = loginCapabilitiesError,
    suggestedUsername = suggestedUsername,
    deviceLoginBusy = deviceLoginBusy,
    deviceLoginQrDataUrl = deviceLoginQrDataUrl,
    deviceLoginError = deviceLoginError,
    qrLoginOpen = qrLoginOpen,
    pendingAuthenticatorUri = pendingAuthenticatorUri,
    accountManagementOpen = accountManagementOpen,
    googleAccountDeskOpen = googleAccountDeskOpen,
    githubProjectsOpen = githubProjectsOpen,
    globalSearchOpen = globalSearchOpen,
    assistantOpen = assistantOpen,
    assistantButtonVisible = assistantButtonVisible,
    workspaceDestination = workspaceDestination,
    pendingLibrarySeatMyReservations = pendingLibrarySeatMyReservations,
    pendingChaoxingOpen = pendingChaoxingOpen,
    error = error,
    message = message,
)

internal fun AppUiState.toQrLoginUiState() = QrLoginUiState(
    qrLoginBusy = qrLoginBusy,
    qrLoginTarget = qrLoginTarget,
    qrLoginError = qrLoginError,
)
