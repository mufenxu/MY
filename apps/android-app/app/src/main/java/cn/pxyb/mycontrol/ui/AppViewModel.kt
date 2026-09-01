package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.DailyBriefScheduler
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.DeviceControlTileService
import cn.pxyb.mycontrol.SnoozedAlertScheduler
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.buildGuardianAlerts
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.sharedTodoTitle
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AndroidCalendarSync
import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationPreference
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusReservationAvailability
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAccountStore
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import cn.pxyb.mycontrol.data.HomePreferences
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.DEFAULT_HIDDEN_HOME_QUICK_ACTIONS
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.AssistantActionItem
import cn.pxyb.mycontrol.data.AssistantChatTurn
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.data.newTodoTask
import org.json.JSONArray
import org.json.JSONObject
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.PlatformWebSession
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatOverview
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.TodoMutation
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.data.mergeRemoteAlerts
import cn.pxyb.mycontrol.data.mergeHydratedAlerts
import cn.pxyb.mycontrol.flushNotificationMutations
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import cn.pxyb.mycontrol.widget.CourseWidgetProvider
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import cn.pxyb.mycontrol.update.AppInstallResult
import cn.pxyb.mycontrol.update.AppUpdateManager
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState
import cn.pxyb.mycontrol.update.isAppUpdateSigningMismatch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.time.temporal.ChronoUnit
import javax.net.ssl.HttpsURLConnection
import java.security.cert.X509Certificate

enum class MainTab { Overview, Notifications, Operations, Tools, Profile }

enum class WorkspaceDestination { Today, Notifications, Scenes }

enum class DataSection { Overview, ExternalApplications, Incidents, Tasks, Releases, Backup, Iot, Ct8, Security, Todos, Campus, FreeClassrooms, Resources, Notifications, Reservation }

@Immutable
data class SectionLoadState(
    val refreshing: Boolean = false,
    val error: String? = null,
    val updatedAtMillis: Long? = null,
    val fromCache: Boolean = false,
)

@Immutable
data class AppUiState(
    val booting: Boolean = true,
    val locked: Boolean = false,
    val appLockEnabled: Boolean = true,
    val user: PlatformUser? = null,
    val selectedTab: MainTab = MainTab.Overview,
    val loginBusy: Boolean = false,
    val secondFactorRequired: Boolean = false,
    val recoveryCodeAllowed: Boolean = false,
    val androidPasskeySupported: Boolean = false,
    val suggestedUsername: String = "",
    val deviceLoginBusy: Boolean = false,
    val deviceLoginQrDataUrl: String? = null,
    val deviceLoginError: String? = null,
    val refreshing: Boolean = false,
    val busyAction: String? = null,
    val overview: OverviewData? = null,
    val externalApplications: List<ExternalApplication> = emptyList(),
    val incidents: List<IncidentInfo> = emptyList(),
    val tasks: List<PlatformTask> = emptyList(),
    val releases: ReleaseData? = null,
    val appUpdate: AppUpdateUiState = AppUpdateUiState(),
    val backup: BackupQuality? = null,
    val iot: IotData? = null,
    val ct8: Ct8Data? = null,
    val diagnostics: DiagnosticData? = null,
    val security: SecurityData? = null,
    val qrLoginOpen: Boolean = false,
    val qrLoginBusy: Boolean = false,
    val qrLoginTarget: QrLoginTarget? = null,
    val qrLoginError: String? = null,
    val accountManagementOpen: Boolean = false,
    val googleAccountDeskOpen: Boolean = false,
    val globalSearchOpen: Boolean = false,
    val assistantOpen: Boolean = false,
    val workspaceDestination: WorkspaceDestination? = null,
    val googleAccounts: List<GoogleAccountRecord> = emptyList(),
    val googleAccountsLoaded: Boolean = false,
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
    val reservationSpaces: List<CampusReservationSpace> = emptyList(),
    val reservationSpacesLoading: Boolean = false,
    val reservationRules: String? = null,
    val reservationAvailability: String? = null,
    val reservationFreeWindows: List<CampusReservationTimeWindow> = emptyList(),
    val reservationBusyWindows: List<CampusReservationTimeWindow> = emptyList(),
    val reservationAvailabilitySpaceId: Int? = null,
    val reservationAvailabilityDate: String? = null,
    val reservationAvailableSpaces: List<CampusReservationSpace> = emptyList(),
    val reservationAvailableSpacesQueryText: String? = null,
    val reservationAvailableSpacesLoading: Boolean = false,
    val reservationQueryLoading: Boolean = false,
    val reservationSubmitLoading: Boolean = false,
    val reservationAutoTasks: List<CampusAutoReservationTask> = emptyList(),
    val reservationAutoTasksLoading: Boolean = false,
    val reservationSavingTask: Boolean = false,
    val reservationDeletingTaskId: String? = null,
    val reservationMyReservations: List<CampusMyReservation> = emptyList(),
    val reservationMyReservationsLoading: Boolean = false,
    val reservationCancellingReservationId: String? = null,
    val reservationError: String? = null,
    val reservationMessage: String? = null,
    val librarySeatOverview: LibrarySeatOverview = LibrarySeatOverview(),
    val librarySeatOverviewLoading: Boolean = false,
    val librarySeatAreas: List<LibrarySeatArea> = emptyList(),
    val librarySeatAreasLoading: Boolean = false,
    val librarySeatSeats: List<LibrarySeatStatus> = emptyList(),
    val librarySeatSeatsLoading: Boolean = false,
    val librarySeatFloorSeats: List<LibrarySeatFloorSeat> = emptyList(),
    val librarySeatFloorSeatsLoading: Boolean = false,
    val librarySeatSubmitLoading: Boolean = false,
    val librarySeatReservations: List<LibrarySeatReservationRecord> = emptyList(),
    val librarySeatReservationsLoading: Boolean = false,
    val librarySeatHistoryReservations: LibrarySeatReservationHistory = LibrarySeatReservationHistory(),
    val librarySeatHistoryReservationsLoading: Boolean = false,
    val librarySeatSelectedVenueId: String? = null,
    val librarySeatSelectedDate: String? = null,
    val librarySeatSelectedFloorId: String? = null,
    val librarySeatSelectedAreaId: String? = null,
    val librarySeatSelectedSeatId: String? = null,
    val librarySeatError: String? = null,
    val librarySeatMessage: String? = null,
) {
    val activeIncidents: List<IncidentInfo>
        get() = incidents.filter { it.status != "resolved" }
}

