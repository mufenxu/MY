package cn.pxyb.mycontrol.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.ReleaseData
import cn.pxyb.mycontrol.data.QrLoginTarget
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

enum class MainTab { Overview, Events, Operations, Tools, Profile }

data class AppUiState(
    val booting: Boolean = true,
    val locked: Boolean = false,
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
    val error: String? = null,
    val message: String? = null,
) {
    val activeIncidents: List<IncidentInfo>
        get() = incidents.filter { it.status != "resolved" }
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val api = PlatformApi(sessionStore)
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = false,
            locked = sessionStore.hasSession(),
            suggestedUsername = sessionStore.readLastUsername(),
        ),
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()
    private var pendingQrLogin: Pair<String, String>? = null

    init {
        viewModelScope.launch {
            runCatching { api.loginCapabilities() }.onSuccess { capabilities ->
                mutableState.update { it.copy(androidPasskeySupported = capabilities.androidPasskeySupported) }
            }
        }
    }

    fun unlockSession() {
        viewModelScope.launch {
            mutableState.update { it.copy(booting = true, error = null) }
            val user = api.authStatus()
            if (user == null) {
                mutableState.update { it.copy(booting = false, locked = false, user = null, error = "登录会话已过期，请重新登录。") }
                MyControlWidgetProvider.clear(getApplication())
            } else {
                mutableState.update { it.copy(booting = false, locked = false, user = user) }
                refreshAll()
                scanPendingQrLogin()
            }
        }
    }

    fun discardLockedSession() {
        sessionStore.clear()
        mutableState.update { it.copy(booting = false, locked = false, user = null, error = null) }
        MyControlWidgetProvider.clear(getApplication())
    }

    fun login(username: String, password: String, factor: String, useRecoveryCode: Boolean) {
        if (username.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(error = "请输入平台账号和密码。", message = null) }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                api.login(
                    username,
                    password,
                    totp = factor.takeUnless { useRecoveryCode }.orEmpty(),
                    recoveryCode = factor.takeIf { useRecoveryCode }.orEmpty(),
                )
            }.onSuccess(::completeLogin).onFailure(::handleLoginFailure)
        }
    }

    fun loginWithPasskey(username: String, requestCredential: suspend (String) -> String) {
        if (username.isBlank()) {
            mutableState.update { it.copy(error = "请先输入平台账号。", message = null) }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching {
                val challenge = api.beginPasskeyLogin(username)
                api.completePasskeyLogin(challenge, requestCredential(challenge.optionsJson))
            }.onSuccess(::completeLogin).onFailure(::handleLoginFailure)
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
        if (mutableState.value.user != null && sessionStore.hasSession() && !mutableState.value.qrLoginBusy) {
            mutableState.update { it.copy(locked = true) }
        }
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
        refreshAll()
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
            mutableState.update { it.copy(busyAction = "logout", error = null) }
            api.logout()
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
        mutableState.update { it.copy(selectedTab = tab, error = null, message = null) }
    }

    fun openQrScanner() {
        mutableState.update {
            it.copy(qrLoginOpen = true, qrLoginBusy = false, qrLoginTarget = null, qrLoginError = null)
        }
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

    fun refreshAll(force: Boolean = false) {
        if (mutableState.value.user == null) return
        viewModelScope.launch {
            mutableState.update { it.copy(refreshing = true, error = null) }
            supervisorScope {
                val overview = async { runCatching { api.overview(force) } }
                val incidents = async { runCatching { api.incidents() } }
                val tasks = async { runCatching { api.tasks() } }
                val releases = async { runCatching { api.releases() } }
                val backup = async { runCatching { api.backupQuality() } }
                val iot = async { runCatching { api.iot() } }
                val ct8 = async { runCatching { api.ct8() } }
                val security = async { runCatching { api.security() } }

                val overviewResult = overview.await()
                val incidentResult = incidents.await()
                val taskResult = tasks.await()
                val releaseResult = releases.await()
                val backupResult = backup.await()
                val iotResult = iot.await()
                val ct8Result = ct8.await()
                val securityResult = security.await()
                val failures = listOfNotNull(
                    overviewResult.exceptionOrNull(),
                    incidentResult.exceptionOrNull(),
                    taskResult.exceptionOrNull(),
                    releaseResult.exceptionOrNull(),
                    backupResult.exceptionOrNull(),
                    iotResult.exceptionOrNull(),
                    ct8Result.exceptionOrNull(),
                    securityResult.exceptionOrNull(),
                )
                val unauthorized = failures.filterIsInstance<ApiException>().firstOrNull { it.status == 401 }
                if (unauthorized != null) {
                    mutableState.value = AppUiState(booting = false, error = unauthorized.message)
                    MyControlWidgetProvider.clear(getApplication())
                    return@supervisorScope
                }
                mutableState.update { current ->
                    current.copy(
                        refreshing = false,
                        overview = overviewResult.getOrNull() ?: current.overview,
                        incidents = incidentResult.getOrNull() ?: current.incidents,
                        tasks = taskResult.getOrNull()?.tasks ?: current.tasks,
                        releases = releaseResult.getOrNull() ?: current.releases,
                        backup = backupResult.getOrNull() ?: current.backup,
                        iot = iotResult.getOrNull() ?: current.iot,
                        ct8 = ct8Result.getOrNull() ?: current.ct8,
                        security = securityResult.getOrNull() ?: current.security,
                        error = failures.firstOrNull()?.message?.let { "部分数据暂不可用：$it" },
                    )
                }
                publishWidget()
            }
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

    fun resolveIncident(id: String, note: String) = updateIncident("事件已关闭。") {
        api.updateIncident(id, "resolve", note = note)
    }

    fun runDiagnostics() = runAction("diagnostics", "系统自检已完成。") {
        val diagnostics = api.runDiagnostics()
        mutableState.update { it.copy(diagnostics = diagnostics) }
    }

    fun triggerBackup() = runAction("backup", "备份任务已进入执行队列。") {
        api.triggerBackup()
        mutableState.update { it.copy(backup = api.backupQuality()) }
    }

    fun triggerCt8() = runAction("ct8", "CT8 任务已提交。") {
        api.triggerCt8()
        mutableState.update { it.copy(ct8 = api.ct8()) }
    }

    fun runIotScene(id: String) = runAction("scene", "IoT 场景指令已进入执行队列。") {
        api.runIotScene(id)
        mutableState.update { it.copy(iot = api.iot()) }
        publishWidget()
    }

    fun revokeSession(nonce: String) = runAction("session", "远程会话已撤销。") {
        api.revokeSession(nonce)
        mutableState.update { it.copy(security = api.security()) }
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

    private fun updateIncident(successMessage: String, action: suspend () -> Unit) =
        runAction("incident", successMessage) {
            action()
            mutableState.update { it.copy(incidents = api.incidents()) }
            publishWidget()
        }

    private fun publishWidget() {
        val current = mutableState.value
        MyControlWidgetProvider.publish(
            context = getApplication(),
            overview = current.overview,
            activeIncidents = current.activeIncidents,
            iot = current.iot,
        )
    }

    private fun runAction(action: String, successMessage: String, block: suspend () -> Unit) {
        if (mutableState.value.busyAction != null) return
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = action, error = null, message = null) }
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
}
