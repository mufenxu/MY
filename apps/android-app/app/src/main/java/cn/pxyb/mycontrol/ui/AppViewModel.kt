package cn.pxyb.mycontrol.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.DailyBriefScheduler
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.DeviceControlTileService
import cn.pxyb.mycontrol.assistant.buildGuardianAlerts
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.sharedTodoTitle
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AndroidCalendarSync
import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.AssistantActionItem
import cn.pxyb.mycontrol.data.AssistantChatTurn
import cn.pxyb.mycontrol.data.AssistantPreferences
import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.GoogleAccountStore
import cn.pxyb.mycontrol.data.HomePreferences
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.data.MediaDownloadPreferences
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.PlatformWebSession
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.TodoRepository
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.mergeHydratedAlerts
import cn.pxyb.mycontrol.data.newTodoTask
import cn.pxyb.mycontrol.ui.feature.account.AccountSecurityStateHolder
import cn.pxyb.mycontrol.ui.feature.account.toAccountManagementUiState
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantChatMessageUi
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantChatUiState
import cn.pxyb.mycontrol.ui.feature.auth.toEntryUiState
import cn.pxyb.mycontrol.ui.feature.auth.toQrLoginUiState
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataUiState
import cn.pxyb.mycontrol.ui.feature.campus.chaoxing.ChaoxingStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.reservation.ReservationStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.reservation.campusReservationRedirect
import cn.pxyb.mycontrol.ui.feature.campus.toFreeClassroomUiState
import cn.pxyb.mycontrol.ui.feature.campus.water.WaterValveStateHolder
import cn.pxyb.mycontrol.ui.feature.google.GoogleAccountsStateHolder
import cn.pxyb.mycontrol.ui.feature.google.toGoogleAccountDeskUiState
import cn.pxyb.mycontrol.ui.feature.media.MediaDownloadStateHolder
import cn.pxyb.mycontrol.ui.feature.news.toDailyNewsUiState
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationController
import cn.pxyb.mycontrol.ui.feature.notifications.toNotificationCenterUiState
import cn.pxyb.mycontrol.ui.feature.operations.toOperationsUiState
import cn.pxyb.mycontrol.ui.feature.overview.toOverviewUiState
import cn.pxyb.mycontrol.ui.feature.projects.GitHubProjectsStateHolder
import cn.pxyb.mycontrol.ui.feature.profile.CacheStorageInfo
import cn.pxyb.mycontrol.ui.feature.profile.NetworkDiagnostics
import cn.pxyb.mycontrol.ui.feature.profile.toProfileUiState
import cn.pxyb.mycontrol.ui.feature.projects.toProjectsUiState
import cn.pxyb.mycontrol.ui.feature.registry.RegistryImagesStateHolder
import cn.pxyb.mycontrol.ui.feature.releases.AndroidReleaseStateHolder
import cn.pxyb.mycontrol.ui.feature.scenes.ScenesController
import cn.pxyb.mycontrol.ui.feature.search.GlobalSearchItem
import cn.pxyb.mycontrol.ui.feature.search.SearchDestination
import cn.pxyb.mycontrol.ui.feature.search.toGlobalSearchUiState
import cn.pxyb.mycontrol.ui.feature.todos.TodoController
import cn.pxyb.mycontrol.ui.feature.tools.toToolsUiState
import cn.pxyb.mycontrol.ui.feature.updates.AppUpdateStateHolder
import cn.pxyb.mycontrol.ui.feature.workspace.toTodayUiState
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.SAVED_SELECTED_TAB
import cn.pxyb.mycontrol.ui.navigation.SAVED_WORKSPACE_DESTINATION
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.navigation.restoredMainTab
import cn.pxyb.mycontrol.ui.navigation.restoredWorkspaceDestination
import cn.pxyb.mycontrol.ui.state.SectionRefreshController
import cn.pxyb.mycontrol.ui.state.ActionStateHolder
import cn.pxyb.mycontrol.ui.state.handleFeatureRequestFailure
import cn.pxyb.mycontrol.update.AppUpdateManager
import cn.pxyb.mycontrol.widget.CourseWidgetProvider
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@OptIn(kotlinx.coroutines.FlowPreview::class)
enum class QrScanDestination { Login, Authenticator, WaterValve, Unsupported }

