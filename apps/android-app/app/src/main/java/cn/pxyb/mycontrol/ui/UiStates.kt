package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot

import cn.pxyb.mycontrol.data.AssistantActionItem
import cn.pxyb.mycontrol.data.AssistantSuggestion
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusIdentityCode
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusWaterBill
import cn.pxyb.mycontrol.data.CampusWaterValve
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DailyNews
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import cn.pxyb.mycontrol.data.GitHubProfileRecord
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
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistTask
import cn.pxyb.mycontrol.data.LibrarySeatOverview
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import cn.pxyb.mycontrol.data.LibrarySeatVenue
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.update.AppUpdateUiState
import java.util.UUID

import cn.pxyb.mycontrol.data.DEFAULT_HIDDEN_HOME_QUICK_ACTIONS
import cn.pxyb.mycontrol.data.PlatformTask

enum class MainTab { Overview, Notifications, Operations, Tools, Profile }

enum class WorkspaceDestination { Today, Notifications, Scenes }

enum class DataSection { Overview, ExternalApplications, Incidents, Tasks, Releases, Backup, Iot, IotInsights, Ct8, Security, Todos, Campus, FreeClassrooms, Resources, Notifications, Reservation, DailyNews }

@Immutable
data class SectionLoadState(
    val refreshing: Boolean = false,
    val error: String? = null,
    val updatedAtMillis: Long? = null,
    val fromCache: Boolean = false,
    val cachedAtMillis: Long? = null,
)

@Immutable
data class AppUiState(
    val booting: Boolean = true,
    val locked: Boolean = false,
    val appLockEnabled: Boolean = false,
    val user: PlatformUser? = null,
    val selectedTab: MainTab = MainTab.Overview,
    val pendingTabNavigation: MainTab? = null,
    val loginBusy: Boolean = false,
    val secondFactorRequired: Boolean = false,
    val recoveryCodeAllowed: Boolean = false,
    val loginEnrollment: TotpEnrollment? = null,
    val loginRecoveryCodes: List<String> = emptyList(),
    val botChallengeRequired: Boolean = false,
    val botChallengeReady: Boolean = false,
    val reauthenticatedUntil: Long = 0,
    val androidPasskeySupported: Boolean = false,
    val suggestedUsername: String = "",
    val deviceLoginBusy: Boolean = false,
    val deviceLoginQrDataUrl: String? = null,
    val deviceLoginError: String? = null,
    val refreshing: Boolean = false,
    val busyAction: String? = null,
    val actions: ActionUiState = ActionUiState(),
    val overview: OverviewData? = null,
    val externalApplications: List<ExternalApplication> = emptyList(),
    val incidents: List<IncidentInfo> = emptyList(),
    val tasks: List<PlatformTask> = emptyList(),
    val releases: ReleaseData? = null,
    val appUpdate: AppUpdateUiState = AppUpdateUiState(),
    val backup: BackupQuality? = null,
    val iot: IotData? = null,
    val ct8: Ct8Data? = null,
    val githubRepositories: List<GitHubRepositoryRecord> = emptyList(),
    val githubRepositoriesLoaded: Boolean = false,
    val githubProfile: GitHubProfileRecord? = null,
    val githubProfileLoaded: Boolean = false,
    val githubReleases: List<GitHubReleaseRecord> = emptyList(),
    val githubReleasesLoaded: Boolean = false,
    val githubReleasesRepoFullName: String? = null,
    val diagnostics: DiagnosticData? = null,
    val security: SecurityData? = null,
    val qrLoginOpen: Boolean = false,
    val qrLoginBusy: Boolean = false,
    val qrLoginTarget: QrLoginTarget? = null,
    val qrLoginError: String? = null,
    val pendingAuthenticatorUri: String? = null,
    val accountManagementOpen: Boolean = false,
    val googleAccountDeskOpen: Boolean = false,
    val githubProjectsOpen: Boolean = false,
    val globalSearchOpen: Boolean = false,
    val assistantOpen: Boolean = false,
    val assistantButtonVisible: Boolean = true,
    val workspaceDestination: WorkspaceDestination? = null,
    val pendingLibrarySeatMyReservations: Boolean = false,
    val googleAccounts: List<GoogleAccountRecord> = emptyList(),
    val googleAccountsLoaded: Boolean = false,
    val googleAccountsLoading: Boolean = false,
    val googleAccountsError: String? = null,
    val googleAccountsRevision: Int = 0,
    val googleAccountMigrationPending: Boolean = false,
    val googleAccountsRemoteReady: Boolean = false,
    val totpEnrollment: TotpEnrollment? = null,
    val recoveryCodes: List<String> = emptyList(),
    val passkeys: List<PlatformPasskey> = emptyList(),
    val error: String? = null,
    val message: String? = null,
    val offlineMode: Boolean = false,
    val cachedAtMillis: Long? = null,
    val sectionLoadStates: Map<DataSection, SectionLoadState> = emptyMap(),
    val homeQuickActionOrder: List<HomeQuickAction> = HomeQuickAction.entries,
    val hiddenHomeQuickActions: Set<HomeQuickAction> = DEFAULT_HIDDEN_HOME_QUICK_ACTIONS,
    val todoSnapshot: TodoSnapshot = TodoSnapshot(),
    val pendingTodoMutations: Int = 0,
    val campusTimetable: CampusTimetable? = null,
    val campusOverview: CampusOverview? = null,
    val dailyNews: DailyNews? = null,
    val campusWaterValve: CampusWaterValve = CampusWaterValve(),
    val campusWaterValveLoading: Boolean = false,
    val campusWaterValveBusy: Boolean = false,
    val campusWaterValveError: String? = null,
    val campusWaterValveMessage: String? = null,
    val campusWaterBill: CampusWaterBill? = null,
    val campusWaterBillLoading: Boolean = false,
    val campusWaterBillError: String? = null,
    val freeClassroomResult: CampusFreeClassrooms? = null,
    val resourceExpiries: List<ResourceExpiry> = emptyList(),
    val alerts: List<AppAlertRecord> = emptyList(),
    val alertPreferences: AlertPreferences = AlertPreferences(),
    val networkHealth: NetworkHealth = NetworkHealth(),
    val cacheStorageInfo: CacheStorageInfo = CacheStorageInfo(),
    val webLoginLink: WebLoginLink? = null,
    val assistantSnapshot: PersonalAssistantSnapshot? = null,
    val sharedTodoDraft: String? = null,
    val pendingSceneId: String? = null,
    val quickScene: QuickScenePreference? = null,
) {
    val activeIncidents: List<IncidentInfo>
        get() = incidents.filter { it.status != "resolved" }
}

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
    val githubProjectsOpen: Boolean,
    val githubRepositories: List<GitHubRepositoryRecord> = emptyList(),
    val githubRepositoriesLoaded: Boolean = false,
    val githubProfile: GitHubProfileRecord? = null,
    val githubProfileLoaded: Boolean = false,
    val githubReleases: List<GitHubReleaseRecord> = emptyList(),
    val githubReleasesLoaded: Boolean = false,
    val githubReleasesRepoFullName: String? = null,
    val githubReleasesBusy: Boolean = false,
    val githubVisibilityBusy: Boolean = false,
    val globalSearchOpen: Boolean,
    val assistantOpen: Boolean,
    val assistantButtonVisible: Boolean,
    val workspaceDestination: WorkspaceDestination?,
    val pendingLibrarySeatMyReservations: Boolean,
    val error: String?,
    val message: String?,
)

