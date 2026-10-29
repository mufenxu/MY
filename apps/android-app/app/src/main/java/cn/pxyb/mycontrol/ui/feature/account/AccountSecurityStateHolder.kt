package cn.pxyb.mycontrol.ui.feature.account

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.data.WebLoginLink
import cn.pxyb.mycontrol.ui.state.ActionStateHolder
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update

/**
 * 账号安全流程的界面状态。
 *
 * 迁移自 [cn.pxyb.mycontrol.ui.AppUiState] 的平铺字段。这些都是「一次性流程」状态：
 * 动态验证注册结果、恢复码明文与 Passkey 列表只在账号安全屏内可见，登录完成后必须清空，
 * 避免明文恢复码长期留在全局状态里。
 *
 * [reauthenticatedUntil] 是敏感操作的五分钟免重复验证窗口，随会话失效一起归零。
 */
@Immutable
data class AccountSecurityUiState(
    val totpEnrollment: TotpEnrollment? = null,
    val recoveryCodes: List<String> = emptyList(),
    val passkeys: List<PlatformPasskey> = emptyList(),
    val reauthenticatedUntil: Long = 0,
)

class AccountSecurityStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val actions: ActionStateHolder,
    private val onSessionExpired: (String) -> Unit,
    private val onRefresh: () -> Unit,
    private val onMessage: (String) -> Unit,
    private val onWebLoginLink: (WebLoginLink) -> Unit,
) : FeatureStateHolder<AccountSecurityUiState>(parentScope, AccountSecurityUiState(), onSessionExpired) {
    override fun clearPendingState(current: AccountSecurityUiState): AccountSecurityUiState = current

    fun revokeSession(nonce: String, confirmation: suspend () -> Boolean) =
        actions.run("session", "远程会话已撤销。", confirmation) {
            if (api.auth.revokeSession(nonce)) onSessionExpired("当前设备已退出，请重新登录。")
            else onRefresh()
        }

    fun revokeOtherSessions(confirmation: suspend () -> Boolean) =
        actions.run("session", "其他设备已退出。", confirmation) {
            api.auth.revokeOtherSessions()
            onRefresh()
        }

    fun reauthenticateWithPasskey(requestCredential: suspend (String) -> String) =
        actions.run("passkey-reauth", "身份已确认，五分钟内可执行账号安全操作。", failureMessage = "Passkey 验证未完成，请重试。") {
            mutableState.update { it.copy(reauthenticatedUntil = 0) }
            val challenge = api.auth.beginPasskeyReauthentication()
            val expiresAt = api.auth.completePasskeyReauthentication(challenge.challengeId, requestCredential(challenge.optionsJson))
            mutableState.update { it.copy(reauthenticatedUntil = expiresAt) }
        }

    fun changePassword(oldPassword: String, newPassword: String, totp: String) =
        actions.run("password", failureMessage = "密码修改失败，请稍后重试。") {
            if (api.auth.changePassword(oldPassword, newPassword, totp)) {
                onSessionExpired("密码已修改，所有会话已退出，请使用新密码重新登录。")
            } else {
                onMessage("登录密码已更新。")
            }
        }

    fun beginTotpEnrollment(password: String, totp: String) =
        actions.run("totp-enroll", failureMessage = "动态验证注册启动失败，请稍后重试。") {
            val enrollment = api.auth.beginTotpEnrollment(password, totp)
            mutableState.update { it.copy(totpEnrollment = enrollment) }
        }

    fun confirmTotpEnrollment(code: String) =
        actions.run("totp-confirm", "动态验证已启用。", failureMessage = "动态验证码无效，请重试。") {
            val codes = api.auth.confirmTotpEnrollment(code)
            mutableState.update { it.copy(recoveryCodes = codes) }
            onRefresh()
        }

    fun regenerateRecoveryCodes(password: String, totp: String) =
        actions.run("recovery-codes", "恢复码已重置，旧恢复码全部失效。", failureMessage = "恢复码生成失败，请稍后重试。") {
            val codes = api.auth.regenerateRecoveryCodes(password, totp)
            mutableState.update { it.copy(recoveryCodes = codes) }
            onRefresh()
        }

    fun disableTotp(password: String, totp: String) =
        actions.run("totp-disable", failureMessage = "动态验证关闭失败，请稍后重试。") {
            if (api.auth.disableTotp(password, totp)) {
                onSessionExpired("动态验证已关闭，所有会话已退出，请重新登录。")
            } else {
                onMessage("动态验证已关闭。")
                onRefresh()
            }
        }

    fun clearTotpFlow() {
        mutableState.update { it.copy(totpEnrollment = null, recoveryCodes = emptyList()) }
    }

    fun refreshPasskeys() = actions.run("passkey-list", failureMessage = "Passkey 列表读取失败，请稍后重试。") {
        val passkeys = api.auth.passkeys()
        mutableState.update { it.copy(passkeys = passkeys) }
    }

    suspend fun loadPasskeys() {
        runCatching { api.auth.passkeys() }
            .onSuccess { passkeys -> mutableState.update { it.copy(passkeys = passkeys) } }
            .onFailure { handleRequestFailure(it) }
    }

    fun registerPasskey(
        name: String,
        password: String,
        totp: String,
        requestCredential: suspend (String) -> String,
    ) = actions.run("passkey-register", "Passkey 已成功绑定。", failureMessage = "Passkey 注册失败，请稍后重试。") {
        val challenge = api.auth.beginPasskeyRegistration(password, totp)
        val responseJson = requestCredential(challenge.optionsJson)
        api.auth.completePasskeyRegistration(challenge.challengeId, responseJson, name)
        onRefresh()
    }

    fun deletePasskey(id: String, password: String, totp: String) =
        actions.run("passkey-delete", "Passkey 已删除。", failureMessage = "Passkey 删除失败，请稍后重试。") {
            api.auth.deletePasskey(id, password, totp)
            onRefresh()
        }

    fun createDesktopMagicLink(onResult: (String?, String?) -> Unit) = actions.run("desktop-magic-link") {
        try {
            val link = api.auth.createWebLoginLink("/console")
            onWebLoginLink(link)
            onResult(link.loginUrl, null)
        } catch (error: Throwable) {
            handleRequestFailure(error)
            onResult(null, error.message ?: "生成网页登录链接失败")
            throw error
        }
    }
}
