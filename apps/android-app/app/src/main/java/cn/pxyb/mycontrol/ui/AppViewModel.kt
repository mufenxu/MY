package cn.pxyb.mycontrol.ui

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
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import cn.pxyb.mycontrol.ui.feature.account.AccountSecurityController
import cn.pxyb.mycontrol.ui.feature.account.toAccountManagementUiState
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantChatMessageUi
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantChatUiState
import cn.pxyb.mycontrol.ui.feature.auth.toEntryUiState
import cn.pxyb.mycontrol.ui.feature.auth.toQrLoginUiState
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.reservation.ReservationStateHolder
import cn.pxyb.mycontrol.ui.feature.campus.reservation.campusReservationRedirect
import cn.pxyb.mycontrol.ui.feature.campus.toFreeClassroomUiState
import cn.pxyb.mycontrol.ui.feature.campus.water.WaterValveStateHolder
import cn.pxyb.mycontrol.ui.feature.google.GoogleAccountsController
import cn.pxyb.mycontrol.ui.feature.google.toGoogleAccountDeskUiState
import cn.pxyb.mycontrol.ui.feature.news.toDailyNewsUiState
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationController
import cn.pxyb.mycontrol.ui.feature.notifications.toNotificationCenterUiState
import cn.pxyb.mycontrol.ui.feature.operations.toOperationsUiState
import cn.pxyb.mycontrol.ui.feature.overview.toOverviewUiState
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
import cn.pxyb.mycontrol.ui.state.ActionStateHolder
import cn.pxyb.mycontrol.ui.state.handleFeatureRequestFailure
import cn.pxyb.mycontrol.update.AppUpdateManager
import cn.pxyb.mycontrol.widget.CourseWidgetProvider
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
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
    private val alertNotifier = AlertNotifier(application)
    private val androidCalendarSync = AndroidCalendarSync(application)
    private val hasSavedSession = sessionStore.hasSession()
    private val lockEnabled = sessionStore.isLockEnabled()
    private val savedHomePreferences = homePreferences.read()
    private val savedAssistantPreferences = assistantPreferences.read()
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = hasSavedSession && !lockEnabled,
            locked = hasSavedSession && lockEnabled,
            selectedTab = restoredMainTab(savedStateHandle[SAVED_SELECTED_TAB]) ?: MainTab.Overview,
            suggestedUsername = sessionStore.readLastUsername(),
            appLockEnabled = lockEnabled,
            homeQuickActionOrder = savedHomePreferences.order,
            hiddenHomeQuickActions = savedHomePreferences.hidden,
            assistantButtonVisible = savedAssistantPreferences.visible,
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
        canRun = { mutableState.value.let { it.user != null && !it.locked && it.busyAction != "logout" } },
    ) { error, message ->
        mutableState.update { it.copy(error = error, message = message) }
    }
    private val accountSecurity: AccountSecurityController = AccountSecurityController(api, actions, mutableState, ::forceReauthentication) {
        refreshSecurity(force = true)
    }
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
    val todos = TodoController(viewModelScope, TodoRepository(application, api, sessionStore), mutableState, ::forceReauthentication)
    private val notifications: NotificationController = NotificationController(
        application, viewModelScope, api, sessionStore, personalStore, alertNotifier, mutableState, ::forceReauthentication,
    ) { syncRemoteNotifications() }
    val entryState = deriveState(AppUiState::toEntryUiState)
    val overviewState = deriveState(AppUiState::toOverviewUiState)
    val operationsState = deriveState(AppUiState::toOperationsUiState)
    val toolsState = deriveState(AppUiState::toToolsUiState)
    val projectsState = deriveState(AppUiState::toProjectsUiState)
    val profileState = deriveState(AppUiState::toProfileUiState)
    val dailyNewsState = deriveState(AppUiState::toDailyNewsUiState)
    val accountManagementState = deriveState(AppUiState::toAccountManagementUiState)
    val googleAccounts = GoogleAccountsController(viewModelScope, api, googleAccountStore, sessionStore, mutableState, ::forceReauthentication, actions)
    val googleAccountDeskState = deriveState(AppUiState::toGoogleAccountDeskUiState)
    val qrLoginState = deriveState(AppUiState::toQrLoginUiState)
    val globalSearchState = deriveState(AppUiState::toGlobalSearchUiState)
    private val assistantChatMutable = MutableStateFlow(AssistantChatUiState())
    val assistantChatState: StateFlow<AssistantChatUiState> = assistantChatMutable.asStateFlow()
    val todayState = deriveState(AppUiState::toTodayUiState)
    private val waterValves = WaterValveStateHolder(
        viewModelScope,
        api,
        canRun = { mutableState.value.let { it.user != null && !it.locked && it.busyAction != "logout" } },
        onSessionExpired = ::forceReauthentication,
    )
    val waterValveState = waterValves.state
    val freeClassroomState = deriveState(AppUiState::toFreeClassroomUiState)
    val reservations = ReservationStateHolder(viewModelScope, api.campus, ::forceReauthentication)
    val librarySeats = LibrarySeatStateHolder(viewModelScope, api.campus, ::forceReauthentication)
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
    private val accountRequestScope = CoroutineScope(viewModelScope.coroutineContext + SupervisorJob(viewModelScope.coroutineContext[Job]))
    private var qrLoginJob: Job? = null

    private var appInForeground = false
    private val refreshJobs = mutableMapOf<DataSection, Job>()
    private val lastRefreshElapsedMs = mutableMapOf<DataSection, Long>()
    private var alertsSeeded = false
    private var initialIncidentsLoaded = false
    private var initialTasksLoaded = false
    private var operationalEffectsJob: Job? = null

    private var featureAccountUsername: String? = null

    private fun <T> deriveState(transform: (AppUiState) -> T): StateFlow<T> = mutableState
        .map(transform)
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), transform(mutableState.value))

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
            runCatching { api.auth.loginCapabilities() }.onSuccess { capabilities ->
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
            googleAccounts.cancelPending()
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
                        googleAccounts = emptyList(),
                        googleAccountsLoaded = false,
                        googleAccountsRevision = 0,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = false,
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
                reauthenticatedUntil = 0,
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
            googleAccounts.cancelPending()
            todos.cancelPending()
            notifications.cancelPending()
            actions.reset()
            appUpdates.reset()
            androidReleases.reset()
            reservations.reset()
            librarySeats.reset()
            waterValves.reset()
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
        mutableState.update { it.copy(loginEnrollment = null, loginRecoveryCodes = emptyList(), reauthenticatedUntil = 0) }
        cancelAccountRequests()
        assistantChatMutable.value = AssistantChatUiState()
        pendingQrLogin = null
        clearRefreshCache()
        googleAccounts.cancelPending()
        todos.cancelPending()
        notifications.cancelPending()
        actions.cancelPending()
        appUpdates.cancelPending()
        androidReleases.cancelPending()
        alertNotifier.clear()
        sessionStore.withRequestSession(null) {
            personalStore.clearAccountData(preservePendingTodos = true)
            snapshotStore.clear()
            googleAccountStore.clear()
        }
        setAccountScope(null)
    }

    private fun cancelAccountRequests() {
        accountRequestScope.coroutineContext.cancelChildren()
        qrLoginJob = null
        waterValves.cancelPending()
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
            WorkspaceDestination.Campus, WorkspaceDestination.Todos -> refreshToday()
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
        refreshGlobalSearch(force = true)
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
        val unreadAlerts = state.alerts.activeUnreadCount()
        put("unreadAlertCount", unreadAlerts)
        if (unreadAlerts > 0) {
            put(
                "recentAlerts",
                state.alerts.filter { !it.read && !it.isSnoozedAt() }.take(6).joinToString("；") { it.title },
            )
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
    fun openGitHubProjects() {
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Operations,
                accountManagementOpen = false,
                googleAccountDeskOpen = false,
                githubProjectsOpen = true,
                globalSearchOpen = false,
                workspaceDestination = null,
                error = null,
                message = null,
            )
        }
        refreshGitHubProjects()
    }

    fun closeGitHubProjects() {
        mutableState.update { it.copy(githubProjectsOpen = false) }
    }

    fun loadGitHubRepositories() {
        if (mutableState.value.user == null) return
        viewModelScope.launch {
            runCatching { api.githubRepositories() }
                .onSuccess { repositories ->
                    mutableState.update {
                        it.copy(
                            githubRepositories = repositories,
                            githubRepositoriesLoaded = true,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    mutableState.update {
                        it.copy(githubRepositoriesLoaded = true, error = error.message ?: "GitHub 仓库加载失败。")
                    }
                }
        }
    }

    fun loadGitHubProfile() {
        if (mutableState.value.user == null) return
        viewModelScope.launch {
            val profile = runCatching { api.githubProfile() }.getOrNull()
            mutableState.update {
                it.copy(githubProfile = profile, githubProfileLoaded = true)
            }
        }
    }

    fun refreshGitHubProjects() {
        loadGitHubProfile()
        loadGitHubRepositories()
    }

    fun updateGitHubVisibility(
        owner: String,
        repo: String,
        visibility: String,
        confirmation: suspend () -> Boolean,
    ) = runAction("github-visibility:$owner:$repo", "仓库可见性已更新。", confirmation) {
        api.updateGitHubVisibility(owner, repo, visibility)
        mutableState.update { it.copy(githubRepositories = api.githubRepositories()) }
    }

    fun loadGitHubReleases(owner: String, repo: String) {
        if (mutableState.value.user == null) return
        val fullName = "$owner/$repo"
        viewModelScope.launch {
            mutableState.update {
                it.copy(githubReleasesRepoFullName = fullName, githubReleasesLoaded = false)
            }
            runCatching { api.githubReleases(owner, repo) }
                .onSuccess { releases ->
                    mutableState.update {
                        it.copy(
                            githubReleases = releases,
                            githubReleasesLoaded = true,
                            githubReleasesRepoFullName = fullName,
                            error = null,
                        )
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    mutableState.update {
                        it.copy(githubReleasesLoaded = true, error = error.message ?: "GitHub Releases 加载失败。")
                    }
                }
        }
    }

    fun createGitHubRelease(
        owner: String,
        repo: String,
        tag: String,
        name: String,
        body: String,
        draft: Boolean,
        prerelease: Boolean,
        confirmation: suspend () -> Boolean,
    ) = runAction("github-release:$owner:$repo", "Release 已创建。", confirmation) {
        api.createGitHubRelease(owner, repo, tag, name, body, draft, prerelease)
        loadGitHubReleases(owner, repo)
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
        requestBiometric: suspend () -> Boolean,
    ) {
        val target = mutableState.value.qrLoginTarget ?: return
        if (mutableState.value.let { it.qrLoginBusy || it.user == null || it.locked || it.busyAction == "logout" } || target.status == "approved") return
        if (
            target.confirmationMethod == "unavailable" ||
            target.confirmationMethod == "passkey" && !mutableState.value.androidPasskeySupported
        ) {
            mutableState.update { it.copy(qrLoginError = "服务器尚未关联当前 Android App 的签名证书。") }
            return
        }
        qrLoginJob = accountRequestScope.launch {
            mutableState.update { it.copy(qrLoginBusy = true, qrLoginError = null) }
            try {
                val approved = api.withRequestMetadata(allowCache = false) {
                    if (target.confirmationMethod == "passkey") {
                        val challenge = api.auth.beginQrPasskey(target.requestId)
                        api.auth.approveQrWithPasskey(
                            target.requestId,
                            challenge,
                            requestCredential(challenge.optionsJson),
                        )
                    } else {
                        if (!requestBiometric()) throw IllegalStateException("身份验证已取消，未批准网页登录。")
                        api.auth.approveQrWithBiometric(target.requestId)
                    }
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
            workspaceDestination in setOf(WorkspaceDestination.Today, WorkspaceDestination.Timetable, WorkspaceDestination.Campus, WorkspaceDestination.Todos) -> refreshToday(force)
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
                refreshGitHubProjects()
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
        googleAccounts.loadGoogleAccounts()
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

    fun refreshDailyNews(force: Boolean = false) = launchRefresh(DataSection.DailyNews, force) {
        val dailyNews = api.dailyNews()
        mutableState.update { it.copy(dailyNews = dailyNews) }
    }

    private fun refreshIot(force: Boolean = false) = launchRefresh(DataSection.Iot, force) {
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

    private fun refreshToday(force: Boolean = false) {
        refreshTodos(force)
        refreshCampus(force)
        refreshResourceExpiries(force)
        refreshIncidents(force)
        refreshTasks(force)
    }

    private fun refreshTodos(force: Boolean = false) = launchRefresh(DataSection.Todos, force) {
        todos.refresh()
        evaluatePersonalReminders()
    }

    private fun refreshCampus(force: Boolean = false) = launchRefresh(DataSection.Campus, force) {
        val campus = api.campus.campusDashboard()
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
            val result = api.campus.campusFreeClassrooms(dayplus, sections, building)
            mutableState.update { it.copy(freeClassroomResult = result) }
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
        val security = api.auth.security()
        mutableState.update { it.copy(security = security) }
        accountSecurity.loadPasskeys()
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
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val refreshJob = currentCoroutineContext()[Job]
            api.withRequestMetadata {
                try {
                    block()
                    lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
                    val fromCache = api.isOffline()
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(error = null, updatedAtMillis = System.currentTimeMillis(), fromCache = fromCache, cachedAtMillis = cachedAt)
                    }
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(
                            error = error.message ?: "请稍后重试。",
                            fromCache = it.fromCache || cachedAt != null,
                            cachedAtMillis = cachedAt ?: it.cachedAtMillis,
                        )
                    }
                    if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
                        forceReauthentication(error.message ?: "登录会话已失效，请重新登录。")
                    } else if (publishError) {
                        mutableState.update { it.copy(error = "部分数据暂不可用：${error.message ?: "请稍后重试。"}") }
                    }
                } finally {
                    if (refreshJobs[section] === refreshJob) {
                        refreshJobs.remove(section)
                        updateSectionLoadState(section) { it.copy(refreshing = false) }
                        updateRefreshingState()
                    }
                }
            }
        }
        refreshJobs[section] = job
        job.start()
        updateRefreshingState()
    }

    private fun cancelRefreshes() {
        refreshJobs.values.toList().forEach { it.cancel() }
        refreshJobs.clear()
        mutableState.update { current ->
            current.copy(
                refreshing = false,
                sectionLoadStates = current.sectionLoadStates.mapValues { (_, state) -> state.copy(refreshing = false) },
            )
        }
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

    private fun updateSectionLoadState(
        section: DataSection,
        transform: (SectionLoadState) -> SectionLoadState,
    ) {
        mutableState.update { current ->
            val sections = current.sectionLoadStates + (section to transform(current.sectionLoadStates[section] ?: SectionLoadState()))
            current.copy(
                sectionLoadStates = sections,
                offlineMode = sections.values.any { it.fromCache },
                cachedAtMillis = sections.values.filter { it.fromCache }.mapNotNull { it.cachedAtMillis }.minOrNull(),
            )
        }
    }

    fun saveTodo(task: TodoTask) = todos.save(task)

    fun toggleTodo(id: String) = todos.toggle(id)

    fun deleteTodo(id: String) = todos.delete(id)

    fun syncAndroidCalendar() = actions.run("calendar-sync", failureMessage = "日历同步失败，请稍后重试。") {
        val current = mutableState.value
        val result = withContext(Dispatchers.IO) {
            androidCalendarSync.sync(
                accountUsername = current.user?.username ?: sessionStore.readActiveUsername(),
                timetable = current.campusTimetable,
                todos = current.todoSnapshot,
                resources = current.resourceExpiries,
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
                refreshIncidents()
                refreshTasks()
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
        withContext(Dispatchers.IO) { alertNotifier.evaluatePersonal(current.todoSnapshot, current.campusTimetable) }
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

    private companion object {
        const val REFRESH_CACHE_WINDOW_MS = 30_000L
    }
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
