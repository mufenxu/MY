package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot

import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusReservationSpace
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
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TrendSample
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.update.AppUpdateUiState

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
    val assistantSnapshot: PersonalAssistantSnapshot?,
)

@Immutable
data class OperationsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val overview: OverviewData?,
    val incidents: List<IncidentInfo>,
    val iot: IotData?,
    val resourceExpiries: List<ResourceExpiry>,
    val unreadAlerts: Int,
    val backup: BackupQuality?,
    val diagnostics: DiagnosticData?,
    val networkHealth: NetworkHealth = NetworkHealth(),
)

@Immutable
data class ToolsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val overview: OverviewData?,
    val iot: IotData?,
    val ct8: Ct8Data?,
    val unreadAlerts: Int,
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
    val offlineMode: Boolean = false,
    val pendingTodoMutations: Int = 0,
    val sectionLoadStates: Map<DataSection, SectionLoadState> = emptyMap(),
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

enum class SearchDestination { Overview, Notifications, Tools, GoogleAccounts, Today, Scenes }

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
data class GlobalSearchUiState(
    val refreshing: Boolean,
    val error: String?,
    val items: List<GlobalSearchItem>,
)

@Immutable
data class TodayUiState(
    val refreshing: Boolean,
    val calendarSyncing: Boolean,
    val sectionError: String?,
    val offlineMode: Boolean,
    val todoSnapshot: TodoSnapshot,
    val pendingTodoMutations: Int,
    val timetable: CampusTimetable?,
    val campusOverview: CampusOverview?,
    val unreadAlerts: Int,
    val resourceExpiries: List<ResourceExpiry>,
    val sharedTodoDraft: String?,
)

@Immutable
data class FreeClassroomUiState(
    val refreshing: Boolean,
    val error: String?,
    val result: CampusFreeClassrooms?,
)

@Immutable
data class ReservationUiState(
    val refreshing: Boolean = false,
    val spaces: List<CampusReservationSpace> = emptyList(),
    val spacesLoading: Boolean = false,
    val rules: String? = null,
    val availability: String? = null,
    val queryLoading: Boolean = false,
    val submitLoading: Boolean = false,
    val autoTasks: List<CampusAutoReservationTask> = emptyList(),
    val autoTasksLoading: Boolean = false,
    val savingTask: Boolean = false,
    val deletingTaskId: String? = null,
    val error: String? = null,
    val message: String? = null,
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
    val quickScene: QuickScenePreference?,
    val pendingSceneId: String?,
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
    assistantSnapshot = assistantSnapshot,
)

internal fun AppUiState.toOperationsUiState() = OperationsUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    sectionError = sectionError(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    busyAction = busyAction,
    user = user,
    overview = overview,
    incidents = incidents,
    iot = iot,
    resourceExpiries = resourceExpiries,
    unreadAlerts = alerts.count { !it.read },
    backup = backup,
    diagnostics = diagnostics,
    networkHealth = networkHealth,
)

internal fun AppUiState.toToolsUiState() = ToolsUiState(
    refreshing = isRefreshing(DataSection.Iot, DataSection.Ct8),
    sectionError = sectionError(DataSection.Iot, DataSection.Ct8),
    busyAction = busyAction,
    user = user,
    overview = overview,
    iot = iot,
    ct8 = ct8,
    unreadAlerts = alerts.count { !it.read },
)

