package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.PlatformApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

class AccountSecurityController(
    private val api: PlatformApi,
    private val actions: ActionStateHolder,
    private val appState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
    private val onRefresh: () -> Unit,
) {
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
            appState.update { it.copy(reauthenticatedUntil = 0) }
            val challenge = api.auth.beginPasskeyReauthentication()
            val expiresAt = api.auth.completePasskeyReauthentication(challenge.challengeId, requestCredential(challenge.optionsJson))
            appState.update { it.copy(reauthenticatedUntil = expiresAt) }
        }

    fun changePassword(oldPassword: String, newPassword: String, totp: String) =
        actions.run("password", failureMessage = "密码修改失败，请稍后重试。") {
            if (api.auth.changePassword(oldPassword, newPassword, totp)) {
                onSessionExpired("密码已修改，所有会话已退出，请使用新密码重新登录。")
            } else {
                appState.update { it.copy(message = "登录密码已更新。") }
            }
        }

    fun beginTotpEnrollment(password: String, totp: String) =
        actions.run("totp-enroll", failureMessage = "动态验证注册启动失败，请稍后重试。") {
            val enrollment = api.auth.beginTotpEnrollment(password, totp)
            appState.update { it.copy(totpEnrollment = enrollment) }
        }

    fun confirmTotpEnrollment(code: String) =
        actions.run("totp-confirm", "动态验证已启用。", failureMessage = "动态验证码无效，请重试。") {
            val codes = api.auth.confirmTotpEnrollment(code)
            appState.update { it.copy(recoveryCodes = codes) }
            onRefresh()
        }

    fun regenerateRecoveryCodes(password: String, totp: String) =
        actions.run("recovery-codes", "恢复码已重置，旧恢复码全部失效。", failureMessage = "恢复码生成失败，请稍后重试。") {
            val codes = api.auth.regenerateRecoveryCodes(password, totp)
            appState.update { it.copy(recoveryCodes = codes) }
            onRefresh()
        }

    fun disableTotp(password: String, totp: String) =
        actions.run("totp-disable", failureMessage = "动态验证关闭失败，请稍后重试。") {
            if (api.auth.disableTotp(password, totp)) {
                onSessionExpired("动态验证已关闭，所有会话已退出，请重新登录。")
            } else {
                appState.update { it.copy(message = "动态验证已关闭。") }
                onRefresh()
            }
        }

    fun clearTotpFlow() {
        appState.update { it.copy(totpEnrollment = null, recoveryCodes = emptyList()) }
    }

    fun refreshPasskeys() = actions.run("passkey-list", failureMessage = "Passkey 列表读取失败，请稍后重试。") {
        val passkeys = api.auth.passkeys()
        appState.update { it.copy(passkeys = passkeys) }
    }

    suspend fun loadPasskeys() {
        runCatching { api.auth.passkeys() }
            .onSuccess { passkeys -> appState.update { it.copy(passkeys = passkeys) } }
            .onFailure { handleFeatureRequestFailure(it, onSessionExpired) }
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
            appState.update { it.copy(webLoginLink = link) }
            onResult(link.loginUrl, null)
        } catch (error: Throwable) {
            handleFeatureRequestFailure(error, onSessionExpired)
            onResult(null, error.message ?: "生成网页登录链接失败")
            throw error
        }
    }
}
