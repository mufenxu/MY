package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable

import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TrendSample
import cn.pxyb.mycontrol.data.WebLoginLink

@Immutable
data class AppEntryUiState(
    val booting: Boolean,
    val locked: Boolean,
    val user: PlatformUser?,
    val selectedTab: MainTab,
    val loginBusy: Boolean,
    val secondFactorRequired: Boolean,
    val recoveryCodeAllowed: Boolean,
    val androidPasskeySupported: Boolean,
    val suggestedUsername: String,
    val qrLoginOpen: Boolean,
    val accountManagementOpen: Boolean,
    val googleAccountDeskOpen: Boolean,
    val globalSearchOpen: Boolean,
    val workspaceDestination: WorkspaceDestination?,
    val focusTaskId: String?,
    val error: String?,
    val message: String?,
)

@Immutable
data class OverviewUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val overview: OverviewData?,
    val externalApplications: List<ExternalApplication>,
    val incidents: List<IncidentInfo>,
    val offlineMode: Boolean,
    val cachedAtMillis: Long?,
    val homeQuickActionOrder: List<HomeQuickAction>,
    val hiddenHomeQuickActions: Set<HomeQuickAction>,
    val todoSnapshot: TodoSnapshot,
    val timetable: CampusTimetable?,
    val campusOverview: CampusOverview?,
    val unreadAlerts: Int,
)

@Immutable
data class OperationsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val tasks: List<PlatformTask>,
    val releases: ReleaseData?,
    val backup: BackupQuality?,
    val diagnostics: DiagnosticData?,
) {
    val actionRequiredTasks: List<PlatformTask>
        get() = tasks.filter { it.status in setOf("action_required", "failed") }
}

@Immutable
data class ToolsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val overview: OverviewData?,
    val iot: IotData?,
    val ct8: Ct8Data?,
)

@Immutable
data class NetworkHealth(
    val latencyMs: Long? = null,
    val status: String = "unknown",
    val gatewayUrl: String = "",
    val checkedAtMillis: Long? = null,
    val dnsOk: Boolean = true,
    val apiOk: Boolean = true,
    val message: String? = null,
)

@Immutable
data class CacheStorageInfo(
    val snapshotSizeBytes: Long = 0L,
    val workspaceSizeBytes: Long = 0L,
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
    val networkHealth: NetworkHealth = NetworkHealth(),
    val cacheStorageInfo: CacheStorageInfo = CacheStorageInfo(),
    val latestRelease: ReleaseData? = null,
    val webLoginLink: WebLoginLink? = null,
)

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
    val error: String?,
    val message: String?,
)

@Immutable
data class GoogleAccountDeskUiState(
    val busyAction: String?,
    val googleAccounts: List<GoogleAccountRecord>,
    val googleAccountMigrationPending: Boolean,
)

@Immutable
data class QrLoginUiState(
    val qrLoginBusy: Boolean,
    val qrLoginTarget: QrLoginTarget?,
    val qrLoginError: String?,
)

enum class SearchDestination { Overview, Notifications, Operations, Tools, GoogleAccounts, Today, Scenes }

@Immutable
data class GlobalSearchItem(
    val id: String,
    val title: String,
    val detail: String,
    val category: String,
    val destination: SearchDestination,
    val focusId: String? = null,
)

@Immutable
data class GlobalSearchUiState(val items: List<GlobalSearchItem>)

@Immutable
data class TodayUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val offlineMode: Boolean,
    val todoSnapshot: TodoSnapshot,
    val pendingTodoMutations: Int,
    val timetable: CampusTimetable?,
    val campusOverview: CampusOverview?,
    val incidents: List<IncidentInfo>,
    val tasks: List<PlatformTask>,
    val resourceExpiries: List<ResourceExpiry>,
)

@Immutable
data class NotificationCenterUiState(
    val refreshing: Boolean,
    val alerts: List<AppAlertRecord>,
    val preferences: AlertPreferences,
    val syncError: String?,
)

@Immutable
data class InsightsUiState(val samples: List<TrendSample>)

