package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DEFAULT_HIDDEN_HOME_QUICK_ACTIONS
import cn.pxyb.mycontrol.data.DailyNews
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.GitHubProfileRecord
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.ui.feature.profile.CacheStorageInfo
import cn.pxyb.mycontrol.ui.feature.profile.NetworkHealth
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.state.ActionUiState
import cn.pxyb.mycontrol.update.AppUpdateUiState

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

internal fun AppUiState.isRefreshing(vararg sections: DataSection): Boolean =
    sections.any { sectionLoadStates[it]?.refreshing == true }

internal fun AppUiState.sectionError(vararg sections: DataSection): String? = sections
    .mapNotNull { sectionLoadStates[it]?.error }
    .firstOrNull()
