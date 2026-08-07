package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DiagnosticData
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
    val focusIncidentId: String?,
    val focusTaskId: String?,
    val error: String?,
    val message: String?,
)

data class OverviewUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val overview: OverviewData?,
    val incidents: List<IncidentInfo>,
    val offlineMode: Boolean,
    val cachedAtMillis: Long?,
    val homeQuickActionOrder: List<HomeQuickAction>,
    val hiddenHomeQuickActions: Set<HomeQuickAction>,
    val todoSnapshot: TodoSnapshot,
    val timetable: CampusTimetable?,
    val unreadAlerts: Int,
)

data class EventsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val overview: OverviewData?,
    val incidents: List<IncidentInfo>,
    val message: String?,
) {
    val activeIncidents: List<IncidentInfo>
        get() = incidents.filter { it.status != "resolved" }
}

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

data class ToolsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val overview: OverviewData?,
    val iot: IotData?,
    val ct8: Ct8Data?,
)

data class ProfileUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val user: PlatformUser?,
    val security: SecurityData?,
)

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

data class GoogleAccountDeskUiState(
    val busyAction: String?,
    val googleAccounts: List<GoogleAccountRecord>,
    val googleAccountMigrationPending: Boolean,
)

data class QrLoginUiState(
    val qrLoginBusy: Boolean,
    val qrLoginTarget: QrLoginTarget?,
    val qrLoginError: String?,
)

enum class SearchDestination { Overview, Events, Operations, Tools, GoogleAccounts, Today, Scenes }

data class GlobalSearchItem(
    val id: String,
    val title: String,
    val detail: String,
    val category: String,
    val destination: SearchDestination,
    val focusId: String? = null,
)

data class GlobalSearchUiState(val items: List<GlobalSearchItem>)

data class TodayUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val offlineMode: Boolean,
    val todoSnapshot: TodoSnapshot,
    val pendingTodoMutations: Int,
    val timetable: CampusTimetable?,
    val incidents: List<IncidentInfo>,
    val tasks: List<PlatformTask>,
    val resourceExpiries: List<ResourceExpiry>,
)

data class NotificationCenterUiState(
    val alerts: List<AppAlertRecord>,
    val preferences: AlertPreferences,
)

data class InsightsUiState(val samples: List<TrendSample>)

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
    focusIncidentId = focusIncidentId,
    focusTaskId = focusTaskId,
    error = error,
    message = message,
)

internal fun AppUiState.toOverviewUiState() = OverviewUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.Incidents, DataSection.Tasks),
    sectionError = sectionError(DataSection.Overview, DataSection.Incidents, DataSection.Tasks),
    overview = overview,
    incidents = incidents,
    offlineMode = offlineMode,
    cachedAtMillis = cachedAtMillis,
    homeQuickActionOrder = homeQuickActionOrder,
    hiddenHomeQuickActions = hiddenHomeQuickActions,
    todoSnapshot = todoSnapshot,
    timetable = campusTimetable,
    unreadAlerts = alerts.count { !it.read },
)

internal fun AppUiState.toEventsUiState() = EventsUiState(
    refreshing = isRefreshing(DataSection.Incidents),
    sectionError = sectionError(DataSection.Incidents),
    busyAction = busyAction,
    user = user,
    overview = overview,
    incidents = incidents,
    message = message,
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
                    category = "事件",
                    destination = SearchDestination.Events,
                    focusId = incident.id,
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
    incidents = incidents,
    tasks = tasks,
    resourceExpiries = resourceExpiries,
)

internal fun AppUiState.toNotificationCenterUiState() = NotificationCenterUiState(
    alerts = alerts,
    preferences = alertPreferences,
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