@Immutable
data class ScenesUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val offlineMode: Boolean,
    val iot: IotData?,
)

internal fun AppUiState.toEntryUiState() = AppEntryUiState(
    booting = booting,
    locked = locked,
    user = user,
    selectedTab = selectedTab,
    loginBusy = loginBusy,
    secondFactorRequired = secondFactorRequired,
    recoveryCodeAllowed = recoveryCodeAllowed,
    androidPasskeySupported = androidPasskeySupported,
    suggestedUsername = suggestedUsername,
    qrLoginOpen = qrLoginOpen,
    accountManagementOpen = accountManagementOpen,
    googleAccountDeskOpen = googleAccountDeskOpen,
    globalSearchOpen = globalSearchOpen,
    workspaceDestination = workspaceDestination,
    focusTaskId = focusTaskId,
    error = error,
    message = message,
)

internal fun AppUiState.toOverviewUiState() = OverviewUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus),
    sectionError = sectionError(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus),
    overview = overview,
    externalApplications = externalApplications,
    incidents = incidents,
    offlineMode = offlineMode,
    cachedAtMillis = cachedAtMillis,
    homeQuickActionOrder = homeQuickActionOrder,
    hiddenHomeQuickActions = hiddenHomeQuickActions,
    todoSnapshot = todoSnapshot,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.count { !it.read },
)

internal fun AppUiState.toOperationsUiState() = OperationsUiState(
    refreshing = isRefreshing(DataSection.Tasks, DataSection.Releases, DataSection.Backup),
    sectionError = sectionError(DataSection.Tasks, DataSection.Releases, DataSection.Backup),
    busyAction = busyAction,
    user = user,
    tasks = tasks,
    releases = releases,
    backup = backup,
    diagnostics = diagnostics,
)

internal fun AppUiState.toToolsUiState() = ToolsUiState(
    refreshing = isRefreshing(DataSection.Iot, DataSection.Ct8),
    sectionError = sectionError(DataSection.Iot, DataSection.Ct8),
    busyAction = busyAction,
    user = user,
    overview = overview,
    iot = iot,
    ct8 = ct8,
)

internal fun AppUiState.toProfileUiState() = ProfileUiState(
    refreshing = isRefreshing(DataSection.Security),
    sectionError = sectionError(DataSection.Security),
    busyAction = busyAction,
    user = user,
    security = security,
    alertPreferences = alertPreferences,
    networkHealth = networkHealth,
    cacheStorageInfo = cacheStorageInfo,
    latestRelease = releases,
    webLoginLink = webLoginLink,
)

internal fun AppUiState.toAccountManagementUiState() = AccountManagementUiState(
    refreshing = isRefreshing(DataSection.Security),
    sectionError = sectionError(DataSection.Security),
    busyAction = busyAction,
    user = user,
    security = security,
    androidPasskeySupported = androidPasskeySupported,
    appLockEnabled = appLockEnabled,
    totpEnrollment = totpEnrollment,
    recoveryCodes = recoveryCodes,
    passkeys = passkeys,
    error = error,
    message = message,
)

internal fun AppUiState.toGoogleAccountDeskUiState() = GoogleAccountDeskUiState(
    busyAction = busyAction,
    googleAccounts = googleAccounts,
    googleAccountMigrationPending = googleAccountMigrationPending,
)

internal fun AppUiState.toQrLoginUiState() = QrLoginUiState(
    qrLoginBusy = qrLoginBusy,
    qrLoginTarget = qrLoginTarget,
    qrLoginError = qrLoginError,
)

