package cn.pxyb.mycontrol.ui.feature.authenticator

import android.app.Application
import android.security.keystore.UserNotAuthenticatedException
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.AppSessionLifecycle
import cn.pxyb.mycontrol.data.Authenticator
import cn.pxyb.mycontrol.data.AuthenticatorEntry
import cn.pxyb.mycontrol.data.AuthenticatorParseException
import cn.pxyb.mycontrol.data.AuthenticatorStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AuthenticatorUiState(
    val loading: Boolean = false,
    val entries: List<AuthenticatorEntry> = emptyList(),
    val message: String? = null,
    val error: String? = null,
    val busy: Boolean = false,
    val locked: Boolean = true,
)

class AuthenticatorViewModel(application: Application) : AndroidViewModel(application) {
    private val store = AuthenticatorStore(application)
    private val mutableState = MutableStateFlow(AuthenticatorUiState())
    val state: StateFlow<AuthenticatorUiState> = mutableState.asStateFlow()
    private var visible = false
    private var generation = 0L

    fun unlock(authorize: suspend () -> Boolean) {
        visible = true
        perform(authorize)
    }

    fun lock() {
        generation += 1
        mutableState.value.entries.forEach { it.secret.fill(0) }
        mutableState.update { it.copy(locked = true, entries = emptyList(), message = null, error = null) }
    }

    fun leave() {
        visible = false
        lock()
    }

    fun addFromUri(uri: String, authorize: suspend () -> Boolean) =
        add(authorize) { Authenticator.parseOtpAuthUri(uri) }

    fun addManual(issuer: String, account: String, secret: String, authorize: suspend () -> Boolean) =
        add(authorize) {
            Authenticator.createEntry(issuer = issuer, account = account, secret = Authenticator.decodeBase32(secret))
        }

    fun delete(id: String, authorize: suspend () -> Boolean) =
        perform(authorize, "验证器条目已删除。") { entries -> entries.filterNot { it.id == id } }

    fun clearFeedback() {
        mutableState.update { it.copy(message = null, error = null) }
    }

    private fun add(authorize: suspend () -> Boolean, parseEntry: () -> AuthenticatorEntry) =
        perform(authorize, "验证器条目已添加。") { entries ->
            val entry = parseEntry()
            if (entries.any { it.sameIdentity(entry) }) {
                entry.secret.fill(0)
                throw IllegalArgumentException("该验证器条目已存在。")
            }
            entries + entry
        }

    private fun perform(
        authorize: suspend () -> Boolean,
        message: String? = null,
        change: ((List<AuthenticatorEntry>) -> List<AuthenticatorEntry>)? = null,
    ) {
        if (!visible || mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, loading = change == null, error = null, message = null) }
        viewModelScope.launch {
            var source = emptyList<AuthenticatorEntry>()
            var result = emptyList<AuthenticatorEntry>()
            try {
                withContext(Dispatchers.IO) { cn.pxyb.mycontrol.data.RuntimeSecurity.requireSafeEnvironment() }
                withContext(Dispatchers.IO) { store.prepareProtection() }
                if (!authorize()) return@launch
                if (!visible || !AppSessionLifecycle.isForeground) return@launch
                val operationGeneration = generation
                withContext(Dispatchers.IO) {
                    source = store.read()
                    result = change?.invoke(source) ?: source
                    if (change != null) store.write(result)
                }
                if (visible && AppSessionLifecycle.isForeground && operationGeneration == generation) {
                    mutableState.value.entries.forEach { it.secret.fill(0) }
                    mutableState.update { it.copy(locked = false, entries = result, message = message) }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (visible) mutableState.update { it.copy(error = userMessage(error)) }
            } finally {
                val retained = mutableState.value.entries
                (source + result).filter { entry -> retained.none { it === entry } }.forEach { it.secret.fill(0) }
                mutableState.update { it.copy(busy = false, loading = false) }
            }
        }
    }

    override fun onCleared() {
        leave()
        super.onCleared()
    }

    private fun userMessage(error: Throwable): String = when (error) {
        is cn.pxyb.mycontrol.data.ApiException -> error.message ?: "设备安全验证未通过。"
        is UserNotAuthenticatedException -> "身份验证已过期，请重新验证后操作。"
        is AuthenticatorParseException, is IllegalArgumentException, is IllegalStateException ->
            error.message ?: "输入内容无效。"
        is AuthenticatorStore.StorageException -> error.message ?: "本地验证器数据保存失败。"
        else -> "无法解锁验证器，请确认系统锁屏凭据有效后重试。"
    }
}

private fun AuthenticatorEntry.sameIdentity(other: AuthenticatorEntry): Boolean =
    issuer.equals(other.issuer, ignoreCase = true) &&
        account.equals(other.account, ignoreCase = true) &&
        secret.contentEquals(other.secret)