@Immutable
data class AssistantChatMessageUi(
    val id: String = UUID.randomUUID().toString(),
    val role: String,
    val content: String,
    val suggestions: List<AssistantSuggestion> = emptyList(),
    val actions: List<AssistantActionItem> = emptyList(),
)

@Immutable
data class AssistantChatUiState(
    val messages: List<AssistantChatMessageUi> = emptyList(),
    val sending: Boolean = false,
    val error: String? = null,
)

@Immutable
data class OverviewUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val overview: OverviewData?,
    val externalApplications: List<ExternalApplication>,
    val externalApplicationsLoading: Boolean = false,
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
    val busyActions: Set<String> = emptySet(),
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
    val busyActions: Set<String> = emptySet(),
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

@Immutable
data class GoogleAccountDeskUiState(
    val busyAction: String?,
    val googleAccounts: List<GoogleAccountRecord>,
    val googleAccountMigrationPending: Boolean,
    val loading: Boolean = false,
    val error: String? = null,
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
data class WaterValveUiState(
    val refreshing: Boolean = false,
    val busy: Boolean = false,
    val valve: CampusWaterValve = CampusWaterValve(),
    val bill: CampusWaterBill? = null,
    val billLoading: Boolean = false,
    val billError: String? = null,
    val error: String? = null,
    val message: String? = null,
)

@Immutable
data class FreeClassroomUiState(
    val refreshing: Boolean,
    val error: String?,
    val result: CampusFreeClassrooms?,
)

@Immutable
data class DailyNewsUiState(
    val refreshing: Boolean,
    val error: String?,
    val news: DailyNews?,
)

@Immutable
data class ReservationUiState(
    val refreshing: Boolean = false,
    val spaces: List<CampusReservationSpace> = emptyList(),
    val spacesLoading: Boolean = false,
    val rules: String? = null,
    val availability: String? = null,
    val freeWindows: List<CampusReservationTimeWindow> = emptyList(),
    val busyWindows: List<CampusReservationTimeWindow> = emptyList(),
    val availabilitySpaceId: Int? = null,
    val availabilityDate: String? = null,
    val availableSpaces: List<CampusReservationSpace> = emptyList(),
    val availableSpacesQueryText: String? = null,
    val availableSpacesLoading: Boolean = false,
    val queryLoading: Boolean = false,
    val submitLoading: Boolean = false,
    val autoTasks: List<CampusAutoReservationTask> = emptyList(),
    val autoTasksLoading: Boolean = false,
    val savingTask: Boolean = false,
    val deletingTaskId: String? = null,
    val myReservations: List<CampusMyReservation> = emptyList(),
    val myReservationsLoading: Boolean = false,
    val cancellingReservationId: String? = null,
    val identityCode: CampusIdentityCode? = null,
    val identityCodeLoading: Boolean = false,
    val identityCodeError: String? = null,
    val error: String? = null,
    val message: String? = null,
)

@Immutable
data class LibrarySeatQuery(
    val venueId: String,
    val date: String,
    val startMinute: Int,
    val endMinute: Int,
    val floorId: String? = null,
    val power: Boolean = false,
    val window: Boolean = false,
)

@Immutable
data class LibrarySeatUiState(
    val query: LibrarySeatQuery? = null,
    val overview: LibrarySeatOverview = LibrarySeatOverview(),
    val overviewLoading: Boolean = false,
    val areas: List<LibrarySeatArea> = emptyList(),
    val areasLoading: Boolean = false,
    val seats: List<LibrarySeatStatus> = emptyList(),
    val seatsLoading: Boolean = false,
    val floorSeats: List<LibrarySeatFloorSeat> = emptyList(),
    val floorSeatsLoading: Boolean = false,
    val submitLoading: Boolean = false,
    val reservations: List<LibrarySeatReservationRecord> = emptyList(),
    val reservationsLoading: Boolean = false,
    val historyReservations: LibrarySeatReservationHistory = LibrarySeatReservationHistory(),
    val historyReservationsLoading: Boolean = false,
    val waitlists: List<LibrarySeatWaitlistTask> = emptyList(),
    val waitlistsLoading: Boolean = false,
    val waitlistSaving: Boolean = false,
    val waitlistDeletingId: String? = null,
    val selectedVenueId: String? = null,
    val selectedDate: String? = null,
    val selectedFloorId: String? = null,
    val selectedAreaId: String? = null,
    val selectedSeatId: String? = null,
    val error: String? = null,
    val message: String? = null,
) {
    val venues: List<LibrarySeatVenue> get() = overview.venues
    val dates: List<String> get() = overview.dates
    val refreshing: Boolean get() = overviewLoading || areasLoading || seatsLoading || floorSeatsLoading || submitLoading ||
        reservationsLoading || historyReservationsLoading
}

@Immutable
data class NotificationCenterUiState(
    val refreshing: Boolean,
    val alerts: List<AppAlertRecord>,
    val preferences: AlertPreferences,
    val syncError: String?,
)

@Immutable
data class ScenesUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val offlineMode: Boolean,
    val iot: IotData?,
    val quickScene: QuickScenePreference?,
    val pendingSceneId: String?,
    val sceneSaveError: String? = null,
    val ruleSaveError: String? = null,
    val sceneSaveCount: Int = 0,
    val ruleSaveCount: Int = 0,
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
    suggestedUsername = suggestedUsername,
    deviceLoginBusy = deviceLoginBusy,
    deviceLoginQrDataUrl = deviceLoginQrDataUrl,
    deviceLoginError = deviceLoginError,
    qrLoginOpen = qrLoginOpen,
    pendingAuthenticatorUri = pendingAuthenticatorUri,
    accountManagementOpen = accountManagementOpen,
    googleAccountDeskOpen = googleAccountDeskOpen,
    githubProjectsOpen = githubProjectsOpen,
    githubRepositories = githubRepositories,
    githubRepositoriesLoaded = githubRepositoriesLoaded,
    githubProfile = githubProfile,
    githubProfileLoaded = githubProfileLoaded,
    githubReleases = githubReleases,
    githubReleasesLoaded = githubReleasesLoaded,
    githubReleasesRepoFullName = githubReleasesRepoFullName,
    githubReleasesBusy = actions.running.any { it.startsWith("github-release:") },
    githubVisibilityBusy = actions.running.any { it.startsWith("github-visibility:") },
    globalSearchOpen = globalSearchOpen,
    assistantOpen = assistantOpen,
    assistantButtonVisible = assistantButtonVisible,
    workspaceDestination = workspaceDestination,
    pendingLibrarySeatMyReservations = pendingLibrarySeatMyReservations,
    error = error,
    message = message,
)