@OptIn(kotlinx.coroutines.FlowPreview::class)
class AppViewModel(
    application: Application,
    private val savedStateHandle: SavedStateHandle,
) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val googleAccountStore = GoogleAccountStore(application)
    private val homePreferences = HomePreferences(application)
    private val personalStore = PersonalWorkspaceStore(application)
    private val snapshotStore = ResponseSnapshotStore(application)
    private val api = PlatformApi(sessionStore, snapshotStore)
    private val appUpdateManager = AppUpdateManager(application)
    private val alertNotifier = AlertNotifier(application)
    private val androidCalendarSync = AndroidCalendarSync(application)
    private val hasSavedSession = sessionStore.hasSession()
    private val lockEnabled = sessionStore.isLockEnabled()
    private val savedHomePreferences = homePreferences.read()
    private val appInstallationId = application.getSharedPreferences("app_notification_device", 0)
        .let { preferences ->
            preferences.getString("installation_id", null) ?: UUID.randomUUID().toString().also { id ->
                preferences.edit().putString("installation_id", id).apply()
            }
        }
    @Volatile private var appDeviceRegistered = false
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = hasSavedSession && !lockEnabled,
            locked = hasSavedSession && lockEnabled,
            selectedTab = restoredMainTab(savedStateHandle[SAVED_SELECTED_TAB]) ?: MainTab.Overview,
            suggestedUsername = sessionStore.readLastUsername(),
            appLockEnabled = lockEnabled,
            homeQuickActionOrder = savedHomePreferences.order,
            hiddenHomeQuickActions = savedHomePreferences.hidden,
            workspaceDestination = restoredWorkspaceDestination(savedStateHandle[SAVED_WORKSPACE_DESTINATION]),
            todoSnapshot = TodoSnapshot(),
            pendingTodoMutations = 0,
            alerts = emptyList(),
            alertPreferences = AlertPreferences(),
        ),
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()
    val entryState = deriveState(AppUiState::toEntryUiState)
    val overviewState = deriveState(AppUiState::toOverviewUiState)
    val operationsState = deriveState(AppUiState::toOperationsUiState)
    val toolsState = deriveState(AppUiState::toToolsUiState)
    val profileState = deriveState(AppUiState::toProfileUiState)
    val accountManagementState = deriveState(AppUiState::toAccountManagementUiState)
    val googleAccountDeskState = deriveState(AppUiState::toGoogleAccountDeskUiState)
    val qrLoginState = deriveState(AppUiState::toQrLoginUiState)
    val globalSearchState = deriveState(AppUiState::toGlobalSearchUiState)
    private val assistantChatMutable = MutableStateFlow(AssistantChatUiState())
    val assistantChatState: StateFlow<AssistantChatUiState> = assistantChatMutable.asStateFlow()
    val todayState = deriveState(AppUiState::toTodayUiState)
    val freeClassroomState = deriveState(AppUiState::toFreeClassroomUiState)
    val reservationState = deriveState(AppUiState::toReservationUiState)
    val librarySeatState = deriveState(AppUiState::toLibrarySeatUiState)
    val notificationCenterState = deriveState(AppUiState::toNotificationCenterUiState)
    val scenesState = deriveState(AppUiState::toScenesUiState)
    private var pendingQrLogin: Pair<String, String>? = null
    private var pollJob: Job? = null
    private var deviceLoginJob: Job? = null
    private var appInForeground = false
    private val refreshJobs = mutableMapOf<DataSection, Job>()
    private val lastRefreshElapsedMs = mutableMapOf<DataSection, Long>()
    private var alertsSeeded = false
    private var initialIncidentsLoaded = false
    private var initialTasksLoaded = false
    private var operationalEffectsJob: Job? = null

    private fun <T> deriveState(transform: (AppUiState) -> T): StateFlow<T> = mutableState
        .map(transform)
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), transform(mutableState.value))

    init {
        viewModelScope.launch {
            runCatching { api.loginCapabilities() }.onSuccess { capabilities ->
                mutableState.update { it.copy(androidPasskeySupported = capabilities.androidPasskeySupported) }
            }
        }
        if (!hasSavedSession) {
            MyControlWidgetProvider.clear(getApplication())
            CourseWidgetProvider.clear(getApplication())
        }
        if (hasSavedSession && !lockEnabled) unlockSession()
        viewModelScope.launch {
            mutableState
                .map(::assistantInputs)
                .distinctUntilChanged()
                .debounce(250)
                .collectLatest(::refreshAssistantSnapshot)
        }
    }

    private suspend fun hydrateLocalState() {
        withContext(Dispatchers.IO) {
            val snapshot = personalStore.readTodoSnapshot()
            val pending = personalStore.readPendingTodoMutations()
            val alerts = personalStore.readAlerts()
            val alertPreferences = personalStore.readAlertPreferences()
            val assistantSnapshot = personalStore.readAssistantSnapshot()
            val quickScene = personalStore.readQuickScene()
            mutableState.update { current ->
                if (!current.booting && !current.locked && current.user == null) {
                    current
                } else {
                    current.copy(
                        todoSnapshot = applyTodoMutations(snapshot, pending),
                        pendingTodoMutations = pending.size,
                        alerts = mergeHydratedAlerts(alerts, current.alerts),
                        alertPreferences = alertPreferences,
                        assistantSnapshot = assistantSnapshot,
                        quickScene = quickScene,
                    )
                }
            }
        }
    }

    fun unlockSession() {
        viewModelScope.launch {
            mutableState.update { it.copy(booting = true, error = null) }
            val locallyUnlocked = withContext(Dispatchers.IO) {
                runCatching { sessionStore.unlock() }
            }.getOrElse {
                mutableState.update {
                    it.copy(booting = false, locked = true, error = "设备身份验证已超时，请重新解锁。")
                }
                return@launch
            }
            if (!locallyUnlocked) {
                mutableState.update {
                    it.copy(
                        booting = false,
                        locked = false,
                        user = null,
                        googleAccounts = emptyList(),
                        googleAccountsLoaded = false,
                        googleAccountsRevision = 0,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = false,
                        error = "本地安全会话已失效，请重新登录。",
                    )
                }
                MyControlWidgetProvider.clear(getApplication())
                CourseWidgetProvider.clear(getApplication())
                return@launch
            }
            runCatching { api.authStatus() }
                .onSuccess { user ->
                    if (user == null) {
                        clearAccountScopedState()
                        mutableState.update {
                            it.copy(
                                booting = false,
                                locked = false,
                                user = null,
                                googleAccounts = emptyList(),
                                googleAccountsLoaded = false,
                                googleAccountsRevision = 0,
                                googleAccountMigrationPending = false,
                                googleAccountsRemoteReady = false,
                                error = "登录会话已过期，请重新登录。",
                            )
                        }
                        MyControlWidgetProvider.clear(getApplication())
                        CourseWidgetProvider.clear(getApplication())
                    } else {
                        setAccountScope(user.username)
                        mutableState.update {
                            it.copy(
                                booting = false,
                                locked = false,
                                user = user,
                                offlineMode = api.isOffline(),
                                cachedAtMillis = api.cachedAtMillis(),
                            )
                        }
                        hydrateLocalState()
                        syncRemoteNotifications()
                        loadGoogleAccounts()
                        startOperationalPolling()
                        refreshInitialData()
                        scanPendingQrLogin()
                    }
                }
                .onFailure { error ->
                    sessionStore.lock()
                    mutableState.update {
                        it.copy(
                            booting = false,
                            locked = sessionStore.isLockEnabled(),
                            user = null,
                            googleAccounts = emptyList(),
                            googleAccountsLoaded = false,
                            googleAccountsRevision = 0,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = false,
                            error = error.message ?: "暂时无法验证会话，请重试。",
                        )
                    }
                }
        }
    }

    fun discardLockedSession() {
        stopOperationalPolling()
        cancelRefreshes()
        clearRefreshCache()
        alertsSeeded = false
        initialIncidentsLoaded = false
        initialTasksLoaded = false
        clearAccountScopedState()
        sessionStore.clear()
        mutableState.update { it.copy(booting = false, locked = false, user = null, error = null) }
        MyControlWidgetProvider.clear(getApplication())
        CourseWidgetProvider.clear(getApplication())
    }

    fun login(
        username: String,
        password: String,
        factor: String,
        useRecoveryCode: Boolean,
        authorizeSession: suspend () -> Boolean,
    ) {
        if (username.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(error = "请输入平台账号和密码。", message = null) }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val result = api.login(
                    username,
                    password,
                    totp = factor.takeUnless { useRecoveryCode }.orEmpty(),
                    recoveryCode = factor.takeIf { useRecoveryCode }.orEmpty(),
                    deviceName = currentDeviceName(),
                )
                protectLogin(result, authorizeSession)
            }.onSuccess(::completeLogin).onFailure(::handleLoginFailure)
        }
    }

    fun loginWithPasskey(
        username: String,
        requestCredential: suspend (String) -> String,
        authorizeSession: suspend () -> Boolean,
    ) {
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val challenge = api.beginPasskeyLogin(username)
                val result = api.completePasskeyLogin(
                    challenge,
                    requestCredential(challenge.optionsJson),
                    deviceName = currentDeviceName(),
                )
                protectLogin(result, authorizeSession)
            }.onSuccess(::completeLogin).onFailure(::handleLoginFailure)
        }
    }

    private fun currentDeviceName(): String {
        val custom = runCatching {
            Settings.Global.getString(getApplication<Application>().contentResolver, Settings.Global.DEVICE_NAME)
        }.getOrNull()?.trim().orEmpty()
        if (custom.isNotBlank()) return custom
        val manufacturer = Build.MANUFACTURER?.trim().orEmpty()
        val model = Build.MODEL?.trim().orEmpty()
        return when {
            model.isBlank() && manufacturer.isBlank() -> "Android 设备"
            manufacturer.isBlank() || model.equals(manufacturer, ignoreCase = true) -> model
            else -> "$manufacturer $model"
        }
    }

    fun startDeviceQrLogin(authorizeSession: suspend () -> Boolean) {
        val current = mutableState.value
        if (current.user != null || current.deviceLoginBusy) return
        if (!current.androidPasskeySupported) {
            mutableState.update {
                it.copy(deviceLoginError = "服务器尚未关联当前 Android App 的签名证书。")
            }
            return
        }
        deviceLoginJob = viewModelScope.launch {
            try {
                mutableState.update {
                    it.copy(
                        deviceLoginBusy = true,
                        deviceLoginQrDataUrl = null,
                        deviceLoginError = null,
                        error = null,
                        message = null,
                    )
                }
                val request = api.createQrLoginRequest()
                mutableState.update {
                    it.copy(
                        deviceLoginQrDataUrl = request.qrDataUrl,
                    )
                }
                while (true) {
                    delay(2_000)
                    val status = api.qrLoginRequestStatus(request.requestId, request.requesterVerifier)
                    when (status.status) {
                        "approved" -> {
                            val result = api.consumeQrLoginRequest(request.requestId, request.requesterVerifier)
                            completeLogin(protectLogin(result, authorizeSession))
                            return@launch
                        }
                        "rejected" -> throw IllegalStateException("已登录设备拒绝了本次登录。")
                        "expired" -> throw IllegalStateException("登录二维码已过期，请重新发起。")
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                handleLoginFailure(error)
                mutableState.update {
                    it.copy(deviceLoginError = error.message ?: "跨设备登录失败，请稍后重试。")
                }
            } finally {
                deviceLoginJob = null
                mutableState.update {
                    it.copy(
                        deviceLoginBusy = false,
                        deviceLoginQrDataUrl = null,
                    )
                }
            }
        }
    }

    fun cancelDeviceQrLogin() {
        deviceLoginJob?.cancel()
        deviceLoginJob = null
        mutableState.update {
            it.copy(
                deviceLoginBusy = false,
                deviceLoginQrDataUrl = null,
                deviceLoginError = null,
            )
        }
    }

    private suspend fun protectLogin(
        result: cn.pxyb.mycontrol.data.LoginResult,
        authorizeSession: suspend () -> Boolean,
    ): cn.pxyb.mycontrol.data.LoginResult {
        return try {
            sessionStore.prepareProtection()
            if (!authorizeSession()) throw IllegalStateException("未完成设备身份验证，登录会话未保存。")
            api.persistLogin(result)
            result
        } catch (error: Throwable) {
            api.discardLogin(result)
            throw error
        }
    }

    fun resetSecondFactor() {
        mutableState.update {
            it.copy(
                loginBusy = false,
                secondFactorRequired = false,
                recoveryCodeAllowed = false,
                error = null,
                message = null,
            )
        }
    }

    fun lockSession() {
        if (!sessionStore.isLockEnabled()) return
        if (mutableState.value.user != null && !mutableState.value.qrLoginBusy) {
            stopOperationalPolling()
            cancelRefreshes()
            clearRefreshCache()
            val hasSession = sessionStore.hasSession()
            sessionStore.lock()
            if (hasSession) {
                mutableState.update {
                    it.copy(
                        locked = true,
                        accountManagementOpen = false,
                        googleAccountDeskOpen = false,
                        globalSearchOpen = false,
                        googleAccounts = emptyList(),
                        googleAccountsLoaded = false,
                        googleAccountsRevision = 0,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = false,
                    )
                }
            } else {
                alertsSeeded = false
                initialIncidentsLoaded = false
                initialTasksLoaded = false
                alertNotifier.clear()
                clearRefreshCache()
                mutableState.update {
                    it.copy(
                        locked = false,
                        user = null,
                        googleAccounts = emptyList(),
                        googleAccountsLoaded = false,
                        googleAccountsRevision = 0,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = false,
                        error = "登录会话已过期，请重新登录。",
                    )
                }
                MyControlWidgetProvider.clear(getApplication())
                CourseWidgetProvider.clear(getApplication())
            }
        }
    }

    fun setAppInForeground(inForeground: Boolean) {
        appInForeground = inForeground
        if (!inForeground) {
            stopOperationalPolling()
        } else if (mutableState.value.user != null && !mutableState.value.locked) {
            startOperationalPolling()
            refreshCurrentDestination(force = false)
        }
    }

    fun setAppLockEnabled(enabled: Boolean) {
        sessionStore.setLockEnabled(enabled)
        mutableState.update { it.copy(appLockEnabled = enabled) }
    }

    fun updateHomeQuickActions(order: List<HomeQuickAction>, hidden: Set<HomeQuickAction>) {
        val normalizedOrder = (order + HomeQuickAction.entries).distinct()
        val normalizedHidden = hidden.intersect(HomeQuickAction.entries.toSet())
            .takeIf { it.size < HomeQuickAction.entries.size }
            ?: emptySet()
        homePreferences.write(normalizedOrder, normalizedHidden)
        mutableState.update {
            it.copy(
                homeQuickActionOrder = normalizedOrder,
                hiddenHomeQuickActions = normalizedHidden,
            )
        }
    }

    private fun completeLogin(result: cn.pxyb.mycontrol.data.LoginResult) {
        setAccountScope(result.user.username)
        mutableState.update {
            it.copy(
                loginBusy = false,
                locked = false,
                user = result.user,
                suggestedUsername = result.user.username,
                secondFactorRequired = false,
                recoveryCodeAllowed = false,
                message = result.recoveryCodes.takeIf(List<String>::isNotEmpty)?.let {
                    "动态验证已启用，请妥善保存网页登录页显示的恢复码。"
                },
                offlineMode = false,
                cachedAtMillis = null,
            )
        }
        loadGoogleAccounts()
        alertsSeeded = false
        initialIncidentsLoaded = false
        initialTasksLoaded = false
        startOperationalPolling()
        refreshInitialData()
        scanPendingQrLogin()
        viewModelScope.launch {
            hydrateLocalState()
            syncRemoteNotifications()
        }
    }

    private fun setAccountScope(username: String?) {
        appDeviceRegistered = false
        googleAccountStore.setAccount(username)
        personalStore.setAccount(username)
        snapshotStore.setAccount(username)
        alertNotifier.setAccount(username)
        api.setAccount(username)
    }

    private fun clearAccountScopedState() {
        alertNotifier.clear()
        personalStore.clearAccountData()
        snapshotStore.clear()
        googleAccountStore.clear()
        setAccountScope(null)
    }

    private fun handleLoginFailure(error: Throwable) {
        val apiError = error as? ApiException
        if (apiError?.code == "SECOND_FACTOR_REQUIRED") {
            mutableState.update {
                it.copy(
                    loginBusy = false,
                    secondFactorRequired = true,
                    recoveryCodeAllowed = apiError.details?.optBoolean("recoveryCodeAllowed") == true,
                    error = null,
                    message = "账号密码验证通过，请完成第二步验证。",
                )
            }
            return
        }
        val requiresFactor = apiError?.code == "SECOND_FACTOR_REQUIRED" || mutableState.value.secondFactorRequired
        val recoveryAllowed = apiError?.details?.optBoolean("recoveryCodeAllowed") == true || mutableState.value.recoveryCodeAllowed
        val message = when (apiError?.code) {
            "MFA_ENROLLMENT_REQUIRED" -> "首次绑定动态验证请先在网页控制台完成。"
            "PASSKEY_REQUIRED" -> "该账号要求使用 Passkey，请使用下方 Passkey 登录。"
            "BOT_CHALLENGE_REQUIRED" -> "登录触发了安全验证，请先在网页控制台完成验证。"
            else -> error.message ?: "登录失败，请稍后重试。"
        }
        mutableState.update {
            it.copy(
                loginBusy = false,
                secondFactorRequired = requiresFactor,
                recoveryCodeAllowed = recoveryAllowed,
                error = message,
                message = null,
            )
        }
    }

    fun logout() {
        viewModelScope.launch {
            stopOperationalPolling()
            cancelRefreshes()
            mutableState.update { it.copy(busyAction = "logout", error = null) }
            api.logout()
            alertsSeeded = false
            initialIncidentsLoaded = false
            initialTasksLoaded = false
            clearAccountScopedState()
            mutableState.update {
                AppUiState(
                    booting = false,
                    androidPasskeySupported = it.androidPasskeySupported,
                    suggestedUsername = sessionStore.readLastUsername(),
                    appLockEnabled = it.appLockEnabled,
                    homeQuickActionOrder = it.homeQuickActionOrder,
                    hiddenHomeQuickActions = it.hiddenHomeQuickActions,
                )
            }
            MyControlWidgetProvider.clear(getApplication())
            CourseWidgetProvider.clear(getApplication())
        }
    }

    fun selectTab(tab: MainTab) {
        syncNavigationDestination(tab)
    }

    fun syncNavigationDestination(
        tab: MainTab,
        accountManagementOpen: Boolean = false,
        googleAccountDeskOpen: Boolean = false,
        globalSearchOpen: Boolean = false,
        assistantOpen: Boolean = false,
        workspaceDestination: WorkspaceDestination? = null,
        autoRefresh: Boolean = true,
    ) {
        val destinationChanged = mutableState.value.selectedTab != tab ||
            mutableState.value.accountManagementOpen != accountManagementOpen ||
            mutableState.value.googleAccountDeskOpen != googleAccountDeskOpen ||
            mutableState.value.globalSearchOpen != globalSearchOpen ||
            mutableState.value.assistantOpen != assistantOpen ||
            mutableState.value.workspaceDestination != workspaceDestination

        mutableState.update { current ->
            if (!destinationChanged) {
                current
            } else {
                current.copy(
                    selectedTab = tab,
                    accountManagementOpen = accountManagementOpen,
                    googleAccountDeskOpen = googleAccountDeskOpen,
                    globalSearchOpen = globalSearchOpen,
                    assistantOpen = assistantOpen,
                    workspaceDestination = workspaceDestination,
                )
            }
        }
        persistNavigationState()
        if (autoRefresh) {
            refreshDestination(
                tab = tab,
                accountManagementOpen = accountManagementOpen,
                googleAccountDeskOpen = googleAccountDeskOpen,
                globalSearchOpen = globalSearchOpen,
                assistantOpen = assistantOpen,
                workspaceDestination = workspaceDestination,
                force = false,
            )
        }
    }

    fun handleOpenIntent(uri: Uri?) {
        if (uri == null) return
        if (uri.scheme == DeepLinks.SCHEME && uri.host == DeepLinks.HOST_OPEN) {
            val workspace = uri.getQueryParameter(DeepLinks.EXTRA_DESTINATION)
                ?.let { value -> WorkspaceDestination.entries.firstOrNull { it.name.equals(value, ignoreCase = true) } }
            if (workspace != null) {
                val sceneId = uri.getQueryParameter(DeepLinks.EXTRA_SCENE_ID)
                    ?.trim()
                    ?.takeIf(String::isNotBlank)
                if (workspace == WorkspaceDestination.Scenes && sceneId != null) {
                    mutableState.update { it.copy(pendingSceneId = sceneId) }
                }
                openWorkspace(workspace)
                return
            }
            openOperationalTarget(
                tab = DeepLinks.parseTab(uri.getQueryParameter(DeepLinks.EXTRA_TAB)),
                taskId = uri.getQueryParameter(DeepLinks.EXTRA_TASK_ID),
            )
            return
        }
        if (uri.path?.startsWith("/app/qr-login") == true) {
            handleQrLoginUrl(uri.toString())
        }
    }

    fun openOperationalTarget(
        tab: MainTab? = null,
        taskId: String? = null,
    ) {
        if (!taskId.isNullOrBlank()) {
            openWorkspace(WorkspaceDestination.Notifications)
            return
        }
        val resolvedTab = tab
        mutableState.update {
            it.copy(
                selectedTab = resolvedTab ?: it.selectedTab,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                globalSearchOpen = false,
                workspaceDestination = null,
                error = null,
                message = null,
            )
        }
        persistNavigationState()
        resolvedTab?.let(::refreshForTab)
    }

    fun openSharedTodo(subject: String?, text: String?) {
        val draft = sharedTodoTitle(subject, text)
        if (draft.isBlank()) return
        mutableState.update { it.copy(sharedTodoDraft = draft) }
        openWorkspace(WorkspaceDestination.Today)
    }

    fun consumeSharedTodoDraft() {
        mutableState.update { it.copy(sharedTodoDraft = null) }
    }

    fun consumePendingScene() {
        mutableState.update { it.copy(pendingSceneId = null) }
    }

    fun setQuickScene(id: String, name: String) {
        val value = QuickScenePreference(id, name)
        personalStore.writeQuickScene(value)
        mutableState.update { it.copy(quickScene = value, message = "快捷磁贴已设为“$name”。") }
        DeviceControlTileService.requestRefresh(getApplication())
        viewModelScope.launch { publishWidget() }
    }

    fun openQrScanner() {
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun openWorkspace(destination: WorkspaceDestination) {
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Overview,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                globalSearchOpen = false,
                workspaceDestination = destination,
                error = null,
                message = null,
            )
        }
        persistNavigationState()
        when (destination) {
            WorkspaceDestination.Today -> refreshToday()
            WorkspaceDestination.Notifications -> reloadPersonalState()
            WorkspaceDestination.Scenes -> refreshIot()
        }
    }

    fun closeWorkspace() {
        mutableState.update { it.copy(workspaceDestination = null) }
        persistNavigationState()
    }

    private fun persistNavigationState() {
        val current = mutableState.value
        savedStateHandle[SAVED_SELECTED_TAB] = current.selectedTab.name
        savedStateHandle[SAVED_WORKSPACE_DESTINATION] = current.workspaceDestination?.name
    }

    fun openGlobalSearch() {
        mutableState.update {
            it.copy(
                globalSearchOpen = true,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
            )
        }
        refreshGlobalSearch(force = true)
    }

    fun closeGlobalSearch() {
        mutableState.update { it.copy(globalSearchOpen = false) }
    }

    fun openAssistant() {
        mutableState.update {
            it.copy(
                assistantOpen = true,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                globalSearchOpen = false,
                workspaceDestination = null,
                error = null,
                message = null,
            )
        }
        startAssistantOverview()
    }

    fun sendAssistantMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || assistantChatMutable.value.sending) return
        val current = mutableState.value
        if (current.user == null || current.locked) {
            assistantChatMutable.update { it.copy(error = "请先登录后再使用 AI 助手。") }
            return
        }
        val userTurn = AssistantChatMessageUi(role = "user", content = trimmed)
        val history = (assistantChatMutable.value.messages + userTurn).takeLast(12)
        assistantChatMutable.update { it.copy(messages = history, sending = true, error = null) }
        viewModelScope.launch {
            val context = buildAssistantContext(current)
            val turns = history.map { AssistantChatTurn(role = it.role, content = it.content) }
            runCatching { api.assistantChat(turns, context) }
                .onSuccess { reply ->
                    assistantChatMutable.update { state ->
                        state.copy(
                            messages = state.messages + AssistantChatMessageUi(
                                role = "assistant",
                                content = reply.reply,
                                suggestions = reply.suggestions,
                                actions = reply.actions,
                            ),
                            sending = false,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    assistantChatMutable.update { it.copy(sending = false, error = mapAssistantError(error)) }
                }
        }
    }

    private fun startAssistantOverview() {
        val current = mutableState.value
        if (current.user == null || current.locked) return
        if (assistantChatMutable.value.sending || assistantChatMutable.value.messages.isNotEmpty()) return
        assistantChatMutable.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            val context = buildAssistantContext(current)
            val turns = listOf(
                AssistantChatTurn(
                    role = "user",
                    content = "请基于工作台上下文生成一份今日概览：简洁总结今天的课程、待办、未读告警和备份状态，并给出最值得先做的 1-2 件事。",
                ),
            )
            runCatching { api.assistantChat(turns, context) }
                .onSuccess { reply ->
                    assistantChatMutable.update { state ->
                        state.copy(
                            messages = state.messages + AssistantChatMessageUi(
                                role = "assistant",
                                content = reply.reply,
                                suggestions = reply.suggestions,
                                actions = reply.actions,
                            ),
                            sending = false,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    assistantChatMutable.update { it.copy(sending = false, error = mapAssistantError(error)) }
                }
        }
    }

    fun performAssistantAction(action: AssistantActionItem): String {
        val current = mutableState.value
        val result = when (action.type) {
            "create_todo" -> {
                val title = action.title.trim()
                if (title.isEmpty()) {
                    "待办标题为空，无法创建。"
                } else {
                    saveTodo(newTodoTask(title))
                    "已创建待办「$title」。"
                }
            }
            "complete_todo" -> {
                val title = action.title.trim()
                val task = current.todoSnapshot.tasks.firstOrNull { it.title.trim() == title }
                when {
                    task == null -> "未找到匹配的待办「$title」。"
                    task.completed -> "待办「$title」已完成。"
                    else -> {
                        toggleTodo(task.id)
                        "已将待办「$title」标记为完成。"
                    }
                }
            }
            "mark_alerts_read" -> {
                markAllAlertsRead()
                "已将通知全部标为已读。"
            }
            else -> ""
        }
        if (result.isNotEmpty()) {
            assistantChatMutable.update { state ->
                state.copy(
                    messages = state.messages + AssistantChatMessageUi(role = "assistant", content = result),
                )
            }
        }
        return result
    }

    private fun mapAssistantError(error: Throwable): String = when {
        error is ApiException && error.code == "AI_RATE_LIMITED" -> "AI 助手请求过于频繁，请稍后再试。"
        error is ApiException && error.code == "AI_NOT_CONFIGURED" -> "AI 助手服务未配置，请联系管理员。"
        error is ApiException && error.code == "PLATFORM_SESSION_REQUIRED" -> "登录会话已失效，请重新登录。"
        error is ApiException -> error.message ?: "请求失败，请稍后再试。"
        else -> "网络异常，请稍后再试。"
    }

    private fun buildAssistantContext(state: AppUiState): JSONObject = JSONObject().apply {
        put("date", LocalDate.now().toString())
        put("generatedAt", System.currentTimeMillis())
        state.assistantSnapshot?.let { snapshot ->
            put("nextActionTitle", snapshot.nextAction.title)
            put("nextActionDetail", snapshot.nextAction.detail)
            put("nextActionDestination", snapshot.nextAction.destination.deepLinkValue)
            put("morningBrief", snapshot.morningBrief)
            put("eveningBrief", snapshot.eveningBrief)
        }
        val pendingTodos = state.todoSnapshot.tasks.filter { !it.completed }
        if (pendingTodos.isNotEmpty()) {
            put("pendingTodoCount", pendingTodos.size)
            put("pendingTodos", pendingTodos.take(8).joinToString("；") { it.title })
        }
        val courses = state.campusTimetable?.courses.orEmpty()
        if (courses.isNotEmpty()) {
            put("timetable", courses.take(12).joinToString("；") { course ->
                "${course.dayName} ${course.timeRange} ${course.courseName} @ ${course.location}"
            })
        }
        val activeIncidents = state.activeIncidents
        if (activeIncidents.isNotEmpty()) {
            put("incidents", activeIncidents.take(6).joinToString("；") { "${it.severity} ${it.title}" })
        }
        val unreadAlerts = state.alerts.count { !it.read }
        put("unreadAlertCount", unreadAlerts)
        if (unreadAlerts > 0) {
            put("recentAlerts", state.alerts.filter { !it.read }.take(6).joinToString("；") { it.title })
        }
        state.resourceExpiries.takeIf { it.isNotEmpty() }?.let { expiries ->
            put("resourceExpiries", expiries.take(6).joinToString("；") { "${it.type} ${it.name} 于 ${it.expiresAt} 到期" })
        }
        state.backup?.let { backup ->
            put("backupAgeHours", backup.ageHours?.toString() ?: "未知")
            put("backupRpoState", backup.rpoState)
            put("backupValidCount", backup.validBackups)
        }
    }

    fun openGlobalSearchResult(item: GlobalSearchItem) {
        mutableState.update { it.copy(globalSearchOpen = false) }
        when (item.destination) {
            SearchDestination.Overview -> selectTab(MainTab.Overview)
            SearchDestination.Notifications -> openWorkspace(WorkspaceDestination.Notifications)
            SearchDestination.Tools -> selectTab(MainTab.Tools)
            SearchDestination.GoogleAccounts -> openGoogleAccountDesk()
            SearchDestination.Today -> openWorkspace(WorkspaceDestination.Today)
            SearchDestination.Scenes -> openWorkspace(WorkspaceDestination.Scenes)
        }
    }

    fun openAccountManagement() {
        val changedTab = mutableState.value.selectedTab != MainTab.Profile
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Profile,
                accountManagementOpen = true,
                googleAccountDeskOpen = false,
                globalSearchOpen = false,
            )
        }
        if (changedTab) refreshForTab(MainTab.Profile)
    }

    fun closeAccountManagement() {
        mutableState.update { it.copy(accountManagementOpen = false) }
    }

    fun openGoogleAccountDesk() {
        val changedTab = mutableState.value.selectedTab != MainTab.Profile
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Profile,
                accountManagementOpen = false,
                googleAccountDeskOpen = true,
                globalSearchOpen = false,
            )
        }
        if (changedTab) refreshForTab(MainTab.Profile)
        loadGoogleAccounts()
    }

    fun closeGoogleAccountDesk() {
        mutableState.update { it.copy(googleAccountDeskOpen = false) }
    }

    fun addGoogleAccount(
        primaryEmail: String,
        displayName: String,
        emailStatus: String,
        openAiStatus: String,
        tagsText: String,
        nextReviewAtText: String,
        note: String,
    ) {
        val email = normalizeGoogleAddress(primaryEmail)
        val tags = normalizeGoogleTags(tagsText) ?: return
        val nextReviewAt = parseGoogleReviewDate(nextReviewAtText)
        if (nextReviewAtText.isNotBlank() && nextReviewAt == null) {
            setGoogleAccountError("检查日期请使用 yyyy-MM-dd 格式。")
            return
        }
        when {
            !isValidGoogleAddress(email) -> setGoogleAccountError("请输入有效的 Google 邮箱地址。")
            mutableState.value.googleAccounts.any { it.primaryEmail == email } ->
                setGoogleAccountError("这个主邮箱已经添加过了。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts + GoogleAccountRecord(
                        id = UUID.randomUUID().toString(),
                        primaryEmail = email,
                        displayName = displayName.trim(),
                        emailStatus = emailStatus,
                        openAiStatus = openAiStatus,
                        note = note.trim(),
                        nextReviewAt = nextReviewAt,
                        tags = tags,
                    )
                },
                successMessage = "Google 邮箱已添加。",
            )
        }
    }

    fun importGoogleAccounts(rawText: String) {
        val candidates = rawText
            .split(Regex("[\\s,;]+"))
            .map(::normalizeGoogleAddress)
            .filter(::isValidGoogleAddress)
            .distinct()
        val existing = mutableState.value.googleAccounts.map { it.primaryEmail }.toSet()
        val newEmails = candidates.filterNot(existing::contains)
        if (newEmails.isEmpty()) {
            setGoogleAccountError("没有找到可导入的新邮箱。")
            return
        }
        val skippedCount = rawText
            .split(Regex("[\\s,;]+"))
            .count { it.isNotBlank() } - newEmails.size
        persistGoogleAccounts(
            transform = { accounts ->
                accounts + newEmails.map { email ->
                    GoogleAccountRecord(
                        id = UUID.randomUUID().toString(),
                        primaryEmail = email,
                    )
                }
            },
            successMessage = if (skippedCount > 0) {
                "已导入 ${newEmails.size} 个邮箱，跳过 $skippedCount 个无效或重复地址。"
            } else {
                "已导入 ${newEmails.size} 个邮箱。"
            },
        )
    }

    fun updateGoogleAccount(
        id: String,
        primaryEmail: String,
        displayName: String,
        emailStatus: String,
        openAiStatus: String,
        tagsText: String,
        nextReviewAtText: String,
        note: String,
    ) {
        val email = normalizeGoogleAddress(primaryEmail)
        val tags = normalizeGoogleTags(tagsText) ?: return
        val nextReviewAt = parseGoogleReviewDate(nextReviewAtText)
        if (nextReviewAtText.isNotBlank() && nextReviewAt == null) {
            setGoogleAccountError("检查日期请使用 yyyy-MM-dd 格式。")
            return
        }
        when {
            !isValidGoogleAddress(email) -> setGoogleAccountError("请输入有效的 Google 邮箱地址。")
            mutableState.value.googleAccounts.any { it.id != id && it.primaryEmail == email } ->
                setGoogleAccountError("这个主邮箱已经被其他记录使用。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts.map { account ->
                        if (account.id != id) account else account.copy(
                            primaryEmail = email,
                            displayName = displayName.trim(),
                            emailStatus = emailStatus,
                            openAiStatus = openAiStatus,
                            note = note.trim(),
                            lastCheckedAt = System.currentTimeMillis(),
                            nextReviewAt = nextReviewAt,
                            tags = tags,
                        )
                    }
                },
                successMessage = "邮箱记录已更新。",
            )
        }
    }

    fun deleteGoogleAccount(id: String) = persistGoogleAccounts(
        transform = { accounts -> accounts.filterNot { it.id == id } },
        successMessage = "邮箱记录已删除。",
    )

    fun bulkUpdateGoogleAccounts(ids: Set<String>, openAiStatus: String) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts ->
                accounts.map { account ->
                    if (account.id in ids) account.copy(
                        openAiStatus = openAiStatus,
                        lastCheckedAt = System.currentTimeMillis(),
                    ) else account
                }
            },
            successMessage = "已批量更新 ${ids.size} 个邮箱状态。",
        )
    }

    fun bulkSetGoogleAccountsArchived(ids: Set<String>, archived: Boolean) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts ->
                accounts.map { account ->
                    if (account.id in ids) account.copy(archived = archived) else account
                }
            },
            successMessage = if (archived) "已归档 ${ids.size} 个邮箱。" else "已恢复 ${ids.size} 个邮箱。",
        )
    }

    fun bulkDeleteGoogleAccounts(ids: Set<String>) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts -> accounts.filterNot { it.id in ids } },
            successMessage = "已删除 ${ids.size} 个邮箱记录。",
        )
    }

    fun addGoogleAlias(accountId: String, address: String, aliasType: String = "plus") {
        val normalizedAddress = normalizeGoogleAddress(address)
        when {
            !isValidGoogleAddress(normalizedAddress) -> setGoogleAccountError("请输入有效的别名地址。")
            mutableState.value.googleAccounts
                .firstOrNull { it.id == accountId }
                ?.aliases
                ?.any { it.address == normalizedAddress } == true ->
                setGoogleAccountError("这个别名已经添加过了。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts.map { account ->
                        if (account.id != accountId) account else account.copy(
                            aliases = account.aliases + GoogleAliasRecord(
                                id = UUID.randomUUID().toString(),
                                address = normalizedAddress,
                                aliasType = aliasType,
                            ),
                        )
                    }
                },
                successMessage = "邮箱别名已添加。",
            )
        }
    }

    fun updateGoogleAlias(
        accountId: String,
        aliasId: String,
        aliasStatus: String,
        openAiStatus: String,
        note: String,
    ) = persistGoogleAccounts(
        transform = { accounts ->
            val now = System.currentTimeMillis()
            accounts.map { account ->
                if (account.id != accountId) account else account.copy(
                    aliases = account.aliases.map { alias ->
                        if (alias.id != aliasId) alias else alias.copy(
                            aliasStatus = aliasStatus,
                            openAiStatus = openAiStatus,
                            registeredAt = if (openAiStatus == "registered") alias.registeredAt ?: now else null,
                            lastVerifiedAt = now,
                            note = note.trim(),
                        )
                    },
                )
            }
        },
        successMessage = "别名状态已更新。",
    )

    fun deleteGoogleAlias(accountId: String, aliasId: String) = persistGoogleAccounts(
        transform = { accounts ->
            accounts.map { account ->
                if (account.id != accountId) account else account.copy(
                    aliases = account.aliases.filterNot { it.id == aliasId },
                )
            }
        },
        successMessage = "邮箱别名已删除。",
    )

    private fun loadGoogleAccounts() {
        if (mutableState.value.googleAccountsLoaded || mutableState.value.user == null) return
        viewModelScope.launch {
            val localResult = runCatching { withContext(Dispatchers.IO) { googleAccountStore.read() } }
            val localAccounts = localResult.getOrDefault(emptyList())
            runCatching { api.googleAccounts() }
                .onSuccess { snapshot ->
                    if (snapshot.accounts.isEmpty() && localAccounts.isNotEmpty()) {
                        mutableState.update {
                            it.copy(
                                googleAccounts = localAccounts,
                                googleAccountsLoaded = true,
                                googleAccountsRevision = snapshot.revision,
                                googleAccountMigrationPending = true,
                                googleAccountsRemoteReady = false,
                                error = null,
                                message = "发现本机邮箱记录，请选择是否上传到服务器。",
                            )
                        }
                    } else {
                        runCatching { withContext(Dispatchers.IO) { googleAccountStore.write(snapshot.accounts) } }
                        mutableState.update {
                            it.copy(
                                googleAccounts = snapshot.accounts,
                                googleAccountsLoaded = true,
                                googleAccountsRevision = snapshot.revision,
                                googleAccountMigrationPending = false,
                                googleAccountsRemoteReady = true,
                                error = null,
                            )
                        }
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(
                            googleAccounts = localAccounts,
                            googleAccountsLoaded = true,
                            googleAccountsRevision = 0,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = false,
                            error = if (localResult.isFailure && localAccounts.isEmpty()) {
                                localResult.exceptionOrNull()?.message ?: "Google 邮箱台账读取失败。"
                            } else {
                                error.message ?: "服务器暂时不可用，当前显示本机缓存。"
                            },
                        )
                    }
                }
        }
    }

    fun uploadLocalGoogleAccounts() {
        if (!mutableState.value.googleAccountMigrationPending) return
        persistGoogleAccounts(
            transform = { it },
            successMessage = "本机邮箱记录已上传到服务器。",
        )
    }

    fun discardLocalGoogleAccounts() {
        if (mutableState.value.busyAction != null || !mutableState.value.googleAccountMigrationPending) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "google-accounts", error = null, message = null) }
            runCatching { withContext(Dispatchers.IO) { googleAccountStore.clear() } }
                .onSuccess {
                    mutableState.update {
                        it.copy(
                            googleAccounts = emptyList(),
                            googleAccountsLoaded = true,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = true,
                            busyAction = null,
                            message = "已清除本机缓存，服务器台账仍为空。",
                        )
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "本机缓存清除失败。")
                    }
                }
        }
    }

    private fun persistGoogleAccounts(
        transform: (List<GoogleAccountRecord>) -> List<GoogleAccountRecord>,
        successMessage: String,
    ) {
        val current = mutableState.value
        if (current.busyAction != null) return
        if (!current.googleAccountsRemoteReady && !current.googleAccountMigrationPending) {
            setGoogleAccountError("服务器暂时不可用，邮箱台账当前为只读缓存。")
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "google-accounts", error = null, message = null) }
            runCatching {
                val accounts = transform(mutableState.value.googleAccounts)
                val snapshot = api.replaceGoogleAccounts(accounts, mutableState.value.googleAccountsRevision)
                withContext(Dispatchers.IO) { googleAccountStore.write(snapshot.accounts) }
                snapshot
            }.onSuccess { snapshot ->
                mutableState.update {
                    it.copy(
                        googleAccounts = snapshot.accounts,
                        googleAccountsLoaded = true,
                        googleAccountsRevision = snapshot.revision,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = true,
                        busyAction = null,
                        message = successMessage,
                    )
                }
            }.onFailure { error ->
                if (error is ApiException && error.code == "GOOGLE_ACCOUNT_REVISION_CONFLICT") {
                    mutableState.update {
                        it.copy(
                            busyAction = null,
                            googleAccountsLoaded = false,
                            googleAccountsRemoteReady = false,
                            error = "服务器上的邮箱台账已更新，正在重新加载。",
                        )
                    }
                    loadGoogleAccounts()
                } else {
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "Google 邮箱台账保存失败。")
                    }
                }
            }
        }
    }

    private fun setGoogleAccountError(message: String) {
        mutableState.update { it.copy(error = message, message = null) }
    }

    private fun normalizeGoogleTags(raw: String): List<String>? {
        val tags = raw.split(',', '，', ';', '；', '\n')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (tags.size > 20 || tags.any { it.length > 40 }) {
            setGoogleAccountError("标签最多 20 个，每个标签不超过 40 个字符。")
            return null
        }
        return tags
    }

    private fun parseGoogleReviewDate(raw: String): Long? = runCatching {
        LocalDate.parse(raw.trim())
            .atStartOfDay(ZoneId.systemDefault())
            .toInstant()
            .toEpochMilli()
    }.getOrNull()

    private fun normalizeGoogleAddress(address: String): String = address.trim().lowercase()

    private fun isValidGoogleAddress(address: String): Boolean =
        address.length <= 254 && address.count { it == '@' } == 1 &&
            address.substringBefore('@').isNotBlank() &&
            address.substringAfter('@').contains('.') &&
            address.none(Char::isWhitespace)

    fun handleQrLoginUrl(rawUrl: String?) {
        if (rawUrl.isNullOrBlank()) return
        val parsed = parseQrLoginUrl(rawUrl)
        if (parsed == null) {
            mutableState.update {
                it.copy(qrLoginOpen = true, qrLoginTarget = null, qrLoginError = "二维码不是有效的 MY Platform 登录请求。")
            }
            return
        }
        pendingQrLogin = parsed
        if (mutableState.value.user != null && !mutableState.value.locked) {
            scanPendingQrLogin()
        }
    }

    fun scanQrCode(rawValue: String) {
        if (mutableState.value.qrLoginBusy || mutableState.value.qrLoginTarget != null) return
        handleQrLoginUrl(rawValue)
    }

    fun resetQrScanner() {
        pendingQrLogin = null
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun closeQrLogin() {
        pendingQrLogin = null
        mutableState.update {
            it.copy(qrLoginOpen = false, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun rejectQrLogin() {
        val target = mutableState.value.qrLoginTarget ?: return closeQrLogin()
        if (mutableState.value.qrLoginBusy) return
        viewModelScope.launch {
            mutableState.update { it.copy(qrLoginBusy = true, qrLoginError = null) }
            runCatching { api.rejectQrLogin(target.requestId) }
                .onSuccess {
                    mutableState.update {
                        it.copy(qrLoginOpen = false, qrLoginBusy = false, qrLoginTarget = null, message = "已拒绝本次网页登录。")
                    }
                }
                .onFailure { error ->
                    mutableState.update { it.copy(qrLoginBusy = false, qrLoginError = qrErrorMessage(error)) }
            }
        }
    }

    suspend fun createPlatformWebLoginUrl(redirectUrl: String): String {
        val link = api.createWebLoginLink(redirectUrl)
        return link.loginUrl.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("服务端未返回自动登录链接。")
    }

    fun openCampusReservation(onOpen: (String) -> Unit) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "campus-reservation", error = null, message = null) }
            try {
                val url = createPlatformWebLoginUrl(campusReservationRedirect())
                mutableState.update { it.copy(busyAction = null) }
                onOpen(url)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(busyAction = null, error = error.message ?: "研讨间预约入口打开失败，请稍后重试。")
                }
            }
        }
    }

    fun openOfficialCampusReservation(onOpen: (PlatformWebSession) -> Unit) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    busyAction = "official-campus-reservation",
                    reservationError = null,
                    reservationMessage = null,
                )
            }
            try {
                val session = api.campusReservationOfficialWebSession()
                mutableState.update { it.copy(busyAction = null) }
                onOpen(session)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        reservationError = error.message ?: "学校官方预约入口打开失败，请稍后重试。",
                    )
                }
            }
        }
    }

    suspend fun createExternalApplicationLaunch(applicationId: String): ExternalApplicationLaunch {
        val launch = api.launchExternalApplication(applicationId)
        if (launch.loginUrl.isBlank()) throw IllegalStateException("服务端未返回外部应用登录地址。")
        return launch
    }

    fun approveQrLogin(
        requestCredential: suspend (String) -> String,
        requestBiometric: suspend () -> Boolean,
    ) {
        val target = mutableState.value.qrLoginTarget ?: return
        if (mutableState.value.qrLoginBusy || target.status == "approved") return
        if (
            target.confirmationMethod == "unavailable" ||
            target.confirmationMethod == "passkey" && !mutableState.value.androidPasskeySupported
        ) {
            mutableState.update { it.copy(qrLoginError = "服务器尚未关联当前 Android App 的签名证书。") }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(qrLoginBusy = true, qrLoginError = null) }
            runCatching {
                if (target.confirmationMethod == "passkey") {
                    val challenge = api.beginQrPasskey(target.requestId)
                    api.approveQrWithPasskey(
                        target.requestId,
                        challenge,
                        requestCredential(challenge.optionsJson),
                    )
                } else {
                    if (!requestBiometric()) throw IllegalStateException("身份验证已取消，未批准网页登录。")
                    api.approveQrWithBiometric(target.requestId)
                }
            }.onSuccess { approved ->
                mutableState.update {
                    it.copy(qrLoginBusy = false, qrLoginTarget = approved, message = "网页登录已安全批准。")
                }
            }.onFailure { error ->
                mutableState.update { it.copy(qrLoginBusy = false, qrLoginError = qrErrorMessage(error)) }
            }
        }
    }

    private fun scanPendingQrLogin() {
        val pending = pendingQrLogin ?: return
        if (mutableState.value.user == null || mutableState.value.locked || mutableState.value.qrLoginBusy) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(qrLoginOpen = true, qrLoginBusy = true, qrLoginTarget = null, qrLoginError = null)
            }
            runCatching { api.scanQrLogin(pending.first, pending.second) }
                .onSuccess { target ->
                    pendingQrLogin = null
                    mutableState.update { it.copy(qrLoginBusy = false, qrLoginTarget = target) }
                }
                .onFailure { error ->
                    pendingQrLogin = null
                    mutableState.update { it.copy(qrLoginBusy = false, qrLoginError = qrErrorMessage(error)) }
                }
        }
    }

    private fun parseQrLoginUrl(rawUrl: String): Pair<String, String>? {
        return runCatching {
            val uri = Uri.parse(rawUrl)
            val expectedHost = Uri.parse(BuildConfig.PLATFORM_BASE_URL).host
            if (uri.scheme != "https" || uri.host != expectedHost || uri.path != "/app/qr-login") return null
            val requestId = uri.getQueryParameter("requestId").orEmpty()
            val fragment = Uri.parse("https://local.invalid/?${uri.fragment.orEmpty()}")
            val scanToken = fragment.getQueryParameter("scanToken").orEmpty()
            if (!requestId.matches(Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")) || scanToken.length !in 32..128) return null
            requestId to scanToken
        }.getOrNull()
    }

    private fun qrErrorMessage(error: Throwable): String {
        val apiError = error as? ApiException
        return when (apiError?.code) {
            "QR_LOGIN_UNAVAILABLE", "QR_LOGIN_EXPIRED" -> "二维码已过期或已被使用，请在网页刷新后重试。"
            "QR_PASSKEY_REQUIRED" -> "超级管理员需先在账号安全设置中绑定 Passkey。"
            "QR_ANDROID_PASSKEY_UNAVAILABLE" -> "服务器尚未关联当前 Android App 的签名证书。"
            "QR_PASSKEY_INVALID" -> "Passkey 验证失败，未批准网页登录。"
            else -> error.message ?: "扫码登录操作失败，请稍后重试。"
        }
    }

    fun refreshCurrentTab(force: Boolean = true) {
        refreshCurrentDestination(force)
    }

    fun refreshCurrentWorkspace(force: Boolean = true) {
        refreshCurrentDestination(force)
    }

    fun refreshCurrentDestination(force: Boolean = true) {
        mutableState.update { it.copy(error = null) }
        val current = mutableState.value
        refreshDestination(
            tab = current.selectedTab,
            accountManagementOpen = current.accountManagementOpen,
            googleAccountDeskOpen = current.googleAccountDeskOpen,
            globalSearchOpen = current.globalSearchOpen,
            assistantOpen = current.assistantOpen,
            workspaceDestination = current.workspaceDestination,
            force = force,
        )
    }

    fun refreshDestination(
        tab: MainTab,
        accountManagementOpen: Boolean = false,
        googleAccountDeskOpen: Boolean = false,
        globalSearchOpen: Boolean = false,
        assistantOpen: Boolean = false,
        workspaceDestination: WorkspaceDestination? = null,
        force: Boolean = false,
    ) {
        if (mutableState.value.user == null || mutableState.value.locked) return
        when {
            assistantOpen -> {
                // AI 助手使用现有工作台状态作为上下文，无需额外拉取。
            }
            workspaceDestination == WorkspaceDestination.Today -> refreshToday(force)
            workspaceDestination == WorkspaceDestination.Scenes -> refreshIot(force)
            workspaceDestination == WorkspaceDestination.Notifications -> {
                refreshIncidents(force)
                syncRemoteNotifications(force)
                reloadPersonalState()
            }
            googleAccountDeskOpen -> {
                loadGoogleAccounts()
            }
            accountManagementOpen -> {
                refreshSecurity(force)
                refreshPasskeys()
            }
            globalSearchOpen -> {
                refreshGlobalSearch(force)
            }
            else -> {
                refreshForTab(tab, force)
            }
        }
    }

    private fun refreshInitialData(force: Boolean = false) {
        refreshOverview(force)
        refreshExternalApplications(force)
        refreshIncidents(force)
        refreshTasks(force)
        refreshTodos(force)
        refreshCampus(force)
    }

    private fun refreshGlobalSearch(force: Boolean = false) {
        refreshOverview(force)
        refreshExternalApplications(force)
        refreshIncidents(force)
        refreshTasks(force)
        refreshTodos(force)
        refreshCampus(force)
        refreshResourceExpiries(force)
        refreshIot(force)
        syncRemoteNotifications(force)
        loadGoogleAccounts()
    }

    private fun refreshForTab(tab: MainTab, force: Boolean = false) {
        when (tab) {
            MainTab.Overview -> refreshInitialData(force)
            MainTab.Notifications -> {
                refreshIncidents(force)
                syncRemoteNotifications(force)
            }
            MainTab.Operations -> {
                refreshOverview(force)
                refreshIncidents(force)
                refreshBackup(force)
                refreshIot(force)
                refreshResourceExpiries(force)
            }
            MainTab.Tools -> {
                refreshIot(force)
                refreshCt8(force)
            }
            MainTab.Profile -> {
                refreshSecurity(force)
                updateCacheStorageInfo()
                measureNetworkHealth()
            }
        }
    }

    private fun refreshOverview(force: Boolean) = launchRefresh(DataSection.Overview, force) {
        val overview = api.overview(force)
        mutableState.update { it.copy(overview = overview) }
        publishWidget()
    }

    private fun refreshExternalApplications(force: Boolean = false) =
        launchRefresh(DataSection.ExternalApplications, force) {
            mutableState.update { it.copy(externalApplications = api.externalApplications()) }
        }

    private fun refreshIncidents(force: Boolean = false) = launchRefresh(DataSection.Incidents, force) {
        val incidents = api.incidents()
        mutableState.update { it.copy(incidents = incidents) }
        initialIncidentsLoaded = true
        publishWidget()
        evaluateAlerts()
    }

    private fun refreshTasks(force: Boolean = false) = launchRefresh(DataSection.Tasks, force) {
        val tasks = api.tasks().tasks
        mutableState.update { it.copy(tasks = tasks) }
        initialTasksLoaded = true
        evaluateAlerts()
    }

    private fun refreshReleases(force: Boolean = false) = launchRefresh(DataSection.Releases, force) {
        val releases = api.releases()
        mutableState.update { it.copy(releases = releases) }
    }

    private fun refreshBackup(force: Boolean = false) = launchRefresh(DataSection.Backup, force) {
        val backup = api.backupQuality()
        mutableState.update { it.copy(backup = backup) }
    }

    private fun refreshIot(force: Boolean = false) = launchRefresh(DataSection.Iot, force) {
        val iot = api.iot()
        mutableState.update { it.copy(iot = iot) }
        publishWidget()
    }

    private fun refreshToday(force: Boolean = false) {
        refreshTodos(force)
        refreshCampus(force)
        refreshResourceExpiries(force)
        refreshIncidents(force)
        refreshTasks(force)
    }

    private fun refreshTodos(force: Boolean = false) = launchRefresh(DataSection.Todos, force) {
        val remote = api.todos()
        val pending = withContext(Dispatchers.IO) { personalStore.readPendingTodoMutations() }
        if (api.isOffline()) {
            val local = applyTodoMutations(remote, pending)
            withContext(Dispatchers.IO) { personalStore.writeTodoSnapshot(local) }
            mutableState.update {
                it.copy(todoSnapshot = local, pendingTodoMutations = pending.size)
            }
        } else {
            withContext(Dispatchers.IO) { personalStore.writeTodoSnapshot(remote) }
            mutableState.update { it.copy(todoSnapshot = remote) }
            syncPendingTodos()
        }
        evaluatePersonalReminders()
    }

    private fun refreshCampus(force: Boolean = false) = launchRefresh(DataSection.Campus, force) {
        val campus = api.campusDashboard()
        mutableState.update {
            it.copy(
                campusTimetable = campus.timetable,
                campusOverview = campus.overview,
                freeClassroomResult = it.freeClassroomResult ?: campus.overview.freeClassrooms,
            )
        }
        publishWidget()
        evaluatePersonalReminders()
    }

    fun queryFreeClassrooms(dayplus: Int, sections: List<Int>, building: String) =
        launchRefresh(DataSection.FreeClassrooms, force = true, publishError = false) {
            val result = api.campusFreeClassrooms(dayplus, sections, building)
            mutableState.update { it.copy(freeClassroomResult = result) }
        }

    fun refreshReservation() {
        loadReservationSpaces(force = true)
        loadMyReservations(force = true)
        loadAutoReservationTasks(force = true)
    }

    fun loadReservationSpaces(force: Boolean = false) {
        if (mutableState.value.reservationSpacesLoading) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationSpacesLoading = true, reservationError = null) }
            try {
                val spaces = api.campusReservationSpaces()
                mutableState.update {
                    it.copy(
                        reservationSpaces = spaces,
                        reservationSpacesLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationSpacesLoading = false,
                        reservationError = error.message ?: "空间加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryReservationRulesAndAvailability(spaceId: Int, date: String) {
        if (spaceId <= 0 || date.isBlank() || mutableState.value.reservationQueryLoading) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    reservationQueryLoading = true,
                    reservationRules = "查询中...",
                    reservationAvailability = "查询中...",
                    reservationFreeWindows = emptyList(),
                    reservationBusyWindows = emptyList(),
                    reservationAvailabilitySpaceId = null,
                    reservationAvailabilityDate = null,
                    reservationError = null,
                )
            }
            try {
                supervisorScope {
                    val rulesDeferred = async {
                        try {
                            api.campusReservationRules(spaceId)
                        } catch (error: Throwable) {
                            if (error is CancellationException) throw error
                            null
                        }
                    }
                    val availabilityDeferred = async {
                        try {
                            api.campusReservationAvailability(spaceId, date)
                        } catch (error: Throwable) {
                            if (error is CancellationException) throw error
                            null
                        }
                    }
                    val rules = rulesDeferred.await() ?: "暂无规则信息"
                    val availability = availabilityDeferred.await()
                        ?: CampusReservationAvailability(detail = "暂无时段占用信息")
                    mutableState.update {
                        it.copy(
                            reservationRules = rules,
                            reservationAvailability = availability.detail,
                            reservationFreeWindows = availability.freeWindows,
                            reservationBusyWindows = availability.busyWindows,
                            reservationAvailabilitySpaceId = spaceId,
                            reservationAvailabilityDate = date,
                            reservationQueryLoading = false,
                        )
                    }
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationRules = "查询失败",
                        reservationAvailability = "查询失败",
                        reservationFreeWindows = emptyList(),
                        reservationBusyWindows = emptyList(),
                        reservationAvailabilitySpaceId = null,
                        reservationAvailabilityDate = null,
                        reservationQueryLoading = false,
                        reservationError = error.message ?: "查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryAvailableSpacesByTime(date: String, startTime: String, endTime: String) {
        if (date.isBlank() || startTime.isBlank() || endTime.isBlank() || mutableState.value.reservationAvailableSpacesLoading) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    reservationAvailableSpacesLoading = true,
                    reservationAvailableSpaces = emptyList(),
                    reservationAvailableSpacesQueryText = "$date $startTime - $endTime",
                    reservationError = null,
                )
            }
            try {
                val availableSpaces = api.campusReservationSpaces(date = date, startTime = startTime, endTime = endTime)
                mutableState.update {
                    it.copy(
                        reservationAvailableSpaces = availableSpaces,
                        reservationAvailableSpacesLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationAvailableSpacesLoading = false,
                        reservationError = error.message ?: "按时段查询空闲学习间失败，请重试。",
                    )
                }
            }
        }
    }

    fun submitReservation(request: CampusReservationRequest, onSuccess: () -> Unit = {}) {
        if (mutableState.value.reservationSubmitLoading) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationSubmitLoading = true, reservationError = null, reservationMessage = null) }
            try {
                api.submitCampusReservation(request)
                mutableState.update {
                    it.copy(
                        reservationSubmitLoading = false,
                        reservationMessage = "预约已提交成功，请以学校预约系统记录为准。",
                    )
                }
                loadMyReservations(force = true)
                onSuccess()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationSubmitLoading = false,
                        reservationError = error.message ?: "预约提交失败，请重试。",
                    )
                }
            }
        }
    }

    fun loadMyReservations(force: Boolean = false) {
        if (mutableState.value.reservationMyReservationsLoading) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationMyReservationsLoading = true) }
            try {
                val records = api.campusMyReservations()
                mutableState.update {
                    it.copy(
                        reservationMyReservations = records,
                        reservationMyReservationsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationMyReservationsLoading = false,
                    )
                }
            }
        }
    }

    fun cancelMyReservation(reservationId: String, onSuccess: () -> Unit = {}) {
        if (reservationId.isBlank() || mutableState.value.reservationCancellingReservationId != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationCancellingReservationId = reservationId, reservationError = null, reservationMessage = null) }
            try {
                api.cancelCampusReservation(reservationId)
                mutableState.update {
                    it.copy(
                        reservationCancellingReservationId = null,
                        reservationMessage = "已成功取消该研讨间预约。",
                        reservationMyReservations = it.reservationMyReservations.filter { r -> r.id != reservationId }
                    )
                }
                loadMyReservations(force = true)
                onSuccess()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationCancellingReservationId = null,
                        reservationError = error.message ?: "取消预约失败，请重试。",
                    )
                }
            }
        }
    }

    fun refreshLibrarySeat() {
        loadLibrarySeatOverview(force = true)
        loadLibrarySeatReservations(force = true)
    }

    fun loadLibrarySeatOverview(force: Boolean = false) {
        if (mutableState.value.librarySeatOverviewLoading && !force) return
        viewModelScope.launch {
            mutableState.update { it.copy(librarySeatOverviewLoading = true, librarySeatError = null, librarySeatMessage = null) }
            try {
                val overview = api.librarySeatOverview()
                mutableState.update { current ->
                    val venueId = current.librarySeatSelectedVenueId.takeIf { selected ->
                        overview.venues.any { it.id == selected }
                    } ?: overview.venues.firstOrNull()?.id
                    val date = current.librarySeatSelectedDate.takeIf { selected ->
                        overview.dates.contains(selected)
                    } ?: overview.dates.firstOrNull()
                    current.copy(
                        librarySeatOverview = overview,
                        librarySeatOverviewLoading = false,
                        librarySeatSelectedVenueId = venueId,
                        librarySeatSelectedDate = date,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatOverviewLoading = false,
                        librarySeatError = error.message ?: "座位场馆加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryLibrarySeatAreas(
        venueId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        floorId: String? = null,
        pageSize: Int = 50,
        currentPage: Int = 1,
        power: Boolean = false,
        window: Boolean = false,
    ) {
        if (
            venueId.isBlank() ||
            date.isBlank() ||
            startMinute < 0 ||
            endMinute <= startMinute ||
            mutableState.value.librarySeatAreasLoading
        ) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    librarySeatAreasLoading = true,
                    librarySeatAreas = emptyList(),
                    librarySeatError = null,
                    librarySeatMessage = null,
                    librarySeatSelectedVenueId = venueId,
                    librarySeatSelectedDate = date,
                    librarySeatSelectedFloorId = floorId,
                    librarySeatSelectedAreaId = null,
                    librarySeatSelectedSeatId = null,
                    librarySeatSeats = emptyList(),
                )
            }
            try {
                val areas = api.librarySeatAreas(
                    venueId = venueId,
                    date = date,
                    startMinute = startMinute,
                    endMinute = endMinute,
                    floorId = floorId,
                    pageSize = pageSize,
                    currentPage = currentPage,
                    power = power,
                    window = window,
                )
                mutableState.update {
                    it.copy(
                        librarySeatAreas = areas,
                        librarySeatAreasLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatAreasLoading = false,
                        librarySeatError = error.message ?: "阅览区查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun loadLibrarySeatSeats(
        roomId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        amPm: Int = 0,
    ) {
        if (roomId.isBlank() || date.isBlank() || endMinute <= startMinute || mutableState.value.librarySeatSeatsLoading) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    librarySeatSeatsLoading = true,
                    librarySeatSeats = emptyList(),
                    librarySeatError = null,
                    librarySeatMessage = null,
                    librarySeatSelectedAreaId = roomId,
                    librarySeatSelectedDate = date,
                    librarySeatSelectedSeatId = null,
                )
            }
            try {
                val seats = api.librarySeatSeats(roomId, date, startMinute, endMinute, amPm)
                mutableState.update {
                    it.copy(
                        librarySeatSeats = seats,
                        librarySeatSeatsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatSeatsLoading = false,
                        librarySeatError = error.message ?: "座位列表加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryLibrarySeatFloorSeats(
        venueId: String,
        floorId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        minLabel: Int = 1,
        maxLabel: Int = 45,
    ) {
        if (
            venueId.isBlank() ||
            floorId.isBlank() ||
            date.isBlank() ||
            startMinute < 0 ||
            endMinute <= startMinute ||
            mutableState.value.librarySeatFloorSeatsLoading
        ) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    librarySeatFloorSeatsLoading = true,
                    librarySeatFloorSeats = emptyList(),
                    librarySeatError = null,
                    librarySeatMessage = null,
                )
            }
            try {
                val areas = api.librarySeatAreas(
                    venueId = venueId,
                    date = date,
                    startMinute = startMinute,
                    endMinute = endMinute,
                    floorId = floorId,
                    pageSize = 50,
                    currentPage = 1,
                    power = false,
                    window = false,
                )
                val floorSeats = supervisorScope {
                    areas.map { area ->
                        async {
                            api.librarySeatSeats(area.id, date, startMinute, endMinute, 0)
                                .map { seat -> LibrarySeatFloorSeat(area.id, area.name, seat) }
                        }
                    }.flatMap { it.await() }
                }.filter { floorSeat ->
                    (floorSeat.seat.label.toIntOrNull() ?: -1) in minLabel..maxLabel
                }.sortedWith(
                    compareBy<LibrarySeatFloorSeat> { it.seat.label.toIntOrNull() ?: Int.MAX_VALUE }
                        .thenBy { it.seat.label }
                        .thenBy { it.areaName },
                )
                mutableState.update {
                    it.copy(
                        librarySeatFloorSeats = floorSeats,
                        librarySeatFloorSeatsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatFloorSeatsLoading = false,
                        librarySeatError = error.message ?: "二层座位查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun submitLibrarySeatReservation(request: LibrarySeatReservationRequest, onSuccess: () -> Unit = {}) {
        if (mutableState.value.librarySeatSubmitLoading) return
        viewModelScope.launch {
            mutableState.update { it.copy(librarySeatSubmitLoading = true, librarySeatError = null, librarySeatMessage = null) }
            try {
                api.submitLibrarySeatReservation(request)
                mutableState.update {
                    it.copy(
                        librarySeatSubmitLoading = false,
                        librarySeatMessage = "座位预约已提交成功，请以学校预约系统记录为准。",
                    )
                }
                loadLibrarySeatReservations()
                onSuccess()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatSubmitLoading = false,
                        librarySeatError = error.message ?: "座位预约提交失败，请重试。",
                    )
                }
            }
        }
    }

    fun loadLibrarySeatReservations(force: Boolean = false) {
        if (mutableState.value.librarySeatReservationsLoading && !force) return
        viewModelScope.launch {
            mutableState.update { it.copy(librarySeatReservationsLoading = true) }
            try {
                val records = api.librarySeatReservations()
                mutableState.update {
                    it.copy(
                        librarySeatReservations = records,
                        librarySeatReservationsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatReservationsLoading = false,
                        librarySeatError = error.message ?: "座位预约记录加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun loadLibrarySeatReservationHistory(force: Boolean = false) {
        if (mutableState.value.librarySeatHistoryReservationsLoading && !force) return
        viewModelScope.launch {
            mutableState.update { it.copy(librarySeatHistoryReservationsLoading = true) }
            try {
                val history = api.librarySeatReservationHistory(page = 0, size = 20)
                mutableState.update {
                    it.copy(
                        librarySeatHistoryReservations = history,
                        librarySeatHistoryReservationsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        librarySeatHistoryReservationsLoading = false,
                        librarySeatError = error.message ?: "历史预约记录加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun clearLibrarySeatFeedback() {
        mutableState.update { it.copy(librarySeatError = null, librarySeatMessage = null) }
    }

    fun loadAutoReservationTasks(force: Boolean = false) {
        if (mutableState.value.reservationAutoTasksLoading) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationAutoTasksLoading = true, reservationError = null) }
            try {
                val tasks = api.campusAutoReservations()
                mutableState.update {
                    it.copy(
                        reservationAutoTasks = tasks,
                        reservationAutoTasksLoading = false,
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationAutoTasksLoading = false,
                        reservationError = error.message ?: "自动预约任务加载失败。",
                    )
                }
            }
        }
    }

    fun saveAutoReservationTask(task: CampusAutoReservationTask, onSuccess: () -> Unit = {}) {
        if (mutableState.value.reservationSavingTask) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationSavingTask = true, reservationError = null, reservationMessage = null) }
            try {
                if (task.id.isNotBlank()) {
                    api.updateCampusAutoReservation(task)
                } else {
                    api.createCampusAutoReservation(task)
                }
                mutableState.update {
                    it.copy(
                        reservationSavingTask = false,
                        reservationMessage = "自动预约任务已保存。",
                    )
                }
                loadAutoReservationTasks(force = true)
                onSuccess()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationSavingTask = false,
                        reservationError = error.message ?: "自动预约任务保存失败。",
                    )
                }
            }
        }
    }

    fun toggleAutoReservationTask(task: CampusAutoReservationTask) {
        viewModelScope.launch {
            try {
                api.updateCampusAutoReservation(task.copy(enabled = !task.enabled))
                loadAutoReservationTasks(force = true)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(reservationError = error.message ?: "任务状态更新失败。")
                }
            }
        }
    }

    fun deleteAutoReservationTask(taskId: String) {
        if (taskId.isBlank()) return
        viewModelScope.launch {
            mutableState.update { it.copy(reservationDeletingTaskId = taskId, reservationError = null, reservationMessage = null) }
            try {
                api.deleteCampusAutoReservation(taskId)
                mutableState.update {
                    it.copy(
                        reservationDeletingTaskId = null,
                        reservationMessage = "自动预约任务已删除。",
                    )
                }
                loadAutoReservationTasks(force = true)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        reservationDeletingTaskId = null,
                        reservationError = error.message ?: "任务删除失败。",
                    )
                }
            }
        }
    }

    fun clearReservationFeedback() {
        mutableState.update { it.copy(reservationError = null, reservationMessage = null) }
    }

    private fun refreshResourceExpiries(force: Boolean = false) = launchRefresh(DataSection.Resources, force) {
        val resources = api.resourceExpiries()
        mutableState.update { it.copy(resourceExpiries = resources) }
        withContext(Dispatchers.IO) { alertNotifier.evaluateResourceExpiries(resources) }
        reloadPersonalState()
    }

    private fun refreshCt8(force: Boolean = false) = launchRefresh(DataSection.Ct8, force) {
        val ct8 = api.ct8()
        mutableState.update { it.copy(ct8 = ct8) }
    }

    private fun refreshSecurity(force: Boolean = false) = launchRefresh(DataSection.Security, force) {
        val security = api.security()
        mutableState.update { it.copy(security = security) }
        refreshPasskeysInternal()
    }

    private fun launchRefresh(
        section: DataSection,
        force: Boolean = false,
        publishError: Boolean = force,
        block: suspend () -> Unit,
    ) {
        if (mutableState.value.user == null || refreshJobs[section]?.isActive == true) return
        val now = SystemClock.elapsedRealtime()
        val lastRefresh = lastRefreshElapsedMs[section]
        if (!force && lastRefresh != null && now - lastRefresh < REFRESH_CACHE_WINDOW_MS) return
        updateSectionLoadState(section) { it.copy(refreshing = true, error = null) }
        val job = viewModelScope.launch {
            try {
                block()
                lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
                updateConnectivityState()
                updateSectionLoadState(section) {
                    it.copy(
                        error = null,
                        updatedAtMillis = System.currentTimeMillis(),
                        fromCache = api.isOffline(),
                    )
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                updateConnectivityState()
                updateSectionLoadState(section) {
                    it.copy(error = error.message ?: "请稍后重试。")
                }
                if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
                    forceReauthentication(error.message ?: "登录会话已失效，请重新登录。")
                } else if (publishError) {
                    mutableState.update {
                        it.copy(error = "部分数据暂不可用：${error.message ?: "请稍后重试。"}")
                    }
                }
            } finally {
                refreshJobs.remove(section)
                updateSectionLoadState(section) { it.copy(refreshing = false) }
                updateRefreshingState()
            }
        }
        refreshJobs[section] = job
        updateRefreshingState()
    }

    private fun cancelRefreshes() {
        refreshJobs.values.toList().forEach { it.cancel() }
        refreshJobs.clear()
    }

    private fun clearRefreshCache() {
        lastRefreshElapsedMs.clear()
    }

    private fun updateRefreshingState() {
        val refreshing = refreshJobs.values.any { it.isActive }
        mutableState.update { current ->
            if (current.refreshing == refreshing) current else current.copy(refreshing = refreshing)
        }
    }

    private fun updateConnectivityState() {
        mutableState.update { current ->
            current.copy(
                offlineMode = api.isOffline(),
                cachedAtMillis = api.cachedAtMillis(),
            )
        }
    }

    private fun updateSectionLoadState(
        section: DataSection,
        transform: (SectionLoadState) -> SectionLoadState,
    ) {
        mutableState.update { current ->
            current.copy(
                sectionLoadStates = current.sectionLoadStates +
                    (section to transform(current.sectionLoadStates[section] ?: SectionLoadState())),
            )
        }
    }

    fun saveTodo(task: TodoTask) {
        if (task.title.isBlank()) return
        enqueueTodoMutation(
            TodoMutation(
                type = "upsert",
                task = task.copy(title = task.title.trim(), updatedAt = System.currentTimeMillis()),
            ),
        )
    }

    fun toggleTodo(id: String) {
        val task = mutableState.value.todoSnapshot.tasks.firstOrNull { it.id == id } ?: return
        saveTodo(task.copy(completed = !task.completed))
    }

    fun deleteTodo(id: String) {
        enqueueTodoMutation(TodoMutation(type = "delete", id = id))
    }

    fun syncAndroidCalendar() {
        if (mutableState.value.busyAction != null) return
        val current = mutableState.value
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "calendar-sync", error = null, message = null) }
            runCatching {
                withContext(Dispatchers.IO) {
                    androidCalendarSync.sync(
                        accountUsername = current.user?.username ?: sessionStore.readActiveUsername(),
                        timetable = current.campusTimetable,
                        todos = current.todoSnapshot,
                        resources = current.resourceExpiries,
                    )
                }
            }.onSuccess { result ->
                mutableState.update { it.copy(busyAction = null, message = result.message()) }
            }.onFailure { error ->
                mutableState.update {
                    it.copy(busyAction = null, error = error.message ?: "日历同步失败，请稍后重试。")
                }
            }
        }
    }

    fun reportCalendarPermissionDenied() {
        mutableState.update { it.copy(error = "需要日历读写权限才能同步课程、待办和到期提醒。", message = null) }
    }

    fun markAlertRead(id: String) {
        val record = mutableState.value.alerts.firstOrNull { it.id == id }
        updateAlerts { alerts -> alerts.map { if (it.id == id) it.copy(read = true) else it } }
        if (record?.origin == "remote") {
            viewModelScope.launch { runCatching { api.markAppNotificationRead(id) } }
        }
    }

    fun markAllAlertsRead() {
        val hasUnreadRemote = mutableState.value.alerts.any { it.origin == "remote" && !it.read }
        updateAlerts { alerts -> alerts.map { it.copy(read = true) } }
        if (hasUnreadRemote) viewModelScope.launch { runCatching { api.markAllAppNotificationsRead() } }
    }

    fun clearReadAlerts() {
        val hasReadRemote = mutableState.value.alerts.any { it.origin == "remote" && it.read }
        updateAlerts { alerts -> alerts.filterNot(AppAlertRecord::read) }
        if (hasReadRemote) {
            viewModelScope.launch {
                runCatching { api.clearReadAppNotifications() }
                    .onSuccess { syncRemoteNotifications() }
            }
        }
    }

    fun archiveAlert(id: String) {
        val record = mutableState.value.alerts.firstOrNull { it.id == id } ?: return
        updateAlerts { alerts -> alerts.filterNot { it.id == id } }
        if (record.origin == "remote") {
            viewModelScope.launch {
                runCatching { api.archiveAppNotification(id) }
                    .onFailure { syncRemoteNotifications() }
            }
        }
    }

    fun snoozeAlert(id: String, durationMillis: Long = 60 * 60_000L) {
        val record = mutableState.value.alerts.firstOrNull { it.id == id }
        val snoozedUntil = System.currentTimeMillis() + durationMillis
        updateAlerts { alerts ->
            alerts.map {
                if (it.id == id) it.copy(read = false, snoozedUntil = snoozedUntil) else it
            }
        }
        if (record?.origin == "remote") {
            viewModelScope.launch { runCatching { api.snoozeAppNotification(id, snoozedUntil) } }
        }
        SnoozedAlertScheduler.schedule(getApplication(), id, durationMillis)
    }

    fun updateAlertPreferences(preferences: AlertPreferences) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { personalStore.writeAlertPreferences(preferences) }
            runCatching {
                api.saveAppNotificationPreference(
                    AppNotificationPreference(
                        quietHoursEnabled = preferences.quietHoursEnabled,
                        quietStartHour = preferences.quietStartHour,
                        quietEndHour = preferences.quietEndHour,
                        timezoneOffsetMinutes = ZoneId.systemDefault().rules
                            .getOffset(java.time.Instant.now()).totalSeconds / 60,
                    ),
                )
            }
            mutableState.update { it.copy(alertPreferences = preferences, message = "提醒设置已保存。") }
        }
    }

    fun openAlert(record: AppAlertRecord) {
        markAlertRead(record.id)
        if (record.origin == "remote" && record.actions.firstOrNull()?.deepLink?.let(::openNotificationDeepLink) == true) return
        when (record.type) {
            "incident" -> openWorkspace(WorkspaceDestination.Notifications)
            "task" -> openWorkspace(WorkspaceDestination.Notifications)
            "todo", "course" -> openWorkspace(WorkspaceDestination.Today)
            else -> Unit
        }
    }

    fun openNotificationAction(record: AppAlertRecord, action: AppNotificationAction) {
        markAlertRead(record.id)
        openNotificationDeepLink(action.deepLink)
    }

    fun saveIotScene(id: String?, name: String, actions: List<IotSceneAction>) {
        if (name.isBlank() || actions.isEmpty()) {
            mutableState.update { it.copy(error = "请填写场景名称并至少添加一个设备动作。") }
            return
        }
        runAction("scene-edit", if (id == null) "智能场景已创建。" else "智能场景已更新。") {
            if (id == null) api.createIotScene(name, actions) else api.updateIotScene(id, name, actions)
            mutableState.update { it.copy(iot = api.iot()) }
        }
    }

    fun deleteIotScene(id: String, confirmation: suspend () -> Boolean) =
        runAction("scene-delete", "智能场景已删除。", confirmation) {
            api.deleteIotScene(id)
            mutableState.update { it.copy(iot = api.iot()) }
        }

    fun saveIotRule(
        id: String?,
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
        confirmation: suspend () -> Boolean,
    ) {
        if (name.isBlank() || condition.deviceId.isBlank() || actions.isEmpty()) {
            mutableState.update { it.copy(error = "请填写规则名称、触发条件并选择执行场景。") }
            return
        }
        runAction("rule-edit", if (id == null) "自动化规则已创建。" else "自动化规则已更新。", confirmation) {
            if (id == null) {
                api.createIotRule(name, condition, actions, cooldownSeconds)
            } else {
                api.updateIotRule(id, name, enabled, condition, actions, cooldownSeconds)
            }
            mutableState.update { it.copy(iot = api.iot()) }
        }
    }

    fun setIotRuleEnabled(id: String, enabled: Boolean, confirmation: suspend () -> Boolean) =
        runAction("rule-toggle", if (enabled) "自动化规则已启用。" else "自动化规则已停用。", confirmation) {
            api.setIotRuleEnabled(id, enabled)
            mutableState.update { it.copy(iot = api.iot()) }
        }

    fun deleteIotRule(id: String, confirmation: suspend () -> Boolean) =
        runAction("rule-delete", "自动化规则已删除。", confirmation) {
            api.deleteIotRule(id)
            mutableState.update { it.copy(iot = api.iot()) }
        }

    fun runDiagnostics() = runAction("diagnostics", "所有者一键巡检已完成。") {
        val diagnostics = api.runDiagnostics()
        val current = mutableState.value
        val overview = runCatching { api.overview(force = true) }.getOrDefault(current.overview)
        val incidents = runCatching { api.incidents() }.getOrDefault(current.incidents)
        val backup = runCatching { api.backupQuality() }.getOrDefault(current.backup)
        val iot = runCatching { api.iot() }.getOrDefault(current.iot)
        val resources = runCatching { api.resourceExpiries() }.getOrDefault(current.resourceExpiries)
        mutableState.update {
            it.copy(
                diagnostics = diagnostics,
                overview = overview,
                incidents = incidents,
                backup = backup,
                iot = iot,
                resourceExpiries = resources,
            )
        }
        publishWidget()
    }

    fun triggerBackup(confirmation: suspend () -> Boolean) =
        runAction("backup", "备份任务已进入执行队列。", confirmation) {
        api.triggerBackup()
        mutableState.update { it.copy(backup = api.backupQuality()) }
    }

    fun triggerCt8(confirmation: suspend () -> Boolean) =
        runAction("ct8", "CT8 任务已提交。", confirmation) {
        api.triggerCt8()
        mutableState.update { it.copy(ct8 = api.ct8()) }
    }

    fun runIotScene(id: String, confirmation: suspend () -> Boolean) =
        runAction("scene", "IoT 场景指令已进入执行队列。", confirmation) {
            api.runIotScene(id)
            mutableState.update { it.copy(iot = api.iot()) }
            publishWidget()
        }

    fun addIncidentNote(id: String, note: String) =
        runAction("incident-note:$id", "处理记录已保存。") {
            api.updateIncident(id, "note", note)
            mutableState.update { it.copy(incidents = api.incidents()) }
        }

    fun muteIncident(id: String, confirmation: suspend () -> Boolean) =
        runAction("incident-mute:$id", "该问题已静音 1 小时。", confirmation) {
            api.updateIncident(id, "mute", muteMinutes = 60)
            mutableState.update { it.copy(incidents = api.incidents()) }
        }

    fun resolveIncident(id: String, note: String, confirmation: suspend () -> Boolean) =
        runAction("incident-resolve:$id", "该问题已标记解决。", confirmation) {
            api.updateIncident(id, "resolve", note)
            mutableState.update { it.copy(incidents = api.incidents()) }
        }

    fun controlIotRelay(
        deviceId: String,
        relayId: String,
        enabled: Boolean,
    ) = runAction("relay:$deviceId:$relayId", "继电器指令已发送。") {
        api.controlIotRelay(deviceId, relayId, enabled)
        mutableState.update { it.copy(iot = api.iot()) }
        publishWidget()
    }

    fun revokeSession(nonce: String, confirmation: suspend () -> Boolean) =
        runAction("session", "远程会话已撤销。", confirmation) {
            api.revokeSession(nonce)
            mutableState.update { it.copy(security = api.security()) }
        }

    fun changePassword(oldPassword: String, newPassword: String, totp: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "password", error = null, message = null) }
            runCatching { api.changePassword(oldPassword, newPassword, totp) }
                .onSuccess { revoked ->
                    if (revoked) {
                        forceReauthentication("密码已修改，所有会话已退出，请使用新密码重新登录。")
                    } else {
                        mutableState.update { it.copy(busyAction = null, message = "登录密码已更新。") }
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "密码修改失败，请稍后重试。")
                    }
                }
        }
    }

    fun beginTotpEnrollment(password: String, totp: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "totp-enroll", error = null, message = null) }
            runCatching { api.beginTotpEnrollment(password, totp) }
                .onSuccess { enrollment ->
                    mutableState.update { it.copy(busyAction = null, totpEnrollment = enrollment) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "动态验证注册启动失败，请稍后重试。")
                    }
                }
        }
    }

    fun confirmTotpEnrollment(code: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "totp-confirm", error = null, message = null) }
            runCatching { api.confirmTotpEnrollment(code) }
                .onSuccess { codes ->
                    mutableState.update {
                        it.copy(busyAction = null, recoveryCodes = codes, message = "动态验证已启用。")
                    }
                    refreshSecurityData()
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "动态验证码无效，请重试。")
                    }
                }
        }
    }

    fun regenerateRecoveryCodes(password: String, totp: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "recovery-codes", error = null, message = null) }
            runCatching { api.regenerateRecoveryCodes(password, totp) }
                .onSuccess { codes ->
                    mutableState.update {
                        it.copy(busyAction = null, recoveryCodes = codes, message = "恢复码已重置，旧恢复码全部失效。")
                    }
                    refreshSecurityData()
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "恢复码生成失败，请稍后重试。")
                    }
                }
        }
    }

    fun disableTotp(password: String, totp: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "totp-disable", error = null, message = null) }
            runCatching { api.disableTotp(password, totp) }
                .onSuccess { revoked ->
                    if (revoked) {
                        forceReauthentication("动态验证已关闭，所有会话已退出，请重新登录。")
                    } else {
                        mutableState.update { it.copy(busyAction = null, message = "动态验证已关闭。") }
                        refreshSecurityData()
                    }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "动态验证关闭失败，请稍后重试。")
                    }
                }
        }
    }

    fun clearTotpFlow() {
        mutableState.update { it.copy(totpEnrollment = null, recoveryCodes = emptyList()) }
    }

    fun refreshPasskeys() {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "passkey-list", error = null) }
            runCatching { api.passkeys() }
                .onSuccess { passkeys ->
                    mutableState.update { it.copy(busyAction = null, passkeys = passkeys) }
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "Passkey 列表读取失败，请稍后重试。")
                    }
                }
        }
    }

    fun registerPasskey(
        name: String,
        password: String,
        totp: String,
        requestCredential: suspend (String) -> String,
    ) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "passkey-register", error = null, message = null) }
            runCatching {
                val challenge = api.beginPasskeyRegistration(password, totp)
                val responseJson = requestCredential(challenge.optionsJson)
                api.completePasskeyRegistration(challenge.challengeId, responseJson, name)
            }
                .onSuccess {
                    mutableState.update { it.copy(busyAction = null, message = "Passkey 已成功绑定。") }
                    refreshPasskeysInternal()
                    refreshSecurityData()
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "Passkey 注册失败，请稍后重试。")
                    }
                }
        }
    }

    fun deletePasskey(id: String, password: String, totp: String) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "passkey-delete", error = null, message = null) }
            runCatching { api.deletePasskey(id, password, totp) }
                .onSuccess {
                    mutableState.update { it.copy(busyAction = null, message = "Passkey 已删除。") }
                    refreshPasskeysInternal()
                    refreshSecurityData()
                }
                .onFailure { error ->
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "Passkey 删除失败，请稍后重试。")
                    }
                }
        }
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

    private fun assistantInputs(state: AppUiState) = AssistantInputs(
        username = state.user?.username,
        locked = state.locked,
        timetable = state.campusTimetable,
        todos = state.todoSnapshot,
        incidents = state.incidents,
        alerts = state.alerts,
        resources = state.resourceExpiries,
        backup = state.backup,
        security = state.security,
        preferences = state.alertPreferences,
    )

    private suspend fun refreshAssistantSnapshot(inputs: AssistantInputs) {
        val username = inputs.username?.takeIf { !inputs.locked } ?: return
        val snapshot = buildPersonalAssistantSnapshot(
            timetable = inputs.timetable,
            todos = inputs.todos,
            incidents = inputs.incidents,
            alerts = inputs.alerts,
            resources = inputs.resources,
            backup = inputs.backup,
            security = inputs.security,
        )
        val guardianAlerts = buildGuardianAlerts(backup = inputs.backup, security = inputs.security)
            .filter { alert -> alert.type != "backup" || inputs.preferences.backupAlerts }
        val newGuardianAlerts = withContext(Dispatchers.IO) {
            val existingIds = personalStore.readAlerts().mapTo(mutableSetOf(), AppAlertRecord::id)
            personalStore.writeAssistantSnapshot(snapshot)
            personalStore.appendAlerts(guardianAlerts)
            DailyBriefScheduler.schedule(getApplication(), username)
            guardianAlerts.filterNot { it.id in existingIds }
        }
        newGuardianAlerts.forEach { alert ->
            withContext(Dispatchers.IO) { alertNotifier.notifyRecord(alert) }
        }
        val storedAlerts = withContext(Dispatchers.IO) { personalStore.readAlerts() }
        mutableState.update { current ->
            if (current.user?.username != username || current.locked) current else current.copy(
                assistantSnapshot = snapshot,
                alerts = mergeHydratedAlerts(storedAlerts, current.alerts),
            )
        }
        publishWidget()
    }

    private suspend fun publishWidget() {
        val current = mutableState.value
        withContext(Dispatchers.IO) {
            MyControlWidgetProvider.publish(
                context = getApplication(),
                overview = current.overview,
                activeIncidents = current.activeIncidents,
                iot = current.iot,
                assistant = current.assistantSnapshot,
                quickScene = current.quickScene,
            )
            CourseWidgetProvider.publish(getApplication(), current.campusTimetable)
        }
    }

    private fun evaluateAlerts() {
        if (!operationalAlertsReady(initialIncidentsLoaded, initialTasksLoaded)) return
        operationalEffectsJob?.cancel()
        operationalEffectsJob = viewModelScope.launch {
            delay(120)
            val current = mutableState.value
            val seedOnly = !alertsSeeded
            withContext(Dispatchers.IO) {
                alertNotifier.evaluate(current.incidents, current.tasks, seedOnly)
            }
            alertsSeeded = true
            reloadPersonalState()
        }
    }

    private fun startOperationalPolling() {
        if (!appInForeground || mutableState.value.user == null || mutableState.value.locked) return
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(90_000)
                val current = mutableState.value
                if (current.user == null || current.locked) continue
                if (current.refreshing) {
                    syncRemoteNotifications()
                    continue
                }
                runCatching {
                    val incidents = api.incidents()
                    val tasks = api.tasks().tasks
                    val refreshedAt = SystemClock.elapsedRealtime()
                    lastRefreshElapsedMs[DataSection.Incidents] = refreshedAt
                    lastRefreshElapsedMs[DataSection.Tasks] = refreshedAt
                    mutableState.update { it.copy(incidents = incidents, tasks = tasks) }
                    updateConnectivityState()
                    publishWidget()
                    evaluateAlerts()
                    syncRemoteNotifications()
                }
            }
        }
    }

    private fun stopOperationalPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    private fun runAction(
        action: String,
        successMessage: String,
        confirmation: (suspend () -> Boolean)? = null,
        block: suspend () -> Unit,
    ) {
        if (mutableState.value.busyAction != null) return
        if (mutableState.value.offlineMode) {
            mutableState.update { it.copy(error = "当前处于离线只读模式，联网后才能执行操作。") }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = action, error = null, message = null) }
            val confirmed = runCatching { confirmation?.invoke() ?: true }.getOrElse { error ->
                mutableState.update {
                    it.copy(busyAction = null, error = error.message ?: "设备身份验证失败。")
                }
                return@launch
            }
            if (!confirmed) {
                mutableState.update { it.copy(busyAction = null) }
                return@launch
            }
            runCatching { block() }
                .onSuccess { mutableState.update { it.copy(busyAction = null, message = successMessage) } }
                .onFailure { error ->
                    if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
                        val current = mutableState.value
                        mutableState.value = AppUiState(
                            booting = false,
                            error = error.message,
                            appLockEnabled = current.appLockEnabled,
                            androidPasskeySupported = current.androidPasskeySupported,
                            suggestedUsername = sessionStore.readLastUsername(),
                            homeQuickActionOrder = current.homeQuickActionOrder,
                            hiddenHomeQuickActions = current.hiddenHomeQuickActions,
                        )
                        MyControlWidgetProvider.clear(getApplication())
                        CourseWidgetProvider.clear(getApplication())
                    } else {
                        mutableState.update {
                            it.copy(busyAction = null, error = error.message ?: "操作失败，请稍后重试。")
                        }
                    }
                }
        }
    }

    private suspend fun refreshSecurityData() {
        runCatching { api.security() }.onSuccess { security ->
            mutableState.update { it.copy(security = security) }
        }
    }

    private suspend fun refreshPasskeysInternal() {
        runCatching { api.passkeys() }.onSuccess { passkeys ->
            mutableState.update { it.copy(passkeys = passkeys) }
        }
    }

    private fun forceReauthentication(message: String) {
        val current = mutableState.value
        stopOperationalPolling()
        cancelRefreshes()
        clearRefreshCache()
        clearAccountScopedState()
        sessionStore.clear()
        mutableState.value = AppUiState(
            booting = false,
            androidPasskeySupported = current.androidPasskeySupported,
            suggestedUsername = sessionStore.readLastUsername(),
            message = message,
            appLockEnabled = current.appLockEnabled,
            homeQuickActionOrder = current.homeQuickActionOrder,
            hiddenHomeQuickActions = current.hiddenHomeQuickActions,
        )
        MyControlWidgetProvider.clear(getApplication())
        CourseWidgetProvider.clear(getApplication())
    }

    private fun enqueueTodoMutation(mutation: TodoMutation) {
        viewModelScope.launch {
            val existing = withContext(Dispatchers.IO) { personalStore.readPendingTodoMutations() }
            val targetId = mutation.task?.id ?: mutation.id
            val compacted = existing.filterNot { queued ->
                val queuedId = queued.task?.id ?: queued.id
                targetId != null && queuedId == targetId
            } + mutation
            val snapshot = applyTodoMutations(mutableState.value.todoSnapshot, listOf(mutation))
            withContext(Dispatchers.IO) {
                personalStore.writeTodoSnapshot(snapshot)
                personalStore.writePendingTodoMutations(compacted)
            }
            mutableState.update {
                it.copy(
                    todoSnapshot = snapshot,
                    pendingTodoMutations = compacted.size,
                    message = "待办已保存，正在同步。",
                )
            }
            syncPendingTodos()
        }
    }

    private suspend fun syncPendingTodos() {
        val pending = withContext(Dispatchers.IO) { personalStore.readPendingTodoMutations() }
        if (pending.isEmpty()) return
        try {
            val current = mutableState.value.todoSnapshot
            val synced = try {
                api.mutateTodos(current.revision, pending)
            } catch (error: ApiException) {
                if (error.code != "TODO_REVISION_CONFLICT") throw error
                val latest = api.todos()
                api.mutateTodos(latest.revision, pending)
            }
            withContext(Dispatchers.IO) {
                personalStore.writePendingTodoMutations(emptyList())
                personalStore.writeTodoSnapshot(synced)
            }
            mutableState.update {
                it.copy(
                    todoSnapshot = synced,
                    pendingTodoMutations = 0,
                    offlineMode = false,
                    message = "待办已同步。",
                )
            }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            if (error is IOException || api.isOffline()) {
                mutableState.update {
                    it.copy(
                        pendingTodoMutations = pending.size,
                        offlineMode = true,
                        message = "已离线保存，联网后自动同步。",
                    )
                }
            } else {
                mutableState.update {
                    it.copy(
                        pendingTodoMutations = pending.size,
                        error = error.message ?: "待办暂未同步，请稍后重试。",
                    )
                }
            }
        }
    }

    private fun updateAlerts(transform: (List<AppAlertRecord>) -> List<AppAlertRecord>) {
        val alerts = transform(mutableState.value.alerts)
        mutableState.update { it.copy(alerts = alerts) }
        viewModelScope.launch(Dispatchers.IO) { personalStore.writeAlerts(alerts) }
    }

    private fun reloadPersonalState() {
        viewModelScope.launch {
            val (alerts, preferences) = withContext(Dispatchers.IO) {
                Pair(
                    personalStore.readAlerts(),
                    personalStore.readAlertPreferences(),
                )
            }
            mutableState.update { current ->
                current.copy(
                    alerts = mergeHydratedAlerts(alerts, current.alerts),
                    alertPreferences = preferences,
                )
            }
            syncRemoteNotifications()
        }
    }

    private fun syncRemoteNotifications(force: Boolean = false) = launchRefresh(DataSection.Notifications, force) {
        flushNotificationMutations(api, personalStore)
        val registrationError = if (!appDeviceRegistered) {
            runCatching { api.registerAppDevice(appInstallationId) }
                .onSuccess { appDeviceRegistered = true }
                .exceptionOrNull()
        } else {
            null
        }
        val (remoteItems, remotePreference) = supervisorScope {
            val notifications = async { api.allAppNotifications() }
            val preference = async { runCatching { api.appNotificationPreference() }.getOrNull() }
            notifications.await() to preference.await()
        }
        val currentAlerts = mutableState.value.alerts
        val currentById = currentAlerts.associateBy(AppAlertRecord::id)
        remoteItems.forEach { remote ->
            val local = currentById[remote.id] ?: return@forEach
            if (local.read && !remote.read) runCatching { api.markAppNotificationRead(remote.id) }
            val localSnooze = local.snoozedUntil
            if (localSnooze != null && localSnooze != remote.snoozedUntil) {
                runCatching { api.snoozeAppNotification(remote.id, localSnooze) }
            }
        }
        val merged = mergeRemoteAlerts(currentAlerts, remoteItems)
        val mergedPreference = remotePreference?.let { remote ->
            withContext(Dispatchers.IO) {
                personalStore.readAlertPreferences().copy(
                    quietHoursEnabled = remote.quietHoursEnabled,
                    quietStartHour = remote.quietStartHour.coerceIn(0, 23),
                    quietEndHour = remote.quietEndHour.coerceIn(0, 23),
                ).also(personalStore::writeAlertPreferences)
            }
        }
        withContext(Dispatchers.IO) { personalStore.writeAlerts(merged) }
        withContext(Dispatchers.IO) { alertNotifier.evaluateRemote(merged) }
        mutableState.update {
            it.copy(
                alerts = merged,
                alertPreferences = mergedPreference ?: it.alertPreferences,
            )
        }
        registrationError?.let { throw it }
    }

    private fun openNotificationDeepLink(deepLink: String): Boolean {
        val uri = runCatching { Uri.parse(deepLink) }.getOrNull() ?: return false
        if (uri.scheme == "https") {
            getApplication<Application>().startActivity(
                Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return true
        }
        if (uri.scheme != "mycontrol" || uri.host != "open") return false
        uri.getQueryParameter("destination")?.let { destination ->
            when (destination) {
                "today" -> openWorkspace(WorkspaceDestination.Today)
                "notifications" -> openWorkspace(WorkspaceDestination.Notifications)
                "scenes" -> {
                    uri.getQueryParameter(DeepLinks.EXTRA_SCENE_ID)
                        ?.takeIf(String::isNotBlank)
                        ?.let { id -> mutableState.update { it.copy(pendingSceneId = id) } }
                    openWorkspace(WorkspaceDestination.Scenes)
                }
                else -> return false
            }
            return true
        }
        uri.getQueryParameter("tab")?.let { tab ->
            val target = DeepLinks.parseTab(tab) ?: return false
            selectTab(target)
            return true
        }
        return false
    }

    private suspend fun evaluatePersonalReminders() {
        val current = mutableState.value
        withContext(Dispatchers.IO) { alertNotifier.evaluatePersonal(current.todoSnapshot, current.campusTimetable) }
        reloadPersonalState()
    }

    fun measureNetworkHealth() {
        if (mutableState.value.user == null) return
        viewModelScope.launch {
            mutableState.update { it.copy(networkHealth = it.networkHealth.copy(status = "measuring")) }
            mutableState.update { it.copy(networkHealth = withContext(Dispatchers.IO) { inspectNetworkHealth() }) }
        }
    }

    private suspend fun inspectNetworkHealth(): NetworkHealth {
        val checks = mutableListOf<NetworkCheckResult>()
        val baseUrl = runCatching { URL(BuildConfig.PLATFORM_BASE_URL) }.getOrNull()
        val host = baseUrl?.host.orEmpty()
        val dnsStart = System.nanoTime()
        val dnsResult = runCatching { InetAddress.getByName(host) }
        val dnsMs = (System.nanoTime() - dnsStart) / 1_000_000L
        checks += NetworkCheckResult(
            label = "DNS 解析",
            ok = dnsResult.isSuccess,
            detail = if (dnsResult.isSuccess) "$host · ${dnsMs}ms" else "无法解析 $host",
        )

        val apiStart = System.nanoTime()
        val apiResult = runCatching { api.authStatus() }
        val apiMs = (System.nanoTime() - apiStart) / 1_000_000L
        checks += NetworkCheckResult(
            label = "平台 API",
            ok = apiResult.isSuccess,
            detail = if (apiResult.isSuccess) "响应 ${apiMs}ms" else (apiResult.exceptionOrNull()?.message ?: "请求失败"),
        )

        val updateResult = checkHttpEndpoint(BuildConfig.APP_UPDATE_MANIFEST_URL)
        checks += NetworkCheckResult("更新源", updateResult.first, updateResult.second)
        val fallbackResult = checkHttpEndpoint(BuildConfig.APP_UPDATE_MANIFEST_FALLBACK_URL)
        checks += NetworkCheckResult("GitHub 备用源", fallbackResult.first, fallbackResult.second)

        val certificateDays = checkCertificateDays(baseUrl)
        checks += NetworkCheckResult(
            label = "HTTPS 证书",
            ok = certificateDays == null || certificateDays >= 14,
            detail = certificateDays?.let { "剩余约 ${it.coerceAtLeast(0)} 天" } ?: "未能读取证书有效期",
        )
        val apiOk = apiResult.isSuccess
        val dnsOk = dnsResult.isSuccess
        val hardFailure = !dnsOk || !apiOk
        val status = when {
            hardFailure -> "error"
            checks.any { !it.ok } -> "warning"
            apiMs < 150 -> "healthy"
            apiMs < 500 -> "warning"
            else -> "error"
        }
        val message = when (status) {
            "healthy" -> "手机到平台与更新源均可访问 · API ${apiMs}ms"
            "warning" -> checks.firstOrNull { !it.ok }?.let { "${it.label}需要关注：${it.detail}" }
                ?: "平台可访问，但响应偏慢 · API ${apiMs}ms"
            else -> checks.firstOrNull { !it.ok }?.let { "${it.label}失败：${it.detail}" } ?: "远程网关连接失败"
        }
        return NetworkHealth(
            latencyMs = apiMs,
            status = status,
            gatewayUrl = BuildConfig.PLATFORM_BASE_URL,
            checkedAtMillis = System.currentTimeMillis(),
            dnsOk = dnsOk,
            apiOk = apiOk,
            message = message,
            certificateDaysRemaining = certificateDays,
            checks = checks,
        )
    }

    private fun checkHttpEndpoint(rawUrl: String): Pair<Boolean, String> = runCatching {
        val connection = URL(rawUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        connection.requestMethod = "GET"
        connection.instanceFollowRedirects = true
        try {
            val code = connection.responseCode
            if (code in 200..399) true to "HTTP $code" else false to "HTTP $code"
        } finally {
            connection.disconnect()
        }
    }.getOrElse { false to (it.message ?: "请求失败") }

    private fun checkCertificateDays(url: URL?): Long? = runCatching {
        val connection = url?.openConnection() as? HttpsURLConnection ?: return null
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        try {
            connection.connect()
            val certificate = connection.serverCertificates.firstOrNull() as? X509Certificate ?: return null
            ChronoUnit.DAYS.between(java.time.Instant.now(), certificate.notAfter.toInstant())
        } finally {
            connection.disconnect()
        }
    }.getOrNull()

    fun updateCacheStorageInfo() {
        viewModelScope.launch(Dispatchers.IO) {
            val snapshotBytes = snapshotStore.sizeInBytes()
            val workspaceBytes = personalStore.sizeInBytes()
            val cacheDirBytes = directorySize(getApplication<Application>().cacheDir)
            val total = snapshotBytes + workspaceBytes + cacheDirBytes
            val formatted = formatBytes(total)
            mutableState.update {
                it.copy(
                    cacheStorageInfo = CacheStorageInfo(
                        snapshotSizeBytes = snapshotBytes,
                        workspaceSizeBytes = workspaceBytes,
                        cacheDirSizeBytes = cacheDirBytes,
                        totalFormatted = formatted,
                        lastCleanedAtMillis = it.cacheStorageInfo.lastCleanedAtMillis,
                    )
                )
            }
        }
    }

    fun openOfficialLibrarySeatReservation(onOpen: (PlatformWebSession) -> Unit) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    busyAction = "official-library-seat-reservation",
                    librarySeatError = null,
                    librarySeatMessage = null,
                )
            }
            try {
                val session = api.librarySeatOfficialWebSession()
                mutableState.update { it.copy(busyAction = null) }
                onOpen(session)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        librarySeatError = error.message ?: "学校官方座位预约入口打开失败，请稍后重试。",
                    )
                }
            }
        }
    }

    fun clearLocalCache() {
        viewModelScope.launch(Dispatchers.IO) {
            snapshotStore.clear()
            getApplication<Application>().cacheDir?.deleteRecursively()
            val snapshotBytes = snapshotStore.sizeInBytes()
            val workspaceBytes = personalStore.sizeInBytes()
            val cacheDirBytes = directorySize(getApplication<Application>().cacheDir)
            val total = snapshotBytes + workspaceBytes + cacheDirBytes
            mutableState.update {
                it.copy(
                    cacheStorageInfo = CacheStorageInfo(
                        snapshotSizeBytes = snapshotBytes,
                        workspaceSizeBytes = workspaceBytes,
                        cacheDirSizeBytes = cacheDirBytes,
                        totalFormatted = formatBytes(total),
                        lastCleanedAtMillis = System.currentTimeMillis(),
                    ),
                    message = "本地缓存已清理完毕",
                )
            }
        }
    }

    fun forceFullSync() {
        refreshCurrentTab(force = true)
        updateCacheStorageInfo()
        measureNetworkHealth()
    }

    fun createDesktopMagicLink(onResult: (String?, String?) -> Unit) {
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "desktop-magic-link", error = null) }
            runCatching {
                api.createWebLoginLink("/console")
            }.onSuccess { link ->
                mutableState.update { it.copy(busyAction = null, webLoginLink = link) }
                onResult(link.loginUrl, null)
            }.onFailure { error ->
                mutableState.update { it.copy(busyAction = null, error = error.message ?: "生成网页登录链接失败") }
                onResult(null, error.message ?: "生成网页登录链接失败")
            }
        }
    }

    fun updateNotificationPreferences(preferences: AlertPreferences) {
        viewModelScope.launch(Dispatchers.IO) {
            personalStore.writeAlertPreferences(preferences)
            DailyBriefScheduler.schedule(getApplication(), mutableState.value.user?.username)
            mutableState.update { it.copy(alertPreferences = preferences) }
            reloadPersonalState()
        }
    }

    fun checkAppUpdates() {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    busyAction = "check-updates",
                    error = null,
                    appUpdate = AppUpdateUiState(phase = AppUpdatePhase.Checking),
                )
            }
            runCatching {
                appUpdateManager.fetchLatest()
            }.onSuccess { update ->
                val phase = if (update.isNewerThan(BuildConfig.VERSION_CODE)) {
                    AppUpdatePhase.Available
                } else {
                    AppUpdatePhase.Current
                }
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        message = "版本检查完成",
                        appUpdate = AppUpdateUiState(phase = phase, info = update),
                    )
                }
            }.onFailure { error ->
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        appUpdate = AppUpdateUiState(
                            phase = AppUpdatePhase.Error,
                            error = error.message ?: "检查更新失败，请稍后重试",
                        ),
                    )
                }
            }
        }
    }

    fun downloadAndInstallAppUpdate() {
        val update = mutableState.value.appUpdate.info ?: return
        if (mutableState.value.busyAction != null) return
        if (BuildConfig.DEBUG) {
            mutableState.update {
                it.copy(
                    appUpdate = it.appUpdate.copy(
                        phase = AppUpdatePhase.Error,
                        error = DEBUG_RELEASE_UPDATE_MESSAGE,
                    ),
                )
            }
            return
        }
        viewModelScope.launch {
            mutableState.update {
                it.copy(
                    busyAction = "download-app-update",
                    appUpdate = it.appUpdate.copy(
                        phase = AppUpdatePhase.Downloading,
                        progress = 0,
                        error = null,
                    ),
                )
            }
            runCatching {
                appUpdateManager.download(update) { progress ->
                    mutableState.update { state ->
                        state.copy(appUpdate = state.appUpdate.copy(progress = progress))
                    }
                }
            }.onSuccess { apkFile ->
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        appUpdate = it.appUpdate.copy(
                            phase = AppUpdatePhase.ReadyToInstall,
                            progress = 100,
                            downloadedApkPath = apkFile.path,
                        ),
                    )
                }
                installDownloadedAppUpdate()
            }.onFailure { error ->
                val message = if (isAppUpdateSigningMismatch(error)) {
                    "当前安装版本与正式更新包的签名不一致，Android 不允许直接覆盖安装。请卸载当前版本后安装正式版。"
                } else {
                    error.message ?: "更新包下载或校验失败，请重试"
                }
                mutableState.update {
                    it.copy(
                        busyAction = null,
                        appUpdate = it.appUpdate.copy(phase = AppUpdatePhase.Error, error = message),
                    )
                }
            }
        }
    }

    fun installDownloadedAppUpdate() {
        val apkPath = mutableState.value.appUpdate.downloadedApkPath ?: return
        runCatching {
            appUpdateManager.install(java.io.File(apkPath))
        }.onSuccess { result ->
            mutableState.update {
                it.copy(
                    appUpdate = it.appUpdate.copy(
                        phase = when (result) {
                            AppInstallResult.Started -> AppUpdatePhase.Installing
                            AppInstallResult.PermissionRequired -> AppUpdatePhase.InstallPermissionRequired
                        },
                    ),
                )
            }
        }.onFailure { error ->
            mutableState.update {
                it.copy(
                    appUpdate = it.appUpdate.copy(
                        phase = AppUpdatePhase.Error,
                        error = error.message ?: "无法启动系统安装器",
                    ),
                )
            }
        }
    }

    fun openAppReleasesPage(url: String? = null) = appUpdateManager.openReleasesPage(url)

    private companion object {
        const val REFRESH_CACHE_WINDOW_MS = 30_000L
        const val DEBUG_RELEASE_UPDATE_MESSAGE =
            "当前安装的是 Debug 版本，不能直接更新为正式 Release 版本。请先卸载 Debug 版后安装正式版，或使用正式版设备测试。"
    }
}

