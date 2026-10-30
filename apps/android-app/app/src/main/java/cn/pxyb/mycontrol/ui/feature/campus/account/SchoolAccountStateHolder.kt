package cn.pxyb.mycontrol.ui.feature.campus.account

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.CampusRepository
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** 短信登录的两个输入阶段。 */
enum class SchoolAccountPhase {
    /** 输入手机号，等待学校下发验证码。 */
    Phone,

    /** 输入已收到的短信验证码。 */
    Code,
}

@Immutable
data class SchoolAccountUiState(
    val visible: Boolean = false,
    val phase: SchoolAccountPhase = SchoolAccountPhase.Phone,
    val phone: String = "",
    /** 服务端回传的脱敏号码，例如 138****2043；只用于展示，不参与请求。 */
    val maskedPhone: String = "",
    val code: String = "",
    val pendingId: String = "",
    val cooldownSeconds: Int = 0,
    val sending: Boolean = false,
    val verifying: Boolean = false,
    val error: String? = null,
    /** 顶部说明：过期原因或当前已连接的学号，帮助用户确认是不是本人。 */
    val hint: String? = null,
) {
    val phoneValid: Boolean get() = PHONE_PATTERN.matches(phone)

    val codeValid: Boolean get() = code.length >= CODE_LENGTH

    val canSend: Boolean get() = phoneValid && !sending && cooldownSeconds <= 0 && pendingId.isEmpty()

    val canVerify: Boolean get() = codeValid && !verifying && pendingId.isNotEmpty()

    companion object {
        const val CODE_LENGTH = 6
        val PHONE_PATTERN = Regex("^1[3-9]\\d{9}$")
        const val RESEND_COOLDOWN_SECONDS = 60
    }
}

/**
 * 学校账号（统一身份认证）短信登录。
 *
 * 触发来源只有两个：校园接口返回 `SCHOOL_ACCOUNT_REQUIRED`，或用户在有失效提示的页面
 * 主动点击。多个并发请求同时失效时 [requestLogin] 是幂等的，不会重置用户已经输入的内容。
 *
 * 状态只活在内存里：手机号、验证码、pendingId 都不落盘，弹窗关闭即清空。
 */
