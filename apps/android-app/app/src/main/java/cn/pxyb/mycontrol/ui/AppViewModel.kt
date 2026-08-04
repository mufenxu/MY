package cn.pxyb.mycontrol.ui

import android.app.Application
import android.net.Uri
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IncidentPostmortem
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class MainTab { Overview, Events, Operations, Tools, Profile }

private enum class RefreshSection { Overview, Incidents, Tasks, Releases, Backup, Iot, Ct8, Security }

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
    val refreshing: Boolean = false,
    val busyAction: String? = null,
    val overview: OverviewData? = null,
    val incidents: List<IncidentInfo> = emptyList(),
    val tasks: List<PlatformTask> = emptyList(),
    val releases: ReleaseData? = null,
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
    val totpEnrollment: TotpEnrollment? = null,
    val recoveryCodes: List<String> = emptyList(),
    val passkeys: List<PlatformPasskey> = emptyList(),
    val focusIncidentId: String? = null,
    val focusTaskId: String? = null,
    val error: String? = null,
    val message: String? = null,
) {
    val activeIncidents: List<IncidentInfo>
        get() = incidents.filter { it.status != "resolved" }
    val actionRequiredTasks: List<PlatformTask>
        get() = tasks.filter { it.status in setOf("action_required", "failed") }
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val api = PlatformApi(sessionStore)
    private val alertNotifier = AlertNotifier(application)
    private val hasSavedSession = sessionStore.hasSession()
    private val lockEnabled = sessionStore.isLockEnabled()
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = hasSavedSession && !lockEnabled,
            locked = hasSavedSession && lockEnabled,
            suggestedUsername = sessionStore.readLastUsername(),
            appLockEnabled = lockEnabled,
        ),
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()
    private var pendingQrLogin: Pair<String, String>? = null
    private var pollJob: Job? = null
    private val refreshJobs = mutableMapOf<RefreshSection, Job>()
    private val lastRefreshElapsedMs = mutableMapOf<RefreshSection, Long>()
    private var alertsSeeded = false

    init {
        viewModelScope.launch {
            runCatching { api.loginCapabilities() }.onSuccess { capabilities ->
                mutableState.update { it.copy(androidPasskeySupported = capabilities.androidPasskeySupported) }
            }
        }
        if (!hasSavedSession) MyControlWidgetProvider.clear(getApplication())
        if (hasSavedSession && !lockEnabled) unlockSession()
    }

    fun unlockSession() {
        viewModelScope.launch {
            mutableState.update { it.copy(booting = true, error = null) }
            val locallyUnlocked = runCatching { sessionStore.unlock() }.getOrElse {
                mutableState.update {
                    it.copy(booting = false, locked = true, error = "设备身份验证已超时，请重新解锁。")
                }
                return@launch
            }
            if (!locallyUnlocked) {
                mutableState.update {
                    it.copy(booting = false, locked = false, user = null, error = "本地安全会话已失效，请重新登录。")
                }
                MyControlWidgetProvider.clear(getApplication())
                return@launch
            }
            runCatching { api.authStatus() }
                .onSuccess { user ->
                    if (user == null) {
                        mutableState.update {
                            it.copy(booting = false, locked = false, user = null, error = "登录会话已过期，请重新登录。")
                        }
                        MyControlWidgetProvider.clear(getApplication())
                    } else {
                        mutableState.update { it.copy(booting = false, locked = false, user = user) }
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
        alertNotifier.clear()
        sessionStore.clear()
        mutableState.update { it.copy(booting = false, locked = false, user = null, error = null) }
        MyControlWidgetProvider.clear(getApplication())
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
        if (username.isBlank()) {
            mutableState.update { it.copy(error = "请先输入平台账号。", message = null) }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val challenge = api.beginPasskeyLogin(username)
                val result = api.completePasskeyLogin(challenge, requestCredential(challenge.optionsJson))
                protectLogin(result, authorizeSession)
            }.onSuccess(::completeLogin).onFailure(::handleLoginFailure)
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
                        focusIncidentId = null,
                        focusTaskId = null,
                    )
                }
            } else {
                alertsSeeded = false
                alertNotifier.clear()
                clearRefreshCache()
                mutableState.update {
                    it.copy(locked = false, user = null, error = "登录会话已过期，请重新登录。")
                }
                MyControlWidgetProvider.clear(getApplication())
            }
        }
    }

    fun setAppLockEnabled(enabled: Boolean) {
        sessionStore.setLockEnabled(enabled)
        mutableState.update { it.copy(appLockEnabled = enabled) }
    }

    private fun completeLogin(result: cn.pxyb.mycontrol.data.LoginResult) {
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
            )
        }
        alertsSeeded = false
        startOperationalPolling()
        refreshInitialData()
        scanPendingQrLogin()
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
            alertNotifier.clear()
            mutableState.update {
                AppUiState(
                    booting = false,
                    androidPasskeySupported = it.androidPasskeySupported,
                    suggestedUsername = sessionStore.readLastUsername(),
                )
            }
            MyControlWidgetProvider.clear(getApplication())
        }
    }

    fun selectTab(tab: MainTab) {
        val changed = mutableState.value.selectedTab != tab
        mutableState.update { current ->
            if (current.selectedTab == tab && current.error == null && current.message == null) {
                current
            } else {
                current.copy(selectedTab = tab, error = null, message = null)
            }
        }
        if (changed) refreshForTab(tab)
    }

    fun handleOpenIntent(uri: Uri?) {
        if (uri == null) return
        if (uri.scheme == DeepLinks.SCHEME && uri.host == DeepLinks.HOST_OPEN) {
            openOperationalTarget(
                tab = DeepLinks.parseTab(uri.getQueryParameter(DeepLinks.EXTRA_TAB)),
                incidentId = uri.getQueryParameter(DeepLinks.EXTRA_INCIDENT_ID),
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
        incidentId: String? = null,
        taskId: String? = null,
    ) {
        val resolvedTab = tab ?: when {
            !incidentId.isNullOrBlank() -> MainTab.Events
            !taskId.isNullOrBlank() -> MainTab.Operations
            else -> null
        }
        mutableState.update {
            it.copy(
                selectedTab = resolvedTab ?: it.selectedTab,
                accountManagementOpen = false,
                focusIncidentId = incidentId?.takeIf(String::isNotBlank),
                focusTaskId = taskId?.takeIf(String::isNotBlank),
                error = null,
                message = null,
            )
        }
        resolvedTab?.let(::refreshForTab)
    }

    fun clearFocusTargets() {
        mutableState.update { it.copy(focusIncidentId = null, focusTaskId = null) }
    }

    fun openQrScanner() {
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
    }

    fun openAccountManagement() {
        val changedTab = mutableState.value.selectedTab != MainTab.Profile
        mutableState.update {
            it.copy(
                selectedTab = MainTab.Profile,
                accountManagementOpen = true,
            )
        }
        if (changedTab) refreshForTab(MainTab.Profile)
    }

    fun closeAccountManagement() {
        mutableState.update { it.copy(accountManagementOpen = false) }
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
        mutableState.update { it.copy(error = null) }
        refreshForTab(mutableState.value.selectedTab, force)
    }

    private fun refreshInitialData(force: Boolean = false) {
        refreshOverview(force)
        refreshIncidents(force)
        refreshTasks(force)
    }

    private fun refreshForTab(tab: MainTab, force: Boolean = false) {
        when (tab) {
            MainTab.Overview -> refreshInitialData(force)
            MainTab.Events -> refreshIncidents(force)
            MainTab.Operations -> {
                refreshTasks(force)
                refreshReleases(force)
                refreshBackup(force)
            }
            MainTab.Tools -> {
                refreshIot(force)
                refreshCt8(force)
            }
            MainTab.Profile -> refreshSecurity(force)
        }
    }

    private fun refreshOverview(force: Boolean) = launchRefresh(RefreshSection.Overview, force) {
        val overview = api.overview(force)
        mutableState.update { it.copy(overview = overview) }
        publishWidget()
    }

    private fun refreshIncidents(force: Boolean = false) = launchRefresh(RefreshSection.Incidents, force) {
        val incidents = api.incidents()
        mutableState.update { it.copy(incidents = incidents) }
        publishWidget()
        evaluateAlerts(incidents = incidents, tasks = mutableState.value.tasks)
    }

    private fun refreshTasks(force: Boolean = false) = launchRefresh(RefreshSection.Tasks, force) {
        val tasks = api.tasks().tasks
        mutableState.update { it.copy(tasks = tasks) }
        evaluateAlerts(incidents = mutableState.value.incidents, tasks = tasks)
    }

    private fun refreshReleases(force: Boolean = false) = launchRefresh(RefreshSection.Releases, force) {
        val releases = api.releases()
        mutableState.update { it.copy(releases = releases) }
    }

    private fun refreshBackup(force: Boolean = false) = launchRefresh(RefreshSection.Backup, force) {
        val backup = api.backupQuality()
        mutableState.update { it.copy(backup = backup) }
    }

    private fun refreshIot(force: Boolean = false) = launchRefresh(RefreshSection.Iot, force) {
        val iot = api.iot()
        mutableState.update { it.copy(iot = iot) }
        publishWidget()
    }

    private fun refreshCt8(force: Boolean = false) = launchRefresh(RefreshSection.Ct8, force) {
        val ct8 = api.ct8()
        mutableState.update { it.copy(ct8 = ct8) }
    }

    private fun refreshSecurity(force: Boolean = false) = launchRefresh(RefreshSection.Security, force) {
        val security = api.security()
        mutableState.update { it.copy(security = security) }
    }

    private fun launchRefresh(section: RefreshSection, force: Boolean = false, block: suspend () -> Unit) {
        if (mutableState.value.user == null || refreshJobs[section]?.isActive == true) return
        val now = SystemClock.elapsedRealtime()
        val lastRefresh = lastRefreshElapsedMs[section]
        if (!force && lastRefresh != null && now - lastRefresh < REFRESH_CACHE_WINDOW_MS) return
        val job = viewModelScope.launch {
            try {
                block()
                lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                if (error is ApiException && error.status == 401) {
                    forceReauthentication(error.message ?: "登录会话已失效，请重新登录。")
                } else {
                    mutableState.update {
                        it.copy(error = "部分数据暂不可用：${error.message ?: "请稍后重试。"}")
                    }
                }
            } finally {
                refreshJobs.remove(section)
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

    fun acknowledgeIncident(id: String) = updateIncident("事件已确认。") {
        api.updateIncident(id, "acknowledge", note = "通过 MY Control Android 确认")
    }

    fun assignIncident(id: String, assignedTo: String) = updateIncident("事件负责人已更新。") {
        api.updateIncident(id, "assign", assignedTo = assignedTo)
    }

    fun addIncidentNote(id: String, note: String) = updateIncident("处理备注已记录。") {
        api.updateIncident(id, "note", note = note)
    }

    fun muteIncident(id: String, muteMinutes: Int) = updateIncident("事件已静默。") {
        api.updateIncident(id, "mute", muteMinutes = muteMinutes)
    }

    fun resolveIncident(id: String, note: String, confirmation: suspend () -> Boolean) =
        updateIncident("事件已关闭。", confirmation) {
        api.updateIncident(id, "resolve", note = note)
    }

    fun completeRunbookStep(id: String, stepId: String, completed: Boolean) =
        updateIncident(if (completed) "处置步骤已完成。" else "处置步骤已回退。") {
            api.updateIncident(id, "runbook_step", stepId = stepId, completed = completed)
        }

    fun savePostmortem(id: String, postmortem: IncidentPostmortem) =
        updateIncident("事故复盘已保存。") {
            api.updateIncident(id, "postmortem", postmortem = postmortem)
        }

    fun approveConfiguration(
        changeId: String,
        note: String = "通过 MY Control Android 审批",
        confirmation: suspend () -> Boolean,
    ) = runAction("config-approve", "配置变更已审批并生效。", confirmation) {
        api.approveConfiguration(changeId, note)
        mutableState.update { it.copy(tasks = api.tasks().tasks) }
        evaluateAlerts(incidents = mutableState.value.incidents, tasks = mutableState.value.tasks)
    }

    fun rejectConfiguration(
        changeId: String,
        note: String = "通过 MY Control Android 拒绝",
        confirmation: suspend () -> Boolean,
    ) = runAction("config-reject", "配置变更提案已拒绝。", confirmation) {
        api.rejectConfiguration(changeId, note)
        mutableState.update { it.copy(tasks = api.tasks().tasks) }
        evaluateAlerts(incidents = mutableState.value.incidents, tasks = mutableState.value.tasks)
    }

    fun runDiagnostics() = runAction("diagnostics", "系统自检已完成。") {
        val diagnostics = api.runDiagnostics()
        mutableState.update { it.copy(diagnostics = diagnostics) }
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

    private fun updateIncident(
        successMessage: String,
        confirmation: (suspend () -> Boolean)? = null,
        action: suspend () -> Unit,
    ) = runAction("incident", successMessage, confirmation) {
            action()
            val incidents = api.incidents()
            mutableState.update { it.copy(incidents = incidents) }
            publishWidget()
            evaluateAlerts(incidents = incidents, tasks = mutableState.value.tasks)
        }

    private suspend fun publishWidget() {
        val current = mutableState.value
        withContext(Dispatchers.IO) {
            MyControlWidgetProvider.publish(
                context = getApplication(),
                overview = current.overview,
                activeIncidents = current.activeIncidents,
                iot = current.iot,
            )
        }
    }

    private fun evaluateAlerts(incidents: List<IncidentInfo>, tasks: List<PlatformTask>) {
        val seedOnly = !alertsSeeded
        alertNotifier.evaluate(incidents = incidents, tasks = tasks, seedOnly = seedOnly)
        alertsSeeded = true
    }

    private fun startOperationalPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(90_000)
                val current = mutableState.value
                if (current.user == null || current.locked || current.refreshing) continue
                runCatching {
                    val incidents = api.incidents()
                    val tasks = api.tasks().tasks
                    val refreshedAt = SystemClock.elapsedRealtime()
                    lastRefreshElapsedMs[RefreshSection.Incidents] = refreshedAt
                    lastRefreshElapsedMs[RefreshSection.Tasks] = refreshedAt
                    mutableState.update { it.copy(incidents = incidents, tasks = tasks) }
                    publishWidget()
                    evaluateAlerts(incidents = incidents, tasks = tasks)
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
                    if (error is ApiException && error.status == 401) {
                        mutableState.value = AppUiState(booting = false, error = error.message)
                        MyControlWidgetProvider.clear(getApplication())
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
        stopOperationalPolling()
        cancelRefreshes()
        clearRefreshCache()
        sessionStore.clear()
        mutableState.value = AppUiState(
            booting = false,
            androidPasskeySupported = mutableState.value.androidPasskeySupported,
            suggestedUsername = sessionStore.readLastUsername(),
            message = message,
        )
        MyControlWidgetProvider.clear(getApplication())
    }

    private companion object {
        const val REFRESH_CACHE_WINDOW_MS = 30_000L
    }
}