internal fun AppUiState.toGlobalSearchUiState() = GlobalSearchUiState(
    items = buildList {
        overview?.services.orEmpty().forEach { service ->
            add(
                GlobalSearchItem(
                    id = "service:${service.id}",
                    title = service.name,
                    detail = "${service.category} · ${service.state}",
                    category = "服务",
                    destination = SearchDestination.Overview,
                ),
            )
        }
        incidents.forEach { incident ->
            add(
                GlobalSearchItem(
                    id = "incident:${incident.id}",
                    title = incident.title,
                    detail = listOf(incident.source, incident.description).filter(String::isNotBlank).joinToString(" · "),
                    category = "系统通知",
                    destination = SearchDestination.Notifications,
                ),
            )
        }
        tasks.forEach { task ->
            add(
                GlobalSearchItem(
                    id = "task:${task.id}",
                    title = task.title,
                    detail = listOf(task.source, task.detail).filter(String::isNotBlank).joinToString(" · "),
                    category = "任务",
                    destination = SearchDestination.Operations,
                    focusId = task.id,
                ),
            )
        }
        todoSnapshot.tasks.forEach { task ->
            add(
                GlobalSearchItem(
                    id = "todo:${task.id}",
                    title = task.title,
                    detail = listOf(task.priority, task.courseRef?.name.orEmpty()).filter(String::isNotBlank).joinToString(" · "),
                    category = "个人待办",
                    destination = SearchDestination.Today,
                    focusId = task.id,
                ),
            )
        }
        campusTimetable?.courses.orEmpty().forEach { course ->
            add(
                GlobalSearchItem(
                    id = "course:${course.id}",
                    title = course.courseName,
                    detail = listOf(course.dayName, course.sectionText, course.location).filter(String::isNotBlank).joinToString(" · "),
                    category = "课程",
                    destination = SearchDestination.Today,
                ),
            )
        }
        iot?.devices.orEmpty().forEach { device ->
            add(
                GlobalSearchItem(
                    id = "device:${device.id}",
                    title = device.name,
                    detail = if (device.online) "设备在线" else "设备离线",
                    category = "设备",
                    destination = SearchDestination.Tools,
                ),
            )
        }
        iot?.scenes.orEmpty().forEach { scene ->
            add(
                GlobalSearchItem(
                    id = "scene:${scene.id}",
                    title = scene.name,
                    detail = "${scene.actionCount} 个设备动作",
                    category = "智能场景",
                    destination = SearchDestination.Scenes,
                ),
            )
        }
        googleAccounts.forEach { account ->
            add(
                GlobalSearchItem(
                    id = "google:${account.id}",
                    title = account.primaryEmail,
                    detail = listOf(account.displayName, account.tags.joinToString(" · ")).filter(String::isNotBlank).joinToString(" · "),
                    category = "邮箱",
                    destination = SearchDestination.GoogleAccounts,
                ),
            )
        }
    },
)

internal fun AppUiState.toTodayUiState() = TodayUiState(
    refreshing = isRefreshing(DataSection.Todos, DataSection.Campus, DataSection.Resources, DataSection.Incidents, DataSection.Tasks),
    sectionError = sectionError(DataSection.Todos, DataSection.Campus, DataSection.Resources),
    offlineMode = offlineMode,
    todoSnapshot = todoSnapshot,
    pendingTodoMutations = pendingTodoMutations,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    incidents = incidents,
    tasks = tasks,
    resourceExpiries = resourceExpiries,
)

internal fun AppUiState.toNotificationCenterUiState() = NotificationCenterUiState(
    refreshing = isRefreshing(DataSection.Notifications),
    alerts = alerts,
    preferences = alertPreferences,
    syncError = sectionLoadStates[DataSection.Notifications]?.error,
)

internal fun AppUiState.toInsightsUiState() = InsightsUiState(samples = trendSamples)

internal fun AppUiState.toScenesUiState() = ScenesUiState(
    refreshing = isRefreshing(DataSection.Iot),
    sectionError = sectionError(DataSection.Iot),
    busyAction = busyAction,
    offlineMode = offlineMode,
    iot = iot,
)

private fun AppUiState.isRefreshing(vararg sections: DataSection): Boolean =
    sections.any { sectionLoadStates[it]?.refreshing == true }

private fun AppUiState.sectionError(vararg sections: DataSection): String? = sections
    .mapNotNull { sectionLoadStates[it]?.error }
    .firstOrNull()