internal fun AppUiState.toOverviewUiState() = OverviewUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus),
    sectionError = sectionError(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus),
    overview = overview,
    externalApplications = externalApplications,
    externalApplicationsLoading = sectionLoadStates[DataSection.ExternalApplications]?.refreshing == true,
    incidents = incidents,
    offlineMode = offlineMode,
    cachedAtMillis = cachedAtMillis,
    homeQuickActionOrder = homeQuickActionOrder,
    hiddenHomeQuickActions = hiddenHomeQuickActions,
    todoSnapshot = todoSnapshot,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.activeUnreadCount(),
    assistantSnapshot = assistantSnapshot,
)

internal fun AppUiState.toOperationsUiState() = OperationsUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    sectionError = sectionError(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    busyActions = actions.running.filter { actionResources(it).any(setOf("incidents", "backup", "diagnostics")::contains) }.toSet(),
    user = user,
    overview = overview,
    incidents = incidents,
    iot = iot,
    resourceExpiries = resourceExpiries,
    unreadAlerts = alerts.activeUnreadCount(),
    backup = backup,
    diagnostics = diagnostics,
    networkHealth = networkHealth,
)

internal fun AppUiState.toToolsUiState() = ToolsUiState(
    refreshing = isRefreshing(DataSection.Iot, DataSection.Ct8),
    sectionError = sectionError(DataSection.Iot, DataSection.Ct8),
    busyActions = actions.running.filter { actionResources(it).any(setOf("iot", "ct8")::contains) }.toSet(),
    user = user,
    overview = overview,
    iot = iot,
    ct8 = ct8,
    unreadAlerts = alerts.activeUnreadCount(),
)

