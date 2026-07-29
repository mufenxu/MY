package cn.pxyb.mycontrol.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
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
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.SessionStore
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
    val error: String? = null,
    val message: String? = null,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val api = PlatformApi(sessionStore)
    private val mutableState = MutableStateFlow(
        AppUiState(
            booting = false,
            locked = sessionStore.hasSession(),
        ),
    )
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()

    fun unlockSession() {
        viewModelScope.launch {
            mutableState.update { it.copy(booting = true, error = null) }
            val user = api.authStatus()
            if (user == null) {
                mutableState.value = AppUiState(booting = false, error = "登录会话已过期，请重新登录。")
            } else {
                mutableState.update { it.copy(booting = false, locked = false, user = user) }
                refreshAll()
            }
        }
    }

    fun discardLockedSession() {
        sessionStore.clear()
        mutableState.value = AppUiState(booting = false)
    }

    fun login(username: String, password: String, factor: String) {
        if (username.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(error = "请输入平台账号和密码。") }
            return
        }
        viewModelScope.launch {
            mutableState.update { it.copy(loginBusy = true, error = null, message = null) }
            runCatching { api.login(username, password, totp = factor) }
                .onSuccess { result ->
                    mutableState.update {
                        it.copy(
                            loginBusy = false,
                            locked = false,
                            user = result.user,
                            secondFactorRequired = false,
                            message = result.recoveryCodes.takeIf(List<String>::isNotEmpty)?.let {
                                "动态验证已启用，请妥善保存网页登录页显示的恢复码。"
                            },
                        )
                    }
                    refreshAll()
                }
                .onFailure { error ->
                    val apiError = error as? ApiException
                    val requiresFactor = apiError?.code == "SECOND_FACTOR_REQUIRED"
                    val message = when (apiError?.code) {
                        "MFA_ENROLLMENT_REQUIRED" -> "首次绑定动态验证请先在网页控制台完成。"
                        "PASSKEY_REQUIRED" -> "该账号要求使用 Passkey，请先在网页控制台登录。"
                        "BOT_CHALLENGE_REQUIRED" -> "登录触发了安全验证，请先在网页控制台完成验证。"
                        else -> error.message ?: "登录失败，请稍后重试。"
                    }
                    mutableState.update {
                        it.copy(loginBusy = false, secondFactorRequired = requiresFactor, error = message)
                    }
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            mutableState.update { it.copy(busyAction = "logout", error = null) }
            api.logout()
            mutableState.value = AppUiState(booting = false)
        }
    }

    fun selectTab(tab: MainTab) {
        mutableState.update { it.copy(selectedTab = tab, error = null, message = null) }
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
            }
        }
    }

    fun acknowledgeIncident(id: String) = runAction("incident", "事件已确认。") {
        api.acknowledgeIncident(id)
        val incidents = api.incidents()
        mutableState.update { it.copy(incidents = incidents) }
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
    }

    fun revokeSession(nonce: String) = runAction("session", "远程会话已撤销。") {
        api.revokeSession(nonce)
        mutableState.update { it.copy(security = api.security()) }
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
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
                    } else {
                        mutableState.update {
                            it.copy(busyAction = null, error = error.message ?: "操作失败，请稍后重试。")
                        }
                    }
                }
        }
    }
}
