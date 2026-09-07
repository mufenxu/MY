package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import cn.pxyb.mycontrol.data.GoogleAccountStore
import cn.pxyb.mycontrol.data.PlatformApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow

class GoogleAccountsController(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val googleAccountStore: GoogleAccountStore,
    // These records also feed overview and global search; operations share the app-wide busy state.
    private val mutableState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))

    fun cancelPending() {
        scope.coroutineContext.cancelChildren()
    }

    fun addGoogleAccount(
        primaryEmail: String,
        displayName: String,
        emailStatus: String,
        openAiStatus: String,
        tagsText: String,
        nextReviewAtText: String,
        note: String,
    ) {
        val email = normalizeGoogleAddress(primaryEmail)
        val tags = normalizeGoogleTags(tagsText) ?: return
        val nextReviewAt = parseGoogleReviewDate(nextReviewAtText)
        if (nextReviewAtText.isNotBlank() && nextReviewAt == null) {
            setGoogleAccountError("检查日期请使用 yyyy-MM-dd 格式。")
            return
        }
        when {
            !isValidGoogleAddress(email) -> setGoogleAccountError("请输入有效的 Google 邮箱地址。")
            mutableState.value.googleAccounts.any { it.primaryEmail == email } ->
                setGoogleAccountError("这个主邮箱已经添加过了。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts + GoogleAccountRecord(
                        id = UUID.randomUUID().toString(),
                        primaryEmail = email,
                        displayName = displayName.trim(),
                        emailStatus = emailStatus,
                        openAiStatus = openAiStatus,
                        note = note.trim(),
                        nextReviewAt = nextReviewAt,
                        tags = tags,
                    )
                },
                successMessage = "Google 邮箱已添加。",
            )
        }
    }

    fun importGoogleAccounts(rawText: String) {
        val candidates = rawText
            .split(Regex("[\\s,;]+"))
            .map(::normalizeGoogleAddress)
            .filter(::isValidGoogleAddress)
            .distinct()
        val existing = mutableState.value.googleAccounts.map { it.primaryEmail }.toSet()
        val newEmails = candidates.filterNot(existing::contains)
        if (newEmails.isEmpty()) {
            setGoogleAccountError("没有找到可导入的新邮箱。")
            return
        }
        val skippedCount = rawText
            .split(Regex("[\\s,;]+"))
            .count { it.isNotBlank() } - newEmails.size
        persistGoogleAccounts(
            transform = { accounts ->
                accounts + newEmails.map { email ->
                    GoogleAccountRecord(
                        id = UUID.randomUUID().toString(),
                        primaryEmail = email,
                    )
                }
            },
            successMessage = if (skippedCount > 0) {
                "已导入 ${newEmails.size} 个邮箱，跳过 $skippedCount 个无效或重复地址。"
            } else {
                "已导入 ${newEmails.size} 个邮箱。"
            },
        )
    }

    fun updateGoogleAccount(
        id: String,
        primaryEmail: String,
        displayName: String,
        emailStatus: String,
        openAiStatus: String,
        tagsText: String,
        nextReviewAtText: String,
        note: String,
    ) {
        val email = normalizeGoogleAddress(primaryEmail)
        val tags = normalizeGoogleTags(tagsText) ?: return
        val nextReviewAt = parseGoogleReviewDate(nextReviewAtText)
        if (nextReviewAtText.isNotBlank() && nextReviewAt == null) {
            setGoogleAccountError("检查日期请使用 yyyy-MM-dd 格式。")
            return
        }
        when {
            !isValidGoogleAddress(email) -> setGoogleAccountError("请输入有效的 Google 邮箱地址。")
            mutableState.value.googleAccounts.any { it.id != id && it.primaryEmail == email } ->
                setGoogleAccountError("这个主邮箱已经被其他记录使用。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts.map { account ->
                        if (account.id != id) account else account.copy(
                            primaryEmail = email,
                            displayName = displayName.trim(),
                            emailStatus = emailStatus,
                            openAiStatus = openAiStatus,
                            note = note.trim(),
                            lastCheckedAt = System.currentTimeMillis(),
                            nextReviewAt = nextReviewAt,
                            tags = tags,
                        )
                    }
                },
                successMessage = "邮箱记录已更新。",
            )
        }
    }

    fun deleteGoogleAccount(id: String) = persistGoogleAccounts(
        transform = { accounts -> accounts.filterNot { it.id == id } },
        successMessage = "邮箱记录已删除。",
    )

    fun bulkUpdateGoogleAccounts(ids: Set<String>, openAiStatus: String) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts ->
                accounts.map { account ->
                    if (account.id in ids) account.copy(
                        openAiStatus = openAiStatus,
                        lastCheckedAt = System.currentTimeMillis(),
                    ) else account
                }
            },
            successMessage = "已批量更新 ${ids.size} 个邮箱状态。",
        )
    }

    fun bulkSetGoogleAccountsArchived(ids: Set<String>, archived: Boolean) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts ->
                accounts.map { account ->
                    if (account.id in ids) account.copy(archived = archived) else account
                }
            },
            successMessage = if (archived) "已归档 ${ids.size} 个邮箱。" else "已恢复 ${ids.size} 个邮箱。",
        )
    }

    fun bulkDeleteGoogleAccounts(ids: Set<String>) {
        if (ids.isEmpty()) return
        persistGoogleAccounts(
            transform = { accounts -> accounts.filterNot { it.id in ids } },
            successMessage = "已删除 ${ids.size} 个邮箱记录。",
        )
    }

    fun addGoogleAlias(accountId: String, address: String, aliasType: String = "plus") {
        val normalizedAddress = normalizeGoogleAddress(address)
        when {
            !isValidGoogleAddress(normalizedAddress) -> setGoogleAccountError("请输入有效的别名地址。")
            mutableState.value.googleAccounts
                .firstOrNull { it.id == accountId }
                ?.aliases
                ?.any { it.address == normalizedAddress } == true ->
                setGoogleAccountError("这个别名已经添加过了。")
            else -> persistGoogleAccounts(
                transform = { accounts ->
                    accounts.map { account ->
                        if (account.id != accountId) account else account.copy(
                            aliases = account.aliases + GoogleAliasRecord(
                                id = UUID.randomUUID().toString(),
                                address = normalizedAddress,
                                aliasType = aliasType,
                            ),
                        )
                    }
                },
                successMessage = "邮箱别名已添加。",
            )
        }
    }

    fun updateGoogleAlias(
        accountId: String,
        aliasId: String,
        aliasStatus: String,
        openAiStatus: String,
        note: String,
    ) = persistGoogleAccounts(
        transform = { accounts ->
            val now = System.currentTimeMillis()
            accounts.map { account ->
                if (account.id != accountId) account else account.copy(
                    aliases = account.aliases.map { alias ->
                        if (alias.id != aliasId) alias else alias.copy(
                            aliasStatus = aliasStatus,
                            openAiStatus = openAiStatus,
                            registeredAt = if (openAiStatus == "registered") alias.registeredAt ?: now else null,
                            lastVerifiedAt = now,
                            note = note.trim(),
                        )
                    },
                )
            }
        },
        successMessage = "别名状态已更新。",
    )

    fun deleteGoogleAlias(accountId: String, aliasId: String) = persistGoogleAccounts(
        transform = { accounts ->
            accounts.map { account ->
                if (account.id != accountId) account else account.copy(
                    aliases = account.aliases.filterNot { it.id == aliasId },
                )
            }
        },
        successMessage = "邮箱别名已删除。",
    )

    fun loadGoogleAccounts() {
        if (mutableState.value.googleAccountsLoaded || mutableState.value.user == null) return
        scope.launch {
            val localResult = runCatching { withContext(Dispatchers.IO) { googleAccountStore.read() } }
            val localAccounts = localResult.getOrDefault(emptyList())
            runCatching { api.googleAccounts() }
                .onSuccess { snapshot ->
                    if (snapshot.accounts.isEmpty() && localAccounts.isNotEmpty()) {
                        mutableState.update {
                            it.copy(
                                googleAccounts = localAccounts,
                                googleAccountsLoaded = true,
                                googleAccountsRevision = snapshot.revision,
                                googleAccountMigrationPending = true,
                                googleAccountsRemoteReady = false,
                                error = null,
                                message = "发现本机邮箱记录，请选择是否上传到服务器。",
                            )
                        }
                    } else {
                        runCatching { withContext(Dispatchers.IO) { googleAccountStore.write(snapshot.accounts) } }
                        mutableState.update {
                            it.copy(
                                googleAccounts = snapshot.accounts,
                                googleAccountsLoaded = true,
                                googleAccountsRevision = snapshot.revision,
                                googleAccountMigrationPending = false,
                                googleAccountsRemoteReady = true,
                                error = null,
                            )
                        }
                    }
                }
                .onFailure { error ->
                    handleFeatureRequestFailure(error, onSessionExpired)
                    mutableState.update {
                        it.copy(
                            googleAccounts = localAccounts,
                            googleAccountsLoaded = true,
                            googleAccountsRevision = 0,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = false,
                            error = if (localResult.isFailure && localAccounts.isEmpty()) {
                                localResult.exceptionOrNull()?.message ?: "Google 邮箱台账读取失败。"
                            } else {
                                error.message ?: "服务器暂时不可用，当前显示本机缓存。"
                            },
                        )
                    }
                }
        }
    }

    fun uploadLocalGoogleAccounts() {
        if (!mutableState.value.googleAccountMigrationPending) return
        persistGoogleAccounts(
            transform = { it },
            successMessage = "本机邮箱记录已上传到服务器。",
        )
    }

    fun discardLocalGoogleAccounts() {
        if (mutableState.value.busyAction != null || !mutableState.value.googleAccountMigrationPending) return
        scope.launch {
            mutableState.update { it.copy(busyAction = "google-accounts", error = null, message = null) }
            runCatching { withContext(Dispatchers.IO) { googleAccountStore.clear() } }
                .onSuccess {
                    mutableState.update {
                        it.copy(
                            googleAccounts = emptyList(),
                            googleAccountsLoaded = true,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = true,
                            busyAction = null,
                            message = "已清除本机缓存，服务器台账仍为空。",
                        )
                    }
                }
                .onFailure { error ->
                    handleFeatureRequestFailure(error, onSessionExpired)
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "本机缓存清除失败。")
                    }
                }
        }
    }

    private fun persistGoogleAccounts(
        transform: (List<GoogleAccountRecord>) -> List<GoogleAccountRecord>,
        successMessage: String,
    ) {
        val current = mutableState.value
        if (current.busyAction != null) return
        if (!current.googleAccountsRemoteReady && !current.googleAccountMigrationPending) {
            setGoogleAccountError("服务器暂时不可用，邮箱台账当前为只读缓存。")
            return
        }
        scope.launch {
            mutableState.update { it.copy(busyAction = "google-accounts", error = null, message = null) }
            runCatching {
                val accounts = transform(mutableState.value.googleAccounts)
                val snapshot = api.replaceGoogleAccounts(accounts, mutableState.value.googleAccountsRevision)
                withContext(Dispatchers.IO) { googleAccountStore.write(snapshot.accounts) }
                snapshot
            }.onSuccess { snapshot ->
                mutableState.update {
                    it.copy(
                        googleAccounts = snapshot.accounts,
                        googleAccountsLoaded = true,
                        googleAccountsRevision = snapshot.revision,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = true,
                        busyAction = null,
                        message = successMessage,
                    )
                }
            }.onFailure { error ->
                handleFeatureRequestFailure(error, onSessionExpired)
                if (error is ApiException && error.code == "GOOGLE_ACCOUNT_REVISION_CONFLICT") {
                    mutableState.update {
                        it.copy(
                            busyAction = null,
                            googleAccountsLoaded = false,
                            googleAccountsRemoteReady = false,
                            error = "服务器上的邮箱台账已更新，正在重新加载。",
                        )
                    }
                    loadGoogleAccounts()
                } else {
                    mutableState.update {
                        it.copy(busyAction = null, error = error.message ?: "Google 邮箱台账保存失败。")
                    }
                }
            }
        }
    }

    private fun setGoogleAccountError(message: String) {
        mutableState.update { it.copy(error = message, message = null) }
    }

    private fun normalizeGoogleTags(raw: String): List<String>? {
        val tags = raw.split(',', '，', ';', '；', '\n')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
        if (tags.size > 20 || tags.any { it.length > 40 }) {
            setGoogleAccountError("标签最多 20 个，每个标签不超过 40 个字符。")
            return null
        }
        return tags
    }

    private fun parseGoogleReviewDate(raw: String): Long? = runCatching {
        LocalDate.parse(raw.trim())
            .atStartOfDay(ZoneId.systemDefault())
            .toInstant()
            .toEpochMilli()
    }.getOrNull()

    private fun normalizeGoogleAddress(address: String): String = address.trim().lowercase()

    private fun isValidGoogleAddress(address: String): Boolean =
        address.length <= 254 && address.count { it == '@' } == 1 &&
            address.substringBefore('@').isNotBlank() &&
            address.substringAfter('@').contains('.') &&
            address.none(Char::isWhitespace)

}