class SchoolAccountStateHolder(
    parentScope: CoroutineScope,
    private val campus: CampusRepository,
    private val onSessionExpired: (String) -> Unit,
    private val onRecovered: () -> Unit,
    private val onMessage: (String) -> Unit = {},
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    private val mutableState = MutableStateFlow(SchoolAccountUiState())
    val state: StateFlow<SchoolAccountUiState> = mutableState.asStateFlow()

    private var cooldownJob: Job? = null

    /**
     * 打开登录弹窗。
     *
     * 已经在显示时只更新 [hint]，保留用户当前的输入与倒计时——一屏多个请求同时
     * 401 会连续触发本方法，重置会让用户刚敲的验证码凭空消失。
     */
    fun requestLogin(hint: String? = null) {
        mutableState.update { current ->
            if (current.visible) current.copy(hint = hint ?: current.hint)
            else SchoolAccountUiState(visible = true, hint = hint)
        }
    }

    /** 用户在页面里点「连接学校账号」时调用：无论此前什么状态都从头开始。 */
    fun startFresh(hint: String? = null) {
        cooldownJob?.cancel()
        mutableState.value = SchoolAccountUiState(visible = true, hint = hint)
    }

    fun dismiss() {
        cooldownJob?.cancel()
        mutableState.value = SchoolAccountUiState()
    }

    /** 账号切换、锁屏或退出登录时复位，避免上一个账号的号码留在输入框里。 */
    fun reset() {
        cooldownJob?.cancel()
        mutableState.value = SchoolAccountUiState()
    }

    fun onPhoneChange(value: String) {
        val digits = value.filter(Char::isDigit).take(11)
        mutableState.update { it.copy(phone = digits, error = null) }
    }

    fun onCodeChange(value: String) {
        val digits = value.filter(Char::isDigit).take(SchoolAccountUiState.CODE_LENGTH)
        mutableState.update { it.copy(code = digits, error = null) }
    }

    fun sendCode() {
        val current = mutableState.value
        if (current.sending || current.cooldownSeconds > 0) return
        if (!current.phoneValid) {
            mutableState.update { it.copy(error = "请输入与学校账号绑定的 11 位手机号。") }
            return
        }
        mutableState.update { it.copy(sending = true, error = null) }
        scope.launch {
            try {
                val challenge = campus.sendSchoolSmsCode(current.phone)
                mutableState.update {
                    it.copy(
                        sending = false,
                        phase = SchoolAccountPhase.Code,
                        pendingId = challenge.pendingId,
                        maskedPhone = challenge.maskedPhone,
                        code = "",
                        error = null,
                    )
                }
                startCooldown()
            } catch (error: Throwable) {
                if (handlePlatformFailure(error)) return@launch
                mutableState.update { it.copy(sending = false, error = smsErrorText(error)) }
            }
        }
    }

    fun verify() {
        val current = mutableState.value
        if (current.verifying || !current.canVerify) return
        mutableState.update { it.copy(verifying = true, error = null) }
        scope.launch {
            try {
                campus.verifySchoolSmsCode(current.pendingId, current.code)
                cooldownJob?.cancel()
                mutableState.value = SchoolAccountUiState()
                onMessage("学校账号已连接，正在刷新校园数据。")
                onRecovered()
            } catch (error: Throwable) {
                if (handlePlatformFailure(error)) return@launch
                val pendingExpired = error is ApiException && error.code == "CAS_SMS_PENDING_INVALID"
                mutableState.update {
                    // 待验证会话失效（超时 / 错误次数用尽 / 服务重启）只能重新发码，
                    // 停在验证码页会让用户对着一个永远不会成功的输入框重试。
                    if (pendingExpired) {
                        it.copy(
                            verifying = false,
                            phase = SchoolAccountPhase.Phone,
                            pendingId = "",
                            code = "",
                            maskedPhone = "",
                            error = smsErrorText(error),
                        )
                    } else {
                        it.copy(verifying = false, code = "", error = smsErrorText(error))
                    }
                }
            }
        }
    }

    /** 重新获取验证码：保留手机号，直接回到输入阶段再发一次。 */
    fun resendCode() {
        val current = mutableState.value
        if (current.sending || current.cooldownSeconds > 0) return
        mutableState.update {
            it.copy(phase = SchoolAccountPhase.Phone, pendingId = "", code = "", error = null)
        }
        sendCode()
    }

    fun clearError() {
        mutableState.update { it.copy(error = null) }
    }

    /**
     * 回到手机号阶段重新确认号码。
     *
     * 刻意保留发码倒计时：服务端按用户做 60 秒发码冷却，这里把倒计时清掉只会让用户
     * 立刻点「获取验证码」然后收到一条限流错误。
     */
    fun backToPhone() {
        val current = mutableState.value
        if (current.verifying || current.sending) return
        mutableState.update {
            it.copy(
                phase = SchoolAccountPhase.Phone,
                pendingId = "",
                code = "",
                maskedPhone = "",
                error = null,
            )
        }
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        mutableState.update { it.copy(cooldownSeconds = SchoolAccountUiState.RESEND_COOLDOWN_SECONDS) }
        cooldownJob = scope.launch {
            var remaining = SchoolAccountUiState.RESEND_COOLDOWN_SECONDS
            while (remaining > 0 && isActive) {
                delay(1_000)
                remaining -= 1
                mutableState.update { it.copy(cooldownSeconds = remaining) }
            }
        }
    }

    private fun smsErrorText(error: Throwable): String {
        val message = error.message?.takeIf(String::isNotBlank)
        return when {
            error is ApiException && error.code == "CAS_SMS_PENDING_INVALID" ->
                message ?: "验证码已失效，请重新获取。"
            error is ApiException && error.code == "CAS_SMS_CODE_REJECTED" ->
                message ?: "验证码不正确，请重新输入。"
            error is ApiException && error.code == "CAS_SMS_SEND_FAILED" ->
                message ?: "短信验证码发送失败，请确认该手机号已绑定学校账号。"
            error is ApiException && error.code == "SCHOOL_LOGIN_RATE_LIMITED" ->
                message ?: "尝试次数较多，请稍后再试。"
            else -> message ?: "网络连接失败，请检查网络后重试。"
        }
    }

    /** 平台会话失效必须交回外层处理；返回 true 表示已经接管，调用方不要再写本地错误。 */
    private fun handlePlatformFailure(error: Throwable): Boolean {
        if (error !is ApiException) return false
        if (!shouldInvalidatePlatformSession(error.status, error.code)) return false
        dismiss()
        onSessionExpired(error.message ?: "登录会话已失效，请重新登录。")
        return true
    }

    /** 账号切换时由 AppViewModel 调用，取消在途请求。 */
    fun cancelPending() {
        cooldownJob?.cancel()
        scope.coroutineContext.cancelChildren()
        mutableState.value = SchoolAccountUiState()
    }
}
