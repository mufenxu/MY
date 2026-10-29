package cn.pxyb.mycontrol.testing

import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState
import cn.pxyb.mycontrol.ui.navigation.MainTab

/**
 * 登录页的设备侧测试状态。
 *
 * 只覆盖登录页真正读取的字段，其余保持"访客刚打开 App"的默认形态，
 * 这样断言失败时能直接指向被改坏的界面行为，而不是被无关字段干扰。
 */
internal fun loginState(
    loginBusy: Boolean = false,
    secondFactorRequired: Boolean = false,
    recoveryCodeAllowed: Boolean = false,
    botChallengeRequired: Boolean = false,
    botChallengeReady: Boolean = false,
    suggestedUsername: String = "",
    loginCapabilitiesLoading: Boolean = false,
    loginCapabilitiesError: String? = null,
    error: String? = null,
    message: String? = null,
) = AppEntryUiState(
    booting = false,
    locked = false,
    user = null,
    selectedTab = MainTab.Overview,
    loginBusy = loginBusy,
    secondFactorRequired = secondFactorRequired,
    recoveryCodeAllowed = recoveryCodeAllowed,
    loginEnrollment = null,
    loginRecoveryCodes = emptyList(),
    botChallengeRequired = botChallengeRequired,
    botChallengeReady = botChallengeReady,
    androidPasskeySupported = false,
    suggestedUsername = suggestedUsername,
    deviceLoginBusy = false,
    deviceLoginQrDataUrl = null,
    deviceLoginError = null,
    qrLoginOpen = false,
    pendingAuthenticatorUri = null,
    accountManagementOpen = false,
    googleAccountDeskOpen = false,
    githubProjectsOpen = false,
    globalSearchOpen = false,
    assistantOpen = false,
    assistantButtonVisible = false,
    workspaceDestination = null,
    pendingLibrarySeatMyReservations = false,
    pendingChaoxingOpen = false,
    error = error,
    message = message,
    loginCapabilitiesLoading = loginCapabilitiesLoading,
    loginCapabilitiesError = loginCapabilitiesError,
)
