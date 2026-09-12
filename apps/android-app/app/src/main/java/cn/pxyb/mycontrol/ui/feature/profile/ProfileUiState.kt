package cn.pxyb.mycontrol.ui.feature.profile

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.SectionLoadState
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources
import cn.pxyb.mycontrol.update.AppUpdateUiState

@Immutable
data class NetworkHealth(
    val latencyMs: Long? = null,
    val status: String = "unknown",
    val gatewayUrl: String = "",
    val checkedAtMillis: Long? = null,
    val dnsOk: Boolean = true,
    val apiOk: Boolean = true,
    val message: String? = null,
    val certificateDaysRemaining: Long? = null,
    val checks: List<NetworkCheckResult> = emptyList(),
)

@Immutable
data class NetworkCheckResult(
    val label: String,
    val ok: Boolean,
    val detail: String,
)

@Immutable
data class CacheStorageInfo(
    val snapshotSizeBytes: Long = 0L,
    val workspaceSizeBytes: Long = 0L,
    val cacheDirSizeBytes: Long = 0L,
    val totalFormatted: String = "0 B",
    val lastCleanedAtMillis: Long? = null,
)

@Immutable
data class ProfileUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val security: SecurityData?,
    val alertPreferences: AlertPreferences = AlertPreferences(),
    val latestRelease: ReleaseData? = null,
    val appUpdate: AppUpdateUiState = AppUpdateUiState(),
    val webLoginLink: WebLoginLink? = null,
    val cacheStorageInfo: CacheStorageInfo = CacheStorageInfo(),
    val unreadAlerts: Int = 0,
    val assistantButtonVisible: Boolean = true,
    val offlineMode: Boolean = false,
    val pendingTodoMutations: Int = 0,
    val sectionLoadStates: Map<DataSection, SectionLoadState> = emptyMap(),
)

internal fun AppUiState.toProfileUiState() = ProfileUiState(
    refreshing = isRefreshing(DataSection.Security),
    sectionError = sectionError(DataSection.Security),
    busyAction = busyAction ?: actions.running.firstOrNull { "security" in actionResources(it) },
    user = user,
    security = security,
    alertPreferences = alertPreferences,
    latestRelease = releases,
    appUpdate = appUpdate,
    webLoginLink = webLoginLink,
    cacheStorageInfo = cacheStorageInfo,
    unreadAlerts = alerts.activeUnreadCount(),
    assistantButtonVisible = assistantButtonVisible,
    offlineMode = offlineMode,
    pendingTodoMutations = pendingTodoMutations,
    sectionLoadStates = sectionLoadStates,
)