private fun formatBytes(bytes: Long): String = when {
    bytes <= 0L -> "0 B"
    bytes < 1024L -> "$bytes B"
    bytes < 1024L * 1024L -> String.format(java.util.Locale.US, "%.1f KB", bytes.toDouble() / 1024.0)
    else -> String.format(java.util.Locale.US, "%.2f MB", bytes.toDouble() / (1024.0 * 1024.0))
}

private fun directorySize(directory: File?): Long = runCatching {
    directory?.walkTopDown()?.filter { it.isFile }?.sumOf { it.length() } ?: 0L
}.getOrDefault(0L)

private data class AssistantInputs(
    val username: String?,
    val locked: Boolean,
    val timetable: CampusTimetable?,
    val todos: TodoSnapshot,
    val incidents: List<IncidentInfo>,
    val alerts: List<AppAlertRecord>,
    val resources: List<ResourceExpiry>,
    val backup: BackupQuality?,
    val security: SecurityData?,
    val preferences: AlertPreferences,
)

internal fun operationalAlertsReady(incidentsLoaded: Boolean, tasksLoaded: Boolean): Boolean =
    incidentsLoaded && tasksLoaded

private fun applyTodoMutations(snapshot: TodoSnapshot, mutations: List<TodoMutation>): TodoSnapshot {
    val tasks = snapshot.tasks.associateBy(TodoTask::id).toMutableMap()
    mutations.forEach { mutation ->
        when (mutation.type) {
            "upsert" -> mutation.task?.let { tasks[it.id] = it }
            "delete" -> mutation.id?.let(tasks::remove)
        }
    }
    return snapshot.copy(tasks = tasks.values.sortedWith(compareBy<TodoTask> { it.completed }.thenBy { it.dueAt ?: Long.MAX_VALUE }))
}