internal fun AppUiState.toDailyNewsUiState() = DailyNewsUiState(
    refreshing = isRefreshing(DataSection.DailyNews),
    error = sectionError(DataSection.DailyNews),
    news = dailyNews,
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

internal fun AppUiState.toGoogleAccountDeskUiState() = GoogleAccountDeskUiState(
    busyAction = actions.running.firstOrNull { it == "google-accounts" },
    googleAccounts = googleAccounts,
    googleAccountMigrationPending = googleAccountMigrationPending,
    loading = googleAccountsLoading,
    error = googleAccountsError,
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
    calendarSyncing = "calendar-sync" in actions.running,
    sectionError = sectionError(DataSection.Todos, DataSection.Campus, DataSection.Resources),
    offlineMode = listOf(DataSection.Todos, DataSection.Campus, DataSection.Resources).any { sectionLoadStates[it]?.fromCache == true },
    todoSnapshot = todoSnapshot,
    pendingTodoMutations = pendingTodoMutations,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.activeUnreadCount(),
    resourceExpiries = resourceExpiries,
    sharedTodoDraft = sharedTodoDraft,
)

internal fun AppUiState.toWaterValveUiState() = WaterValveUiState(
    refreshing = campusWaterValveLoading,
    busy = campusWaterValveBusy,
    valve = campusWaterValve,
    bill = campusWaterBill,
    billLoading = campusWaterBillLoading,
    billError = campusWaterBillError,
    error = campusWaterValveError,
    message = campusWaterValveMessage,
)

internal fun AppUiState.toFreeClassroomUiState() = FreeClassroomUiState(
    refreshing = isRefreshing(DataSection.FreeClassrooms),
    error = sectionError(DataSection.FreeClassrooms),
    result = freeClassroomResult ?: campusOverview?.freeClassrooms,
)

internal fun AppUiState.toNotificationCenterUiState() = NotificationCenterUiState(
    refreshing = isRefreshing(DataSection.Notifications),
    alerts = alerts,
    preferences = alertPreferences,
    syncError = sectionLoadStates[DataSection.Notifications]?.error,
)

internal fun AppUiState.toScenesUiState() = ScenesUiState(
    refreshing = isRefreshing(DataSection.Iot),
    sectionError = sectionError(DataSection.Iot),
    busyAction = actions.running.firstOrNull { "iot" in actionResources(it) },
    offlineMode = sectionLoadStates[DataSection.Iot]?.fromCache == true,
    iot = iot,
    quickScene = quickScene,
    pendingSceneId = pendingSceneId,
    sceneSaveError = actions.errors["scene-edit"],
    ruleSaveError = actions.errors["rule-edit"],
    sceneSaveCount = actions.completions["scene-edit"] ?: 0,
    ruleSaveCount = actions.completions["rule-edit"] ?: 0,
)

private fun AppUiState.isRefreshing(vararg sections: DataSection): Boolean =
    sections.any { sectionLoadStates[it]?.refreshing == true }

private fun AppUiState.sectionError(vararg sections: DataSection): String? = sections
    .mapNotNull { sectionLoadStates[it]?.error }
    .firstOrNull()