internal fun AppUiState.toProfileUiState() = ProfileUiState(
    refreshing = isRefreshing(DataSection.Security),
    sectionError = sectionError(DataSection.Security),
    busyAction = busyAction,
    user = user,
    security = security,
    alertPreferences = alertPreferences,
    latestRelease = releases,
    appUpdate = appUpdate,
    webLoginLink = webLoginLink,
    cacheStorageInfo = cacheStorageInfo,
    unreadAlerts = alerts.count { !it.read },
    offlineMode = offlineMode,
    pendingTodoMutations = pendingTodoMutations,
    sectionLoadStates = sectionLoadStates,
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
    refreshing = isRefreshing(
        DataSection.Overview,
        DataSection.ExternalApplications,
        DataSection.Incidents,
        DataSection.Tasks,
        DataSection.Todos,
        DataSection.Campus,
        DataSection.Resources,
        DataSection.Iot,
        DataSection.Notifications,
    ),
    error = sectionError(
        DataSection.Overview,
        DataSection.ExternalApplications,
        DataSection.Incidents,
        DataSection.Tasks,
        DataSection.Todos,
        DataSection.Campus,
        DataSection.Resources,
        DataSection.Iot,
        DataSection.Notifications,
    ),
    items = buildList {
        externalApplications.filter(ExternalApplication::enabled).forEach { application ->
            add(
                GlobalSearchItem(
                    id = "application:${application.id}",
                    title = application.name,
                    detail = listOf(application.description, application.health.state)
                        .filter(String::isNotBlank)
                        .joinToString(" · "),
                    category = "接入应用",
                    destination = SearchDestination.Overview,
                    focusId = application.id,
                ),
            )
        }
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
                    id = "platform-task:${task.id}",
                    title = task.title,
                    detail = listOf(task.source, task.status, task.detail).filter(String::isNotBlank).joinToString(" · "),
                    category = "平台任务",
                    destination = SearchDestination.Notifications,
                    focusId = task.id,
                ),
            )
        }
        alerts.filter { it.origin == "remote" }.forEach { alert ->
            add(
                GlobalSearchItem(
                    id = "notification:${alert.id}",
                    title = alert.title,
                    detail = listOf(alert.type, alert.body).filter(String::isNotBlank).joinToString(" · "),
                    category = "通知",
                    destination = SearchDestination.Notifications,
                    focusId = alert.id,
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
        resourceExpiries.forEach { resource ->
            add(
                GlobalSearchItem(
                    id = "resource:${resource.id}",
                    title = resource.name,
                    detail = "${resource.type} · ${resource.expiresAt}",
                    category = "资源到期",
                    destination = SearchDestination.Today,
                    focusId = resource.id,
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
    refreshing = isRefreshing(DataSection.Todos, DataSection.Campus, DataSection.Resources, DataSection.Incidents),
    calendarSyncing = busyAction == "calendar-sync",
    sectionError = sectionError(DataSection.Todos, DataSection.Campus, DataSection.Resources),
    offlineMode = offlineMode,
    todoSnapshot = todoSnapshot,
    pendingTodoMutations = pendingTodoMutations,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.count { !it.read },
    resourceExpiries = resourceExpiries,
    sharedTodoDraft = sharedTodoDraft,
)

internal fun AppUiState.toFreeClassroomUiState() = FreeClassroomUiState(
    refreshing = isRefreshing(DataSection.FreeClassrooms),
    error = sectionError(DataSection.FreeClassrooms),
    result = freeClassroomResult ?: campusOverview?.freeClassrooms,
)

internal fun AppUiState.toReservationUiState() = ReservationUiState(
    refreshing = isRefreshing(DataSection.Reservation),
    spaces = reservationSpaces,
    spacesLoading = reservationSpacesLoading,
    rules = reservationRules,
    availability = reservationAvailability,
    queryLoading = reservationQueryLoading,
    submitLoading = reservationSubmitLoading,
    autoTasks = reservationAutoTasks,
    autoTasksLoading = reservationAutoTasksLoading,
    savingTask = reservationSavingTask,
    deletingTaskId = reservationDeletingTaskId,
    error = sectionError(DataSection.Reservation) ?: reservationError,
    message = reservationMessage,
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
    quickScene = quickScene,
    pendingSceneId = pendingSceneId,
)

private fun AppUiState.isRefreshing(vararg sections: DataSection): Boolean =
    sections.any { sectionLoadStates[it]?.refreshing == true }

private fun AppUiState.sectionError(vararg sections: DataSection): String? = sections
    .mapNotNull { sectionLoadStates[it]?.error }
    .firstOrNull()
