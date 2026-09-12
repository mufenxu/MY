package cn.pxyb.mycontrol.ui.feature.authenticator

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.data.Authenticator
import cn.pxyb.mycontrol.data.AuthenticatorEntry
import cn.pxyb.mycontrol.data.AuthenticatorParseException
import cn.pxyb.mycontrol.data.AuthenticatorStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class AuthenticatorUiState(
    val loading: Boolean = true,
    val entries: List<AuthenticatorEntry> = emptyList(),
    val message: String? = null,
    val error: String? = null,
    val busy: Boolean = false,
)

class AuthenticatorViewModel(application: Application) : AndroidViewModel(application) {
    private val store = AuthenticatorStore(application)
    private val mutableState = MutableStateFlow(AuthenticatorUiState())
    val state: StateFlow<AuthenticatorUiState> = mutableState.asStateFlow()
    private val stateMutex = Mutex()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            stateMutex.withLock {
                mutableState.update { it.copy(loading = true, error = null) }
                val result = withContext(Dispatchers.IO) {
                    runCatching { store.read() }
                }
                result.fold(
                    onSuccess = { entries ->
                        mutableState.update { it.copy(loading = false, entries = entries) }
                    },
                    onFailure = { error ->
                        mutableState.update {
                            it.copy(loading = false, entries = emptyList(), error = userMessage(error))
                        }
                    }
                )
            }
        }
    }

    fun addFromUri(uri: String) {
        add {
            Authenticator.parseOtpAuthUri(uri)
        }
    }

    fun addManual(issuer: String, account: String, secret: String) {
        add {
            Authenticator.createEntry(
                issuer = issuer,
                account = account,
                secret = Authenticator.decodeBase32(secret),
            )
        }
    }

    fun delete(id: String) {
        mutate(entries = { entries -> entries.filterNot { it.id == id } }) { entries ->
            if (entries.any { it.id == id }) null else "验证器条目已删除。"
        }
    }

    fun clearFeedback() {
        mutableState.update { it.copy(message = null, error = null) }
    }

    private fun add(parseEntry: () -> AuthenticatorEntry) {
        mutate(
            entries = { entries ->
                val entry = parseEntry()
                if (entries.any { it.sameIdentity(entry) }) {
                    throw IllegalArgumentException("该验证器条目已存在。")
                }
                entries + entry
            },
        ) { entries -> "已添加 ${entries.last().issuer} 的动态验证。" }
    }

    private fun mutate(
        entries: (List<AuthenticatorEntry>) -> List<AuthenticatorEntry>,
        successMessage: (List<AuthenticatorEntry>) -> String? = { null },
    ) {
        if (mutableState.value.busy) return
        viewModelScope.launch {
            stateMutex.withLock {
                mutableState.update { it.copy(busy = true, error = null, message = null) }
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        val entries = entries(mutableState.value.entries)
                        store.write(entries)
                        entries
                    }
                }
                result.fold(
                    onSuccess = { entries ->
                        mutableState.update {
                            it.copy(busy = false, entries = entries, message = successMessage(entries))
                        }
                    },
                    onFailure = { error ->
                        mutableState.update { it.copy(busy = false, error = userMessage(error)) }
                    },
                )
            }
        }
    }

    private fun userMessage(error: Throwable): String = when (error) {
        is AuthenticatorParseException,
        is IllegalArgumentException,
        is IllegalStateException -> error.message ?: "输入内容无效。"
        is AuthenticatorStore.StorageException -> error.message ?: "本地验证器数据保存失败。"
        else -> "验证器操作失败，请重试。"
    }
}

private fun AuthenticatorEntry.sameIdentity(other: AuthenticatorEntry): Boolean =
    issuer.equals(other.issuer, ignoreCase = true) &&
        account.equals(other.account, ignoreCase = true) &&
        secret.contentEquals(other.secret)