class AppViewModel(
    application: Application,
    private val savedStateHandle: SavedStateHandle,
) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val googleAccountStore = GoogleAccountStore(application)
    private val homePreferences = HomePreferences(application)
    private val assistantPreferences = AssistantPreferences(application)
    private val personalStore = PersonalWorkspaceStore(application)
    private val snapshotStore = ResponseSnapshotStore(application)
    private val api = PlatformApi(sessionStore, snapshotStore)
    private val networkDiagnostics = NetworkDiagnostics(api)
    private val alertNotifier by lazy { AlertNotifier(application) }
    private val androidCalendarSync = AndroidCalendarSync(application)
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = true,
            selectedTab = restoredMainTab(savedStateHandle[SAVED_SELECTED_TAB]) ?: MainTab.Overview,
            workspaceDestination = restoredWorkspaceDestination(savedStateHandle[SAVED_WORKSPACE_DESTINATION]),
            todoSnapshot = TodoSnapshot(),
            pendingTodoMutations = 0,
            alerts = emptyList(),
            alertPreferences = AlertPreferences(),
        ),
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()
    private val actions = ActionStateHolder(
        viewModelScope,
        api,
        ::forceReauthentication,
        canRun = { mutableState.value.canRunRequest() },
    ) { error, message ->
        mutableState.update { it.copy(error = error, message = message) }
    }
    private val accountSecurity: AccountSecurityStateHolder = AccountSecurityStateHolder(
        viewModelScope,
        api,
        actions,
        onSessionExpired = ::forceReauthentication,
        onRefresh = { refreshSecurity(force = true) },
        onMessage = { message -> mutableState.update { it.copy(message = message) } },
        onWebLoginLink = { link -> mutableState.update { it.copy(webLoginLink = link) } },
    )
    private val appUpdateManager = AppUpdateManager(application)
    private val appUpdates = AppUpdateStateHolder(viewModelScope, appUpdateManager) { message ->
        mutableState.update { it.copy(message = message, error = null) }
    }
    private val androidReleases = AndroidReleaseStateHolder(
        viewModelScope,
        api,
        appUpdateManager,
        appUpdates,
        ::forceReauthentication,
    )
    val androidReleaseState = androidReleases.state
    private val registryImages = RegistryImagesStateHolder(viewModelScope, api, ::forceReauthentication)
    val registryImagesState = registryImages.state
    val githubProjects = GitHubProjectsStateHolder(
        viewModelScope,
        api,
        canRequest = { mutableState.value.canRunRequest() },
        onError = { message -> mutableState.update { it.copy(error = message) } },
        onMessage = { message -> mutableState.update { it.copy(message = message) } },
        confirmationMutex = actions.confirmationMutex,
        onSessionExpired = ::forceReauthentication,
    )
    val githubProjectsState = githubProjects.state
    val todos = TodoController(viewModelScope, TodoRepository(application, api, sessionStore), mutableState, ::forceReauthentication)
    private val notifications: NotificationController by lazy {
        NotificationController(
            application, viewModelScope, api, sessionStore, personalStore, alertNotifier, mutableState, ::forceReauthentication,
        ) { syncRemoteNotifications() }
    }
    private val campusData = CampusDataStateHolder(viewModelScope, api, ::forceReauthentication)
    val entryState = deriveState(AppUiState::toEntryUiState)
    val overviewState = deriveState(campusData.state) { state, campus -> state.toOverviewUiState(campus) }
    val operationsState = deriveState(campusData.state) { state, campus -> state.toOperationsUiState(campus) }
    val toolsState = deriveState(AppUiState::toToolsUiState)
    val projectsState = deriveState(AppUiState::toProjectsUiState)
    val profileState = deriveState(AppUiState::toProfileUiState)
    val dailyNewsState = deriveState(AppUiState::toDailyNewsUiState)
    val accountManagementState = deriveState(accountSecurity.state) { state, securityFlow ->
        state.toAccountManagementUiState(securityFlow)
    }
    val googleAccounts = GoogleAccountsStateHolder(
        viewModelScope,
        api,
        googleAccountStore,
        sessionStore,
        appState = { mutableState.value },
        actions = actions,
        onError = { message -> mutableState.update { it.copy(error = message) } },
        onMessage = { message -> mutableState.update { it.copy(message = message) } },
        onSessionExpired = ::forceReauthentication,
    )
    val googleAccountDeskState = deriveState(googleAccounts.state) { state, accounts ->
        accounts.toGoogleAccountDeskUiState(state.actions.running.firstOrNull { it == "google-accounts" })
    }
    val qrLoginState = deriveState(AppUiState::toQrLoginUiState)
    val globalSearchState = deriveState(googleAccounts.state, campusData.state) { state, accounts, campus ->
        state.toGlobalSearchUiState(accounts.accounts, campus)
    }
    private val searchTargetMutable = MutableStateFlow<GlobalSearchItem?>(null)
    val searchTarget = searchTargetMutable.asStateFlow()
    private val assistantChatMutable = MutableStateFlow(AssistantChatUiState())
    val assistantChatState: StateFlow<AssistantChatUiState> = assistantChatMutable.asStateFlow()
    val todayState = deriveState(campusData.state) { state, campus -> state.toTodayUiState(campus) }
    val agenda = cn.pxyb.mycontrol.ui.feature.agenda.AgendaStateHolder(viewModelScope, api.campus, ::forceReauthentication)
    val study = cn.pxyb.mycontrol.ui.feature.study.StudyStateHolder(viewModelScope, application, { mutableState.value.user?.username }, ::forceReauthentication)
    val energy = cn.pxyb.mycontrol.ui.feature.campus.energy.EnergyStateHolder(viewModelScope, application, api.campus, { mutableState.value.user?.username }, ::forceReauthentication)
    val grades = cn.pxyb.mycontrol.ui.feature.campus.grades.GradesStateHolder(viewModelScope, application, { mutableState.value.user?.username }, ::forceReauthentication)
    val screenshot = cn.pxyb.mycontrol.ui.feature.todos.ScreenshotStateHolder(viewModelScope, application, { mutableState.value.user?.username }, ::forceReauthentication)
    val sharedImage = MutableStateFlow<android.net.Uri?>(null)
    fun acceptSharedImage(uri: android.net.Uri) { sharedImage.value = uri }
    fun consumeSharedImage() { sharedImage.value = null }

    private val waterValves = WaterValveStateHolder(
        viewModelScope,
        api,
        canRun = { mutableState.value.canRunRequest() },
        onSessionExpired = ::forceReauthentication,
    )
    val waterValveState = waterValves.state
    val freeClassroomState = deriveState(campusData.state) { state, campus -> state.toFreeClassroomUiState(campus) }
    val reservations = ReservationStateHolder(viewModelScope, api.campus, personalStore, ::forceReauthentication)
    val librarySeats = LibrarySeatStateHolder(viewModelScope, api.campus, ::forceReauthentication)
    val chaoxing = ChaoxingStateHolder(
        viewModelScope, api.campus.chaoxing,
        canRun = { mutableState.value.canRunRequest() },
        accountName = sessionStore::readActiveUsername,
        onSessionExpired = ::forceReauthentication,
    )
    val mediaDownload = MediaDownloadStateHolder(
        viewModelScope,
        MediaDownloadPreferences(application),
        api,
        account = { mutableState.value.user?.username ?: sessionStore.readActiveUsername() },
        onSessionExpired = ::forceReauthentication,
    )
    val mediaDownloadState = mediaDownload.state
    val notificationCenterState = deriveState(AppUiState::toNotificationCenterUiState)
    private val scenes = ScenesController(viewModelScope, api.iot, actions, mutableState, { refreshIot(force = true) }, ::publishWidget)
    val scenesState = scenes.state
    private var pendingQrLogin: Pair<String, String>? = null
    private var passwordLoginChallenge: cn.pxyb.mycontrol.data.LoginChallenge? = null
    private var pendingLoginResult: cn.pxyb.mycontrol.data.LoginResult? = null
    private var botChallengeToken = ""
    private var botChallengeExpiresAt = 0L
    private var pollJob: Job? = null
    private var deviceLoginJob: Job? = null
    private var loginCapabilitiesJob: Job? = null
    private val accountRequestScope = CoroutineScope(viewModelScope.coroutineContext + SupervisorJob(viewModelScope.coroutineContext[Job]))
    private var qrLoginJob: Job? = null

    private var appInForeground = false
    private var activeWorkspaceSection: WorkspaceDestination? = null
    private var networkRecoveryJob: Job? = null
    private val sectionRefresh = SectionRefreshController(viewModelScope, api, mutableState, ::forceReauthentication)
    private var alertsSeeded = false
    private var initialIncidentsLoaded = false
    private var initialTasksLoaded = false
    private var operationalEffectsJob: Job? = null

    private var featureAccountUsername: String? = null

    private fun <T> deriveState(transform: (AppUiState) -> T): StateFlow<T> = mutableState
        .map(transform)
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), transform(mutableState.value))

    /** 派生界面状态需要同时读两份领域状态时使用。 */
    private fun <A, B, T> deriveState(
        first: StateFlow<A>,
        second: StateFlow<B>,
        transform: (AppUiState, A, B) -> T,
    ): StateFlow<T> = combine(mutableState, first, second, transform)
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), transform(mutableState.value, first.value, second.value))

    /** 派生界面状态需要同时读领域状态时使用（领域状态已不在 [AppUiState] 里）。 */
    private fun <S, T> deriveState(source: StateFlow<S>, transform: (AppUiState, S) -> T): StateFlow<T> =
        combine(mutableState, source, transform)
            .distinctUntilChanged()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), transform(mutableState.value, source.value))

    init {
        viewModelScope.launch(Dispatchers.IO) {
            appUpdateManager.cleanupInstalledUpdates()
        }
        viewModelScope.launch {
            actions.state.collect { actions -> mutableState.update { it.copy(actions = actions) } }
        }
        viewModelScope.launch {
            appUpdates.state.collect { update -> mutableState.update { it.copy(appUpdate = update) } }
        }
        viewModelScope.launch {
            try {
                val autoUnlock = withContext(Dispatchers.IO) {
                    val hasSavedSession = sessionStore.hasSession()
                    val lockEnabled = sessionStore.isLockEnabled()
                    val savedHomePreferences = homePreferences.read()
                    val savedAssistantPreferences = assistantPreferences.read()
                    val username = sessionStore.readLastUsername()
                    api.setAccount(sessionStore.readActiveUsername())
                    if (!hasSavedSession) {
                        clearAllWidgets()
                    }
                    mutableState.update { current ->
                        current.copy(
                            booting = hasSavedSession && !lockEnabled,
                            locked = hasSavedSession && lockEnabled,
                            suggestedUsername = username,
                            appLockEnabled = lockEnabled,
                            homeQuickActionOrder = savedHomePreferences.order,
                            hiddenHomeQuickActions = savedHomePreferences.hidden,
                            assistantButtonVisible = savedAssistantPreferences.visible,
                        )
                    }
                    hasSavedSession && !lockEnabled
                }
                if (autoUnlock) unlockSession()
                refreshLoginCapabilities()
                notifyPendingCrash()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                mutableState.update { it.copy(booting = false, locked = true, error = "本地安全状态加载失败，请重新打开应用。") }
            }
        }
        viewModelScope.launch {
            combine(mutableState, campusData.state, ::assistantInputs)
                .distinctUntilChanged()
                .debounce(250)
                .collectLatest(::refreshAssistantSnapshot)
        }
        viewModelScope.launch {
            mutableState.map { current ->
                current.user?.username?.takeIf { !current.locked }?.let { username ->
                    username to Triple(current.alertPreferences.dailyBriefEnabled,
                        current.alertPreferences.morningBriefHour, current.alertPreferences.eveningBriefHour)
                }
            }.distinctUntilChanged().collectLatest { schedule ->
                if (schedule != null) withContext(Dispatchers.IO) {
                    DailyBriefScheduler.schedule(getApplication(), schedule.first)
                }
            }
        }
    }

    init {
        viewModelScope.launch {
            combine(mutableState, campusData.state) { current, campus ->
                current.user?.username?.takeIf { !current.locked }?.let { Triple(it, current.todoSnapshot, campus.timetable) }
            }.distinctUntilChanged().debounce(500).collectLatest { inputs ->
                if (inputs != null) withContext(Dispatchers.IO) {
                    try {
                        cn.pxyb.mycontrol.PersonalReminderScheduler.schedule(getApplication(), inputs.first, inputs.second, inputs.third)
                    } catch (error: Exception) {
                        if (error is kotlinx.coroutines.CancellationException) throw error
                        mutableState.update { it.copy(error = "本地提醒暂未排入计划，请重新打开工作台后重试。") }
                    }
                }
            }
        }
    }

    private suspend fun hydrateLocalState() {
        todos.load()
        withContext(Dispatchers.IO) {
            val alerts = personalStore.readAlerts()
            val alertPreferences = personalStore.readAlertPreferences()
            val assistantSnapshot = personalStore.readAssistantSnapshot()
            val quickScene = personalStore.readQuickScene()
            mutableState.update { current ->
                if (!current.booting && !current.locked && current.user == null) {
                    current
                } else {
                    current.copy(
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
                        error = "本地安全会话已失效，请重新登录。",
                    )
                }
                googleAccounts.reset()
                clearAllWidgets()
                return@launch
            }
            runCatching { api.withRequestMetadata { api.auth.authStatus() } }
                .onSuccess { response ->
                    val user = response.value
                    if (user == null) {
                        clearAccountScopedState()
                        mutableState.update {
                            it.copy(
                                booting = false,
                                locked = false,
                                user = null,
                                error = "登录会话已过期，请重新登录。",
                            )
                        }
                        googleAccounts.reset()
                        clearAllWidgets()
                    } else {
                        setAccountScope(user.username)
                        mutableState.update {
                            it.copy(
                                booting = false,
                                locked = false,
                                user = user,
                                offlineMode = response.fromCache,
                                cachedAtMillis = response.cachedAtMillis,
                            )
                        }
                        hydrateLocalState()
                        syncRemoteNotifications()
                        googleAccounts.loadGoogleAccounts()
                        startOperationalPolling()
                        refreshInitialData()
                        scanPendingQrLogin()
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    sessionStore.lock()
                    mutableState.update {
                        it.copy(
                            booting = false,
                            locked = sessionStore.isLockEnabled(),
                            user = null,
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
        clearAllWidgets()
    }

    fun login(
        username: String,
        password: String,
        factor: String,
        useRecoveryCode: Boolean,
        authorizeSession: suspend () -> Boolean,
    ) {
        if (mutableState.value.loginBusy) return
        val pending = passwordLoginChallenge
        if (pending == null && (username.isBlank() || password.isBlank())) {
            mutableState.update { it.copy(error = "请输入平台账号和密码。", message = null) }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val response = if (pending != null) {
                    api.auth.completeLogin(pending, factor, useRecoveryCode, currentDeviceName())
                } else {
                    api.auth.login(username, password, challengeToken = takeBotChallengeToken(), deviceName = currentDeviceName())
                }
                when (response) {
                    is cn.pxyb.mycontrol.data.LoginChallenge -> {
                        passwordLoginChallenge = response
                        mutableState.update {
                            it.copy(loginBusy = false, secondFactorRequired = true,
                                recoveryCodeAllowed = response.recoveryCodeAllowed, loginEnrollment = response.enrollment,
                                message = if (response.enrollment != null) "请先设置动态验证以保护账号。" else "账号密码已通过，请完成第二步验证。")
                        }
                    }
                    is cn.pxyb.mycontrol.data.LoginResult -> completeLogin(protectLogin(response, authorizeSession))
                }
            }.onFailure(::handleLoginFailure)
        }
    }

    fun loginWithPasskey(
        username: String,
        requestCredential: suspend (String) -> String,
        authorizeSession: suspend () -> Boolean,
    ) {
        if (mutableState.value.loginBusy) return
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val challenge = api.auth.beginPasskeyLogin(username, takeBotChallengeToken())
                val result = api.auth.completePasskeyLogin(
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
                val request = api.auth.createQrLoginRequest()
                mutableState.update {
                    it.copy(
                        deviceLoginQrDataUrl = request.qrDataUrl,
                    )
                }
                while (true) {
                    delay(2_000)
                    val status = api.auth.qrLoginRequestStatus(request.requestId, request.requesterVerifier)
                    when (status.status) {
                        "approved" -> {
                            val result = api.auth.consumeQrLoginRequest(request.requestId, request.requesterVerifier, currentDeviceName())
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
                // 刷新会启动新请求，旧轮询的清理不能覆盖新二维码。
                if (deviceLoginJob == coroutineContext[Job]) {
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
            if (sessionStore.isLockEnabled()) {
                sessionStore.prepareProtection()
                if (!authorizeSession()) throw IllegalStateException("未完成设备身份验证，登录会话未保存。")
            }
            api.auth.persistLogin(result)
            result
        } catch (error: Throwable) {
            api.auth.discardLogin(result)
            throw error
        }
    }

    fun resetSecondFactor() {
        passwordLoginChallenge = null
        botChallengeToken = ""
        mutableState.update {
            it.copy(
                loginBusy = false,
                secondFactorRequired = false,
                recoveryCodeAllowed = false,
                loginEnrollment = null,
                botChallengeRequired = false,
                botChallengeReady = false,
                error = null,
                message = null,
            )
        }
    }

    fun completeBotChallenge(token: String) {
        botChallengeToken = token
        botChallengeExpiresAt = System.currentTimeMillis() + 4 * 60_000
        mutableState.update { it.copy(botChallengeReady = token.isNotBlank(), error = null, message = "人机验证已完成，请继续登录。") }
    }

    private fun takeBotChallengeToken(): String {
        val token = botChallengeToken.takeIf { System.currentTimeMillis() < botChallengeExpiresAt }.orEmpty()
        botChallengeToken = ""
        mutableState.update { it.copy(botChallengeRequired = false, botChallengeReady = false) }
        return token
    }

    fun recoverAccount(token: String, newPassword: String) {
        if (mutableState.value.loginBusy) return
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching { api.auth.recoverAccount(token, newPassword) }
                .onSuccess { username ->
                    resetSecondFactor()
                    mutableState.update { it.copy(suggestedUsername = username, message = "账号已恢复。请使用新密码登录并重新设置登录保护。") }
                }.onFailure(::handleLoginFailure)
        }
    }

    fun acknowledgeLoginRecoveryCodes() {
        val result = pendingLoginResult ?: return
        pendingLoginResult = null
        completeLogin(result.copy(recoveryCodes = emptyList()))
    }

    fun lockSession() {
        if (!sessionStore.isLockEnabled()) return
        if (mutableState.value.user != null) {
            stopOperationalPolling()
            cancelRefreshes()
            cancelAccountRequests()
            googleAccounts.reset()
            // 上锁即结束五分钟免重复验证窗口，并清掉明文恢复码与 Passkey 缓存。
            accountSecurity.reset()
            todos.cancelPending()
            notifications.cancelPending()
            actions.cancelPending()
            appUpdates.cancelPending()
            androidReleases.cancelPending()
            reservations.cancelPending()
            librarySeats.cancelPending()
            clearRefreshCache()
            val hasSession = sessionStore.hasSession()
            sessionStore.lock()
            if (hasSession) {
                mutableState.update {
                    it.copy(
                        booting = false,
                        busyAction = null,
                        locked = true,
                        accountManagementOpen = false,
                        googleAccountDeskOpen = false,
                        globalSearchOpen = false,
                    )
                }
            } else {
                clearAccountScopedState()
                alertsSeeded = false
                initialIncidentsLoaded = false
                initialTasksLoaded = false
                alertNotifier.clear()
                clearRefreshCache()
                mutableState.update {
                    it.copy(
                        booting = false,
                        busyAction = null,
                        locked = false,
                        user = null,
                        error = "登录会话已过期，请重新登录。",
                    )
                }
                clearAllWidgets()
            }
        }
    }

    fun setAppInForeground(inForeground: Boolean) {
        appInForeground = inForeground
        if (!inForeground) {
            stopOperationalPolling()
            networkRecoveryJob?.cancel()
        } else if (mutableState.value.user != null && !mutableState.value.locked) {
            startOperationalPolling()
            refreshCurrentDestination(force = false)
        }
    }

    fun refreshLoginCapabilities() {
        if (loginCapabilitiesJob?.isActive == true) return
        mutableState.update { it.copy(loginCapabilitiesLoading = true, loginCapabilitiesError = null) }
        loginCapabilitiesJob = viewModelScope.launch {
            try {
                val capabilities = api.auth.loginCapabilities()
                mutableState.update {
                    it.copy(androidPasskeySupported = capabilities.androidPasskeySupported, loginCapabilitiesLoading = false)
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                mutableState.update {
                    it.copy(loginCapabilitiesLoading = false, loginCapabilitiesError = "暂时无法获取快捷登录方式，请检查网络后重试。")
                }
            }
        }
    }

    fun onNetworkAvailable() {
        if (!appInForeground) return
        if (mutableState.value.loginCapabilitiesError != null) refreshLoginCapabilities()
        if (mutableState.value.let { it.user == null || it.locked || it.busyAction == "logout" }) return
        todos.retryPending()
        syncRemoteNotifications(force = true)
        sectionRefresh.retryUnavailableSections()
        refreshCurrentDestination(force = false)
        networkRecoveryJob?.cancel()
        networkRecoveryJob = accountRequestScope.launch {
            // 联网事件可能落在旧请求结束前；等待其落盘后再补刷失败或缓存结果。
            sectionRefresh.awaitCurrentRefreshes()
            if (!appInForeground) return@launch
            sectionRefresh.retryUnavailableSections()
            refreshCurrentDestination(force = false)
        }
    }

    fun setAppLockEnabled(enabled: Boolean) {
        runCatching { sessionStore.setLockEnabled(enabled) }
            .onSuccess { mutableState.update { it.copy(appLockEnabled = enabled) } }
            .onFailure {
                mutableState.update { it.copy(error = "无法更新本地安全设置，请稍后重试。") }
            }
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
        passwordLoginChallenge = null
        botChallengeToken = ""
        if (result.recoveryCodes.isNotEmpty()) {
            pendingLoginResult = result
            mutableState.update { it.copy(loginBusy = false, loginEnrollment = null, loginRecoveryCodes = result.recoveryCodes, error = null) }
            return
        }
        setAccountScope(result.user.username)
        accountSecurity.reset()
        mutableState.update {
            it.copy(
                loginBusy = false,
                locked = false,
                user = result.user,
                suggestedUsername = result.user.username,
                secondFactorRequired = false,
                recoveryCodeAllowed = false,
                loginEnrollment = null,
                loginRecoveryCodes = emptyList(),
                botChallengeRequired = false,
                botChallengeReady = false,
                message = null,
                offlineMode = false,
                cachedAtMillis = null,
            )
        }
        googleAccounts.loadGoogleAccounts()
        alertsSeeded = false
        initialIncidentsLoaded = false
        initialTasksLoaded = false
        startOperationalPolling()
        refreshInitialData(force = true)
        scanPendingQrLogin()
        accountRequestScope.launch {
            hydrateLocalState()
            syncRemoteNotifications()
        }
    }

    private fun setAccountScope(username: String?) {
        if (featureAccountUsername != username) {
            cancelRefreshes()
            clearRefreshCache()
            cancelAccountRequests()
            assistantChatMutable.value = AssistantChatUiState()
            googleAccounts.reset()
            accountSecurity.reset()
            todos.cancelPending()
            notifications.cancelPending()
            actions.reset()
            appUpdates.reset()
            androidReleases.reset()
            reservations.reset()
            agenda.reset()
            study.reset()
            energy.reset()
            grades.reset()
            screenshot.reset()
            librarySeats.reset()
            waterValves.reset()
            chaoxing.reset()
            mediaDownload.reset()
            githubProjects.reset()
            featureAccountUsername = username
        }
        notifications.reset()
        googleAccountStore.setAccount(username)
        personalStore.setAccount(username)
        snapshotStore.setAccount(username)
        alertNotifier.setAccount(username)
        api.setAccount(username)
    }

    private fun clearAccountScopedState() {
        passwordLoginChallenge = null
        pendingLoginResult = null
        botChallengeToken = ""
        mutableState.update { it.copy(loginEnrollment = null, loginRecoveryCodes = emptyList()) }
        accountSecurity.reset()
        cancelAccountRequests()
        assistantChatMutable.value = AssistantChatUiState()
        pendingQrLogin = null
        clearRefreshCache()
        googleAccounts.reset()
        todos.cancelPending()
        notifications.cancelPending()
        actions.cancelPending()
        appUpdates.cancelPending()
        androidReleases.cancelPending()
        githubProjects.reset()
        alertNotifier.clear()
        sessionStore.withRequestSession(null) {
            personalStore.clearAccountData(preservePendingTodos = true)
            snapshotStore.clear()
            googleAccountStore.clear()
        }
        setAccountScope(null)
    }

    private fun cancelAccountRequests() {
        searchTargetMutable.value = null
        activeWorkspaceSection = null
        networkRecoveryJob?.cancel()
        networkRecoveryJob = null
        agenda.cancelPending()
        study.cancelPending()
        energy.cancelPending()
        grades.cancelPending()
        screenshot.cancelPending()
        accountRequestScope.coroutineContext.cancelChildren()
        qrLoginJob = null
        githubProjects.cancelPending()
        waterValves.cancelPending()
        chaoxing.cancelPending()
        mediaDownload.cancelPending()
        operationalEffectsJob?.cancel()
        operationalEffectsJob = null
        assistantChatMutable.update { it.copy(sending = false) }
        mutableState.update { it.copy(qrLoginBusy = false) }
    }

    private fun handleLoginFailure(error: Throwable) {
        val apiError = error as? ApiException
        if (apiError?.code == "LOGIN_CHALLENGE_INVALID") resetSecondFactor()
        val needsBotChallenge = apiError?.code == "BOT_CHALLENGE_REQUIRED" || apiError?.details?.optBoolean("challengeRequired") == true
        val message = when (apiError?.code) {
            "PASSKEY_REQUIRED" -> "该账号要求使用 Passkey，请使用下方 Passkey 登录。"
            "BOT_CHALLENGE_REQUIRED" -> "请完成下方人机验证后继续登录。"
            else -> error.message ?: "登录失败，请稍后重试。"
        }
        mutableState.update {
            it.copy(
                loginBusy = false,
                botChallengeRequired = needsBotChallenge && passwordLoginChallenge == null,
                botChallengeReady = false,
                error = message,
                message = null,
            )
        }
    }

    fun logout() {
        if (mutableState.value.busyAction == "logout") return
        mutableState.update { it.copy(busyAction = "logout", error = null) }
        cancelAccountRequests()
        assistantChatMutable.value = AssistantChatUiState()
        googleAccounts.cancelPending()
        todos.cancelPending()
        notifications.cancelPending()
            actions.cancelPending()
            appUpdates.cancelPending()
            androidReleases.cancelPending()
            reservations.cancelPending()
        librarySeats.cancelPending()
        viewModelScope.launch {
            stopOperationalPolling()
            cancelRefreshes()
            api.auth.logout {
                alertsSeeded = false
                initialIncidentsLoaded = false
                initialTasksLoaded = false
                clearAccountScopedState()
                mutableState.update {
                    AppUiState(
                        booting = false,
                        androidPasskeySupported = it.androidPasskeySupported,
                        loginCapabilitiesLoading = it.loginCapabilitiesLoading,
                        loginCapabilitiesError = it.loginCapabilitiesError,
                        suggestedUsername = sessionStore.readLastUsername(),
                        appLockEnabled = it.appLockEnabled,
                        homeQuickActionOrder = it.homeQuickActionOrder,
                        hiddenHomeQuickActions = it.hiddenHomeQuickActions,
                    )
                }
                clearAllWidgets()
            }
        }
    }

    fun selectTab(tab: MainTab) {
        syncNavigationDestination(tab)
    }

    fun syncNavigationDestination(
        tab: MainTab,
        accountManagementOpen: Boolean = false,
        googleAccountDeskOpen: Boolean = false,
        githubProjectsOpen: Boolean = false,
        globalSearchOpen: Boolean = false,
        assistantOpen: Boolean = false,
        workspaceDestination: WorkspaceDestination? = null,
        autoRefresh: Boolean = true,
    ) {
        val destinationChanged = mutableState.value.selectedTab != tab ||
            mutableState.value.accountManagementOpen != accountManagementOpen ||
            mutableState.value.googleAccountDeskOpen != googleAccountDeskOpen ||
            mutableState.value.githubProjectsOpen != githubProjectsOpen ||
            mutableState.value.globalSearchOpen != globalSearchOpen ||
            mutableState.value.assistantOpen != assistantOpen ||
            mutableState.value.workspaceDestination != workspaceDestination

        if (destinationChanged) activeWorkspaceSection = workspaceDestination

        mutableState.update { current ->
            if (!destinationChanged) {
                current
            } else {
                current.copy(
                    selectedTab = tab,
                    accountManagementOpen = accountManagementOpen,
                    googleAccountDeskOpen = googleAccountDeskOpen,
                    githubProjectsOpen = githubProjectsOpen,
                    globalSearchOpen = globalSearchOpen,
                    assistantOpen = assistantOpen,
                    workspaceDestination = workspaceDestination,
                    pendingLibrarySeatMyReservations = false,
                    pendingChaoxingOpen = false,
                )
            }
        }
        persistNavigationState()
        if (autoRefresh) {
            refreshDestination(
                tab = tab,
                accountManagementOpen = accountManagementOpen,
                googleAccountDeskOpen = googleAccountDeskOpen,
                githubProjectsOpen = githubProjectsOpen,
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
            if (uri.getQueryParameter(DeepLinks.EXTRA_DESTINATION) == "library-seat-reservation") {
                openLibrarySeatMyReservations()
                return
            }
            val workspace = parseWorkspaceDestination(uri.getQueryParameter(DeepLinks.EXTRA_DESTINATION))
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
        val resolvedTab = tab ?: mutableState.value.selectedTab
        mutableState.update {
            it.copy(
                selectedTab = resolvedTab,
                pendingTabNavigation = resolvedTab,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                githubProjectsOpen = false,
                globalSearchOpen = false,
                assistantOpen = false,
                workspaceDestination = null,
                error = null,
                message = null,
            )
        }
        persistNavigationState()
        refreshForTab(resolvedTab)
    }

    fun consumeTabNavigation(tab: MainTab) {
        mutableState.update { if (it.pendingTabNavigation == tab) it.copy(pendingTabNavigation = null) else it }
    }

    fun openLibrarySeatMyReservations() {
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Overview,
                pendingTabNavigation = null,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                githubProjectsOpen = false,
                globalSearchOpen = false,
                assistantOpen = false,
                workspaceDestination = null,
                pendingLibrarySeatMyReservations = true,
                error = null,
                message = null,
            )
        }
        librarySeats.loadLibrarySeatOverview()
        librarySeats.loadLibrarySeatReservations()
    }

    fun consumePendingLibrarySeatMyReservations() {
        mutableState.update {
            if (it.pendingLibrarySeatMyReservations) it.copy(pendingLibrarySeatMyReservations = false) else it
        }
    }

    fun openChaoxing() {
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Overview,
                pendingTabNavigation = null,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                githubProjectsOpen = false,
                globalSearchOpen = false,
                assistantOpen = false,
                workspaceDestination = null,
                pendingLibrarySeatMyReservations = false,
                pendingChaoxingOpen = true,
                error = null,
                message = null,
            )
        }
    }

    fun consumePendingChaoxingOpen() {
        mutableState.update {
            if (it.pendingChaoxingOpen) it.copy(pendingChaoxingOpen = false) else it
        }
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
        activeWorkspaceSection = destination
        mutableState.update {
            it.copy(
                selectedTab = when (destination) {
                    WorkspaceDestination.Scenes -> MainTab.Tools
                    WorkspaceDestination.Projects -> MainTab.Operations
                    else -> MainTab.Overview
                },
                pendingTabNavigation = null,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                githubProjectsOpen = false,
                globalSearchOpen = false,
                assistantOpen = false,
                workspaceDestination = destination,
                error = null,
                message = null,
            )
        }
        persistNavigationState()
        when (destination) {
            WorkspaceDestination.Today, WorkspaceDestination.Timetable,
            WorkspaceDestination.Campus, WorkspaceDestination.Todos -> refreshWorkspaceSection(destination)
            WorkspaceDestination.Notifications -> reloadPersonalState()
            WorkspaceDestination.Scenes -> refreshIot()
            WorkspaceDestination.Projects -> refreshCt8(true)
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
        refreshGlobalSearch(force = false)
    }

    fun closeGlobalSearch() {
        mutableState.update { it.copy(globalSearchOpen = false) }
    }

    fun setAssistantButtonVisible(visible: Boolean) {
        if (mutableState.value.assistantButtonVisible == visible) return
        assistantPreferences.write(assistantPreferences.read().copy(visible = visible))
        mutableState.update { it.copy(assistantButtonVisible = visible) }
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
    }

    fun sendAssistantMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || assistantChatMutable.value.sending) return
        val current = mutableState.value
        if (current.user == null || current.locked || current.busyAction == "logout") {
            assistantChatMutable.update { it.copy(error = "请先登录后再使用 AI 助手。") }
            return
        }
        val userTurn = AssistantChatMessageUi(role = "user", content = trimmed)
        val history = (assistantChatMutable.value.messages + userTurn).takeLast(12)
        assistantChatMutable.update { it.copy(messages = history, sending = true, error = null) }
        accountRequestScope.launch {
            try {
                val context = buildAssistantContext(current)
                val turns = history.map { AssistantChatTurn(role = it.role, content = it.content) }
                val reply = api.withRequestMetadata(allowCache = false) { api.assistantChat(turns, context) }.value
                assistantChatMutable.update { state ->
                    state.copy(
                        messages = state.messages + AssistantChatMessageUi(
                            role = "assistant",
                            content = reply.reply,
                            suggestions = reply.suggestions,
                            actions = reply.actions,
                        ),
                        error = null,
                    )
                }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                assistantChatMutable.update { it.copy(error = mapAssistantError(error)) }
            } finally {
                if (isActive) assistantChatMutable.update { it.copy(sending = false) }
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
        val courses = campusData.state.value.timetable?.courses.orEmpty()
        if (courses.isNotEmpty()) {
            put("timetable", courses.take(12).joinToString("；") { course ->
                "${course.dayName} ${course.timeRange} ${course.courseName} @ ${course.location}"
            })
        }
        val activeIncidents = state.activeIncidents
        if (activeIncidents.isNotEmpty()) {
            put("incidents", activeIncidents.take(6).joinToString("；") { "${it.severity} ${it.title}" })
        }
        val unreadAlerts = state.alerts.activeUnreadCount()
        put("unreadAlertCount", unreadAlerts)
        if (unreadAlerts > 0) {
            put(
                "recentAlerts",
                state.alerts.filter { !it.read && !it.isSnoozedAt() }.take(6).joinToString("；") { it.title },
            )
        }
        campusData.state.value.resourceExpiries.takeIf { it.isNotEmpty() }?.let { expiries ->
            put("resourceExpiries", expiries.take(6).joinToString("；") { "${it.type} ${it.name} 于 ${it.expiresAt} 到期" })
        }
        state.backup?.let { backup ->
            put("backupAgeHours", backup.ageHours?.toString() ?: "未知")
            put("backupRpoState", backup.rpoState)
            put("backupValidCount", backup.validBackups)
        }
    }

    fun openGlobalSearchResult(item: GlobalSearchItem) {
        searchTargetMutable.value = item
        mutableState.update { it.copy(globalSearchOpen = false) }
        when (item.destination) {
            SearchDestination.Overview -> openOperationalTarget(MainTab.Overview)
            SearchDestination.Operations -> openOperationalTarget(MainTab.Operations)
            SearchDestination.Notifications -> openWorkspace(WorkspaceDestination.Notifications)
            SearchDestination.Tools -> openOperationalTarget(MainTab.Tools)
            SearchDestination.GoogleAccounts -> openGoogleAccountDesk()
            SearchDestination.Today -> openWorkspace(WorkspaceDestination.Today)
            SearchDestination.Timetable -> openWorkspace(WorkspaceDestination.Timetable)
            SearchDestination.Todos -> openWorkspace(WorkspaceDestination.Todos)
            SearchDestination.Scenes -> openWorkspace(WorkspaceDestination.Scenes)
        }
    }

    fun consumeSearchTarget() {
        searchTargetMutable.value = null
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
        googleAccounts.loadGoogleAccounts()
    }

    fun closeGoogleAccountDesk() {
        mutableState.update { it.copy(googleAccountDeskOpen = false) }
    }
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

    fun scanQrCode(rawValue: String): QrScanDestination {
        if (mutableState.value.qrLoginBusy || mutableState.value.qrLoginTarget != null) {
            return QrScanDestination.Login
        }
        if (parseQrLoginUrl(rawValue) != null) {
            handleQrLoginUrl(rawValue)
            return QrScanDestination.Login
        }
        if (rawValue.trim().startsWith("otpauth://", ignoreCase = true)) {
            mutableState.update {
                it.copy(
                    qrLoginOpen = false,
                    pendingAuthenticatorUri = rawValue,
                    qrLoginBusy = false,
                    qrLoginTarget = null,
                    qrLoginError = null,
                )
            }
            return QrScanDestination.Authenticator
        }
        if (parseWaterValveSeqNo(rawValue) != null) {
            mutableState.update {
                it.copy(
                    qrLoginOpen = false,
                    qrLoginBusy = false,
                    qrLoginTarget = null,
                    qrLoginError = null,
                )
            }
            bindWaterValve(rawValue)
            return QrScanDestination.WaterValve
        }
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginTarget = null, qrLoginError = "未识别的二维码，请扫描网页登录、验证器或饮水机二维码。")
        }
        return QrScanDestination.Unsupported
    }

    fun consumePendingAuthenticatorUri() {
        mutableState.update { it.copy(pendingAuthenticatorUri = null) }
    }

    fun resetQrScanner() {
        qrLoginJob?.cancel()
        qrLoginJob = null
        pendingQrLogin = null
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun closeQrLogin() {
        qrLoginJob?.cancel()
        qrLoginJob = null
        pendingQrLogin = null
        mutableState.update {
            it.copy(qrLoginOpen = false, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun rejectQrLogin() {
        val target = mutableState.value.qrLoginTarget ?: return closeQrLogin()
        if (mutableState.value.let { it.qrLoginBusy || it.user == null || it.locked || it.busyAction == "logout" }) return
        qrLoginJob = accountRequestScope.launch {
            mutableState.update { it.copy(qrLoginBusy = true, qrLoginError = null) }
            try {
                api.withRequestMetadata(allowCache = false) { api.auth.rejectQrLogin(target.requestId) }
                mutableState.update {
                    it.copy(qrLoginOpen = false, qrLoginTarget = null, message = "已拒绝本次网页登录。")
                }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                mutableState.update { it.copy(qrLoginError = qrErrorMessage(error)) }
            } finally {
                if (isActive) mutableState.update { it.copy(qrLoginBusy = false) }
            }
        }
    }

    suspend fun createPlatformWebLoginUrl(redirectUrl: String): String {
        val link = api.auth.createWebLoginLink(redirectUrl)
        return link.loginUrl.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("服务端未返回自动登录链接。")
    }

    fun openCampusReservation(onOpen: (String) -> Unit) =
        actions.run("campus-reservation", failureMessage = "研讨间预约入口打开失败，请稍后重试。") {
            onOpen(createPlatformWebLoginUrl(campusReservationRedirect()))
        }

    fun openOfficialCampusReservation(onOpen: (PlatformWebSession) -> Unit) =
        actions.run("official-campus-reservation") {
            reservations.clearReservationFeedback()
            try {
                onOpen(api.campus.campusReservationOfficialWebSession())
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                reservations.showError(error.message ?: "学校官方预约入口打开失败，请稍后重试。")
                throw error
            }
        }

    suspend fun createExternalApplicationLaunch(applicationId: String): ExternalApplicationLaunch {
        val launch = api.launchExternalApplication(applicationId)
        if (launch.loginUrl.isBlank()) throw IllegalStateException("服务端未返回外部应用登录地址。")
        return launch
    }

    fun approveQrLogin(
        requestCredential: suspend (String) -> String,
    ) {
        val target = mutableState.value.qrLoginTarget ?: return
        if (mutableState.value.let { it.qrLoginBusy || it.user == null || it.locked || it.busyAction == "logout" } || target.status == "approved") return
        if (
            target.confirmationMethod != "passkey" || !mutableState.value.androidPasskeySupported
        ) {
            mutableState.update { it.copy(qrLoginError = "服务器尚未关联当前 Android App 的签名证书。") }
            return
        }
        qrLoginJob = accountRequestScope.launch {
            mutableState.update { it.copy(qrLoginBusy = true, qrLoginError = null) }
            try {
                val approved = api.withRequestMetadata(allowCache = false) {
                    val challenge = api.auth.beginQrPasskey(target.requestId)
                    api.auth.approveQrWithPasskey(
                        target.requestId,
                        challenge,
                        requestCredential(challenge.optionsJson),
                    )
                }.value
                mutableState.update {
                    it.copy(qrLoginTarget = approved, message = "网页登录已安全批准。")
                }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                mutableState.update { it.copy(qrLoginError = qrErrorMessage(error)) }
            } finally {
                if (isActive) mutableState.update { it.copy(qrLoginBusy = false) }
            }
        }
    }

    private fun scanPendingQrLogin() {
        val pending = pendingQrLogin ?: return
        if (mutableState.value.let { it.user == null || it.locked || it.qrLoginBusy || it.busyAction == "logout" }) return
        qrLoginJob = accountRequestScope.launch {
            mutableState.update {
                it.copy(qrLoginOpen = true, qrLoginBusy = true, qrLoginTarget = null, qrLoginError = null)
            }
            try {
                val target = api.withRequestMetadata(allowCache = false) { api.auth.scanQrLogin(pending.first, pending.second) }.value
                pendingQrLogin = null
                mutableState.update { it.copy(qrLoginTarget = target) }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                pendingQrLogin = null
                mutableState.update { it.copy(qrLoginError = qrErrorMessage(error)) }
            } finally {
                if (isActive) mutableState.update { it.copy(qrLoginBusy = false) }
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

    private fun parseWaterValveSeqNo(rawCode: String): String? {
        val value = rawCode.trim()
        if (value.isEmpty()) return null
        if (value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)) {
            return runCatching {
                val uri = Uri.parse(value)
                val hashQuery = uri.fragment.orEmpty().substringAfter('?', "")
                val fragmentUri = Uri.parse("https://local.invalid/?$hashQuery")
                uri.getQueryParameter("sn") ?: fragmentUri.getQueryParameter("sn")
            }.getOrNull()?.takeIf { it.length == 12 }
        }
        if (value.matches(Regex("^[A-Za-z0-9]{12}$"))) return value
        val parts = value.split("_")
        return parts.getOrNull(2)?.takeIf { it.length == 12 }
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
            githubProjectsOpen = current.githubProjectsOpen,
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
        githubProjectsOpen: Boolean = false,
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
            workspaceDestination in setOf(WorkspaceDestination.Today, WorkspaceDestination.Timetable, WorkspaceDestination.Campus, WorkspaceDestination.Todos) ->
                refreshWorkspaceSection(activeWorkspaceSection ?: workspaceDestination!!, force)
            workspaceDestination == WorkspaceDestination.Scenes -> refreshIot(force)
            workspaceDestination == WorkspaceDestination.Projects -> refreshCt8(force)
            workspaceDestination == WorkspaceDestination.Notifications -> {
                refreshIncidents(force)
                syncRemoteNotifications(force)
                reloadPersonalState()
            }
            googleAccountDeskOpen -> {
                googleAccounts.loadGoogleAccounts(force)
            }
            githubProjectsOpen -> {
                githubProjects.refresh()
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
        refreshCampusTimetable(force)
    }

    fun refreshGlobalSearch(force: Boolean = false) {
        refreshOverview(force)
        refreshExternalApplications(force)
        refreshIncidents(force)
        refreshTasks(force)
        refreshTodos(force)
        refreshCampusTimetable(force)
        refreshResourceExpiries(force)
        refreshIot(force)
        syncRemoteNotifications(force)
        googleAccounts.loadGoogleAccounts(force)
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
            }
            MainTab.Profile -> {
                refreshSecurity(force)
                updateCacheStorageInfo()
                measureNetworkHealth()
            }
        }
    }

    private fun refreshOverview(force: Boolean) = launchRefresh(DataSection.Overview, force, preloadCache = {
        val overview = api.overview()
        mutableState.update { it.copy(overview = overview) }
    }) {
        val overview = api.overview(force)
        mutableState.update { it.copy(overview = overview) }
        publishWidget()
    }

    private fun refreshExternalApplications(force: Boolean = false) =
        launchRefresh(DataSection.ExternalApplications, force, preloadCache = {
            val applications = api.externalApplications()
            mutableState.update { it.copy(externalApplications = applications) }
        }) {
            mutableState.update { it.copy(externalApplications = api.externalApplications()) }
        }

    private fun refreshIncidents(force: Boolean = false) = launchRefresh(DataSection.Incidents, force, preloadCache = {
        val incidents = api.incidents()
        mutableState.update { it.copy(incidents = incidents) }
    }) {
        val incidents = api.incidents()
        mutableState.update { it.copy(incidents = incidents) }
        initialIncidentsLoaded = true
        publishWidget()
        evaluateAlerts()
    }

    private fun refreshTasks(force: Boolean = false) = launchRefresh(DataSection.Tasks, force, preloadCache = {
        val tasks = api.tasks().tasks
        mutableState.update { it.copy(tasks = tasks) }
    }) {
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

    fun refreshDailyNews(force: Boolean = false) = launchRefresh(DataSection.DailyNews, force) {
        val dailyNews = api.dailyNews()
        mutableState.update { it.copy(dailyNews = dailyNews) }
    }

    private fun refreshIot(force: Boolean = false) = launchRefresh(DataSection.Iot, force, preloadCache = {
        val iot = api.iot.dashboard()
        mutableState.update { it.copy(iot = iot) }
    }) {
        val iot = api.iot.dashboard { devices ->
            mutableState.update { current ->
                current.copy(iot = devices.copy(
                    scenes = current.iot?.scenes.orEmpty(), rules = current.iot?.rules.orEmpty(),
                    runs = current.iot?.runs.orEmpty(), insights = current.iot?.insights.orEmpty(),
                ))
            }
        }
        mutableState.update { it.copy(iot = iot.copy(insights = it.iot?.insights.orEmpty())) }
        publishWidget()
        val current = mutableState.value
        if (current.workspaceDestination != WorkspaceDestination.Scenes && current.selectedTab in setOf(MainTab.Tools, MainTab.Operations)) {
            launchRefresh(DataSection.IotInsights, force, publishError = false) {
                val insights = api.iot.deviceInsights(iot.devices)
                mutableState.update { it.copy(iot = it.iot?.copy(insights = insights)) }
            }
        }
    }

    fun selectWorkspaceSection(destination: WorkspaceDestination) {
        activeWorkspaceSection = destination
        refreshWorkspaceSection(destination)
    }

    fun refreshWorkspaceSection(destination: WorkspaceDestination, force: Boolean = false) {
        when (destination) {
            WorkspaceDestination.Timetable -> refreshCampusTimetable(force)
            WorkspaceDestination.Todos -> refreshTodos(force)
            WorkspaceDestination.Campus -> refreshCampusOverview(force)
            WorkspaceDestination.Today -> refreshToday(force)
            else -> Unit
        }
    }

    private fun refreshToday(force: Boolean = false) {
        refreshTodos(force)
        refreshCampusTimetable(force)
        refreshResourceExpiries(force)
    }

    private fun refreshTodos(force: Boolean = false) = launchRefresh(DataSection.Todos, force) {
        todos.refresh()
        evaluatePersonalReminders()
    }

    private fun refreshCampusTimetable(force: Boolean = false) = launchRefresh(DataSection.Campus, force, preloadCache = {
        campusData.reloadTimetable()
    }) {
        campusData.reloadTimetable()
        publishWidget()
        evaluatePersonalReminders()
    }

    fun refreshCampusGpa(force: Boolean = false) = launchRefresh(DataSection.CampusGpa, force) {
        campusData.reloadGpa()
    }

    private fun refreshCampusOverview(force: Boolean = false) {
        refreshCampusGpa(force)
        launchRefresh(DataSection.CampusFreeClassrooms, force) {
            campusData.reloadFreeClassrooms()
        }
        launchRefresh(DataSection.CampusLife, force) {
            campusData.reloadCampusLife()
        }
        launchRefresh(DataSection.CampusEnergy, force) {
            campusData.reloadCampusEnergy()
        }
    }

    fun refreshWaterValve(force: Boolean = false) = waterValves.refreshWaterValve(force)

    fun refreshWaterBill(month: String, force: Boolean = false) = waterValves.refreshWaterBill(month, force)

    fun bindWaterValve(rawCode: String) = waterValves.bindWaterValve(rawCode)

    fun openWaterValve(seqNo: String) = waterValves.openWaterValve(seqNo)

    fun closeWaterValve(seqNo: String) = waterValves.closeWaterValve(seqNo)

    fun unbindWaterValve(seqNo: String) = waterValves.unbindWaterValve(seqNo)

    fun reorderWaterValves(seqNos: List<String>) = waterValves.reorderWaterValves(seqNos)

    fun clearWaterValveFeedback() = waterValves.clearWaterValveFeedback()

    fun queryFreeClassrooms(dayplus: Int, sections: List<Int>, building: String) =
        launchRefresh(DataSection.FreeClassrooms, force = true, publishError = false) {
            campusData.queryFreeClassrooms(dayplus, sections, building)
        }

    private fun refreshResourceExpiries(force: Boolean = false) = launchRefresh(DataSection.Resources, force, preloadCache = {
        campusData.reloadResourceExpiries()
    }) {
        campusData.reloadResourceExpiries()
        withContext(Dispatchers.IO) { alertNotifier.evaluateResourceExpiries(campusData.state.value.resourceExpiries) }
        reloadPersonalState()
    }

    private fun refreshCt8(force: Boolean = false) = launchRefresh(DataSection.Ct8, force) {
        val ct8 = api.ct8()
        mutableState.update { it.copy(ct8 = ct8) }
    }

    private fun refreshSecurity(force: Boolean = false) = launchRefresh(DataSection.Security, force) {
        val security = api.auth.security()
        mutableState.update { it.copy(security = security) }
        accountSecurity.loadPasskeys()
    }

    private fun launchRefresh(
        section: DataSection,
        force: Boolean = false,
        publishError: Boolean = force,
        preloadCache: (suspend () -> Unit)? = null,
        block: suspend () -> Unit,
    ) = sectionRefresh.launchRefresh(section, force, publishError, preloadCache, block)

    private fun cancelRefreshes() = sectionRefresh.cancelRefreshes()

    private fun clearRefreshCache() = sectionRefresh.clearRefreshCache()

    fun saveTodo(task: TodoTask) = todos.save(task)

    fun toggleTodo(id: String) = todos.toggle(id)

    fun deleteTodo(id: String) {
        val username = mutableState.value.user?.username ?: return
        todos.delete(id) {
            cn.pxyb.mycontrol.ui.feature.todos.TodoSourceStore(getApplication(), username).remove(id)
        }
    }

    fun syncAndroidCalendar() = actions.run("calendar-sync", failureMessage = "日历同步失败，请稍后重试。") {
        val current = mutableState.value
        val rooms = api.campus.campusMyReservations()
        val seats = api.campus.librarySeatReservations()
        val result = withContext(Dispatchers.IO) {
            androidCalendarSync.sync(
                accountUsername = current.user?.username ?: sessionStore.readActiveUsername(),
                timetable = campusData.state.value.timetable,
                todos = current.todoSnapshot,
                resources = campusData.state.value.resourceExpiries,
                rooms = rooms,
                seats = seats,
            )
        }
        mutableState.update { it.copy(message = result.message()) }
    }

    fun reportCalendarPermissionDenied() {
        mutableState.update { it.copy(error = "需要日历读写权限才能同步课程、待办和到期提醒。", message = null) }
    }

    fun markAlertRead(id: String) = notifications.markRead(id)

    fun markAlertUnread(id: String) = notifications.restoreUnread(id)

    fun markAllAlertsRead() = notifications.markAllRead()

    fun clearReadAlerts() = notifications.clearRead()

    fun archiveAlert(id: String) = notifications.archive(id)

    fun snoozeAlert(id: String, durationMillis: Long = 60 * 60_000L) = notifications.snooze(id, durationMillis)

    fun updateAlertPreferences(preferences: AlertPreferences) = notifications.updateAlertPreferences(preferences)

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

    fun saveIotScene(id: String?, name: String, actions: List<IotSceneAction>) =
        scenes.saveIotScene(id, name, actions)

    fun deleteIotScene(id: String, confirmation: suspend () -> Boolean) = scenes.deleteIotScene(id, confirmation)

    fun saveIotRule(
        id: String?,
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
        confirmation: suspend () -> Boolean,
    ) = scenes.saveIotRule(id, name, enabled, condition, actions, cooldownSeconds, confirmation)

    fun setIotRuleEnabled(id: String, enabled: Boolean, confirmation: suspend () -> Boolean) =
        scenes.setIotRuleEnabled(id, enabled, confirmation)

    fun deleteIotRule(id: String, confirmation: suspend () -> Boolean) = scenes.deleteIotRule(id, confirmation)

    fun runDiagnostics() = runAction("diagnostics", "所有者一键巡检已完成。") {
        val diagnostics = api.runDiagnostics()
        val current = mutableState.value
        val overview = runCatching { api.overview(force = true) }.getOrDefault(current.overview)
        val incidents = runCatching { api.incidents() }.getOrDefault(current.incidents)
        val backup = runCatching { api.backupQuality() }.getOrDefault(current.backup)
        val iot = runCatching { api.iot.dashboard() }.getOrDefault(current.iot)
        val resources = runCatching { api.resourceExpiries() }.getOrDefault(campusData.state.value.resourceExpiries)
        campusData.setResourceExpiries(resources)
        mutableState.update {
            it.copy(
                diagnostics = diagnostics,
                overview = overview,
                incidents = incidents,
                backup = backup,
                iot = iot,
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

    fun runIotScene(id: String, confirmation: suspend () -> Boolean) = scenes.runIotScene(id, confirmation)

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
        api.iot.controlIotRelay(deviceId, relayId, enabled)
        mutableState.update { it.copy(iot = api.iot.dashboard()) }
        publishWidget()
    }

    fun revokeSession(nonce: String, confirmation: suspend () -> Boolean) = accountSecurity.revokeSession(nonce, confirmation)
    fun revokeOtherSessions(confirmation: suspend () -> Boolean) = accountSecurity.revokeOtherSessions(confirmation)
    fun reauthenticateWithPasskey(requestCredential: suspend (String) -> String) = accountSecurity.reauthenticateWithPasskey(requestCredential)

    fun changePassword(oldPassword: String, newPassword: String, totp: String) =
        accountSecurity.changePassword(oldPassword, newPassword, totp)

    fun beginTotpEnrollment(password: String, totp: String) = accountSecurity.beginTotpEnrollment(password, totp)

    fun confirmTotpEnrollment(code: String) = accountSecurity.confirmTotpEnrollment(code)

    fun regenerateRecoveryCodes(password: String, totp: String) = accountSecurity.regenerateRecoveryCodes(password, totp)

    fun disableTotp(password: String, totp: String) = accountSecurity.disableTotp(password, totp)

    fun clearTotpFlow() = accountSecurity.clearTotpFlow()

    fun refreshPasskeys() = accountSecurity.refreshPasskeys()

    fun registerPasskey(name: String, password: String, totp: String, requestCredential: suspend (String) -> String) =
        accountSecurity.registerPasskey(name, password, totp, requestCredential)

    fun deletePasskey(id: String, password: String, totp: String) = accountSecurity.deletePasskey(id, password, totp)

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

    fun clearFeedback(displayedError: String?, displayedMessage: String?) {
        mutableState.update {
            it.copy(
                error = it.error.takeUnless { error -> error == displayedError },
                message = it.message.takeUnless { message -> message == displayedMessage },
            )
        }
    }

    private fun assistantInputs(state: AppUiState, campus: CampusDataUiState) = AssistantInputs(
        username = state.user?.username,
        locked = state.locked,
        timetable = campus.timetable,
        todos = state.todoSnapshot,
        incidents = state.incidents,
        alerts = state.alerts,
        resources = campus.resourceExpiries,
        backup = state.backup,
        security = state.security,
        preferences = state.alertPreferences,
    )

    private suspend fun refreshAssistantSnapshot(inputs: AssistantInputs) {
        val username = inputs.username?.takeIf { !inputs.locked } ?: return
        val session = withContext(Dispatchers.IO) { sessionStore.captureRequestSession() }
        if (session.username != username) return
        val (snapshot, guardianAlerts) = withContext(Dispatchers.Default) {
            buildPersonalAssistantSnapshot(
                timetable = inputs.timetable,
                todos = inputs.todos,
                incidents = inputs.incidents,
                alerts = inputs.alerts,
                resources = inputs.resources,
                backup = inputs.backup,
                security = inputs.security,
            ) to buildGuardianAlerts(backup = inputs.backup, security = inputs.security)
                .filter { alert -> alert.type != "backup" || inputs.preferences.backupAlerts }
        }
        val previous = mutableState.value.assistantSnapshot
        val snapshotChanged = previous == null || snapshot.copy(generatedAtMillis = previous.generatedAtMillis) != previous
        // 同一分钟内内容未变时复用快照，跨分钟仍更新时间以保留日报的新鲜度判断。
        val saveSnapshot = snapshotChanged || previous!!.generatedAtMillis / 60_000 != snapshot.generatedAtMillis / 60_000
        val (newGuardianAlerts, storedAlerts) = withContext(Dispatchers.IO) {
            sessionStore.withRequestSession(session) {
                val existingAlerts = personalStore.readAlerts()
                val existingById = existingAlerts.associateBy(AppAlertRecord::id)
                val changedAlerts = guardianAlerts.mapNotNull { alert ->
                    val existing = existingById[alert.id]
                    // 已有提醒保留创建时间、已读和稍后提醒状态，避免反复生成新状态。
                    val updated = existing?.copy(title = alert.title, body = alert.body, priority = alert.priority) ?: alert
                    updated.takeIf { it != existing }
                }
                if (saveSnapshot) personalStore.writeAssistantSnapshot(snapshot)
                val alerts = if (changedAlerts.isEmpty()) existingAlerts else {
                    personalStore.appendAlerts(changedAlerts)
                    personalStore.readAlerts()
                }
                guardianAlerts.filterNot { it.id in existingById } to alerts
            }
        }
        newGuardianAlerts.forEach { alert ->
            withContext(Dispatchers.IO) { sessionStore.withRequestSession(session) { alertNotifier.notifyRecord(alert) } }
        }
        mutableState.update { current ->
            if (current.user?.username != username || current.locked) current else current.copy(
                assistantSnapshot = if (saveSnapshot) snapshot else previous,
                alerts = mergeHydratedAlerts(storedAlerts, current.alerts),
            )
        }
        if (snapshotChanged) publishWidget()
    }

    /** 上次运行异常退出时只提示一次，并指引到「我的 → 诊断日志」导出。 */
    private suspend fun notifyPendingCrash() {
        val application = getApplication<Application>()
        val pending = runCatching {
            withContext(Dispatchers.IO) { cn.pxyb.mycontrol.data.CrashReporter.hasUnnotified(application) }
        }.getOrDefault(false)
        if (!pending) return
        mutableState.update {
            it.copy(message = "上次运行异常退出，可在「我的 → 诊断日志」导出记录反馈。")
        }
        runCatching {
            withContext(Dispatchers.IO) { cn.pxyb.mycontrol.data.CrashReporter.markNotified(application) }
        }
    }

    /** 账号态失效时两个桌面小组件必须成对清空，避免残留上一账号的数据。 */
    private fun clearAllWidgets() {
        MyControlWidgetProvider.clear(getApplication())
        CourseWidgetProvider.clear(getApplication())
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
            CourseWidgetProvider.publish(getApplication(), campusData.state.value.timetable)
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
                refreshIncidents()
                refreshTasks()
                todos.retryPending()
                syncRemoteNotifications()
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
    ) = actions.run(action, successMessage, confirmation, block = block)

    private fun forceReauthentication(message: String) {
        val current = mutableState.value
        // 评审数据没有真实会话：保留页面的错误/空态，供离线视觉比较。
        stopOperationalPolling()
        cancelRefreshes()
        clearRefreshCache()
        clearAccountScopedState()
        sessionStore.clear()
        mutableState.value = AppUiState(
            booting = false,
            androidPasskeySupported = current.androidPasskeySupported,
            loginCapabilitiesLoading = current.loginCapabilitiesLoading,
            loginCapabilitiesError = current.loginCapabilitiesError,
            suggestedUsername = sessionStore.readLastUsername(),
            message = message,
            appLockEnabled = current.appLockEnabled,
            homeQuickActionOrder = current.homeQuickActionOrder,
            hiddenHomeQuickActions = current.hiddenHomeQuickActions,
        )
        clearAllWidgets()
    }

    private fun reloadPersonalState() = notifications.reloadLocal()

    private fun syncRemoteNotifications(force: Boolean = false) = launchRefresh(DataSection.Notifications, force) {
        notifications.sync()
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
            if (destination == "library-seat-reservation") {
                openLibrarySeatMyReservations()
                return true
            }
            if (destination == "chaoxing") {
                openChaoxing()
                return true
            }
            parseWorkspaceDestination(destination)?.let { workspace ->
                if (workspace == WorkspaceDestination.Scenes) {
                    uri.getQueryParameter(DeepLinks.EXTRA_SCENE_ID)
                        ?.takeIf(String::isNotBlank)
                        ?.let { id -> mutableState.update { it.copy(pendingSceneId = id) } }
                }
                openWorkspace(workspace)
                return true
            }
            return false
        }
        uri.getQueryParameter("tab")?.let { tab ->
            val target = DeepLinks.parseTab(tab) ?: return false
            selectTab(target)
            return true
        }
        return false
    }

    private fun parseWorkspaceDestination(raw: String?): WorkspaceDestination? {
        val value = raw?.trim()?.lowercase() ?: return null
        return WorkspaceDestination.entries.firstOrNull { it.name.lowercase() == value }
    }

    private suspend fun evaluatePersonalReminders() {
        val current = mutableState.value
        withContext(Dispatchers.IO) { alertNotifier.evaluatePersonal(current.todoSnapshot, campusData.state.value.timetable) }
        reloadPersonalState()
    }

    fun measureNetworkHealth() {
        if (mutableState.value.user == null) return
        viewModelScope.launch {
            mutableState.update { it.copy(networkHealth = it.networkHealth.copy(status = "measuring")) }
            mutableState.update { it.copy(networkHealth = withContext(Dispatchers.IO) { networkDiagnostics.inspect() }) }
        }
    }

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

    fun openOfficialLibrarySeatReservation(onOpen: (PlatformWebSession) -> Unit) =
        actions.run("official-library-seat-reservation") {
            librarySeats.clearLibrarySeatFeedback()
            try {
                onOpen(api.campus.librarySeatOfficialWebSession())
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, ::forceReauthentication)
                librarySeats.showError(error.message ?: "学校官方座位预约入口打开失败，请稍后重试。")
                throw error
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

    fun createDesktopMagicLink(onResult: (String?, String?) -> Unit) = accountSecurity.createDesktopMagicLink(onResult)

    fun updateNotificationPreferences(preferences: AlertPreferences) = notifications.updateNotificationPreferences(preferences)

    fun saveNotificationPreferences(preferences: AlertPreferences, onComplete: (String?) -> Unit) =
        notifications.updateAlertPreferences(preferences, onComplete)

    fun checkAppUpdates() = appUpdates.check()

    fun checkAppUpdatesSilently() = appUpdates.check(silent = true)

    fun downloadAndInstallAppUpdate() = appUpdates.downloadAndInstall()

    fun installDownloadedAppUpdate() = appUpdates.installDownloaded()

    fun resumeAppUpdate() = appUpdates.onReturnedToApp()

    fun openAppReleasesPage(url: String? = null) = appUpdates.openReleasesPage(url)

    fun loadAndroidReleases(force: Boolean = false) = androidReleases.load(force)

    fun saveAndroidReleaseDraft(versionName: String, notes: String) =
        androidReleases.saveDraft(versionName, notes)

    fun dispatchAndroidBuild(confirmation: suspend () -> Boolean) =
        androidReleases.dispatchBuild(confirmation)

    fun downloadAndroidRelease(record: AndroidReleaseRecord) = androidReleases.download(record)

    fun loadRegistryImages(force: Boolean = false) = registryImages.load(force)

    fun toggleRegistryImage(tag: String) = registryImages.toggle(tag)

    fun toggleRegistryImagePrefix(prefix: String, selected: Boolean) =
        registryImages.togglePrefix(prefix, selected)

    fun clearRegistryImageSelection() = registryImages.clearSelection()

    fun updateRegistryImageKeepCount(value: Int) = registryImages.updateKeepCount(value)

    fun updateRegistryImageIncludeUnknown(value: Boolean) = registryImages.updateIncludeUnknown(value)

    fun deleteRegistryImages(confirmation: suspend () -> Boolean) =
        registryImages.deleteSelected(confirmation)

    fun previewRegistryImagePrune() = registryImages.previewPrune()

    fun executeRegistryImagePrune(confirmation: suspend () -> Boolean) =
        registryImages.executePrune(confirmation)

    fun discardRegistryImagePlan() = registryImages.discardPlan()

    fun clearRegistryImageFeedback() = registryImages.clearFeedback()

}

internal fun formatBytes(bytes: Long): String = when {
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

/** 会话可用且未处于退出流程时，才允许发起需要登录态的请求。 */
internal fun AppUiState.canRunRequest(): Boolean = user != null && !locked && busyAction != "logout"
