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
import cn.pxyb.mycontrol.data.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class GoogleAccountsController(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val googleAccountStore: GoogleAccountStore,
    private val sessionStore: SessionStore,
    // These records also feed overview and global search; only account mutations share a resource lock.
    private val mutableState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
    private val actions: ActionStateHolder,
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    private val syncMutex = Mutex()
    private var loadJob: Job? = null

    fun cancelPending() {
        scope.coroutineContext.cancelChildren()
        loadJob = null
        mutableState.update { it.copy(googleAccountsLoading = false) }
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

    fun loadGoogleAccounts(force: Boolean = false) {
        val current = mutableState.value
        if (current.user == null || current.locked || current.busyAction == "logout" || loadJob?.isActive == true ||
            !force && current.googleAccountsLoaded
        ) return
        mutableState.update { it.copy(googleAccountsLoading = true, googleAccountsError = null) }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            var localAccounts = emptyList<GoogleAccountRecord>()
            var localReadError: Throwable? = null
            try {
                syncMutex.withLock {
                    api.withRequestMetadata(allowCache = false) {
                        val localResult = runCatching { withStore { read() } }
                            .onFailure { handleFeatureRequestFailure(it, onSessionExpired) }
                        localAccounts = localResult.getOrDefault(emptyList())
                        localReadError = localResult.exceptionOrNull()
                        val snapshot = api.googleAccounts()
                        val migrationPending = snapshot.accounts.isEmpty() && localAccounts.isNotEmpty()
                        if (!migrationPending) {
                            runCatching { withStore { write(snapshot.accounts) } }
                                .onFailure { handleFeatureRequestFailure(it, onSessionExpired) }
                        }
                        mutableState.update {
                            it.copy(
                                googleAccounts = if (migrationPending) localAccounts else snapshot.accounts,
                                googleAccountsLoaded = true,
                                googleAccountsRevision = snapshot.revision,
                                googleAccountMigrationPending = migrationPending,
                                googleAccountsRemoteReady = !migrationPending,
                                googleAccountsError = null,
                                error = null,
                                message = if (migrationPending) "发现本机邮箱记录，请选择是否上传到服务器。" else it.message,
                            )
                        }
                    }
                }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, onSessionExpired)
                mutableState.update {
                    it.copy(
                        googleAccounts = it.googleAccounts.ifEmpty { localAccounts },
                        googleAccountsLoaded = false,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = false,
                        googleAccountsError = if (localReadError != null && localAccounts.isEmpty()) {
                            localReadError?.message ?: "Google 邮箱台账读取失败。"
                        } else {
                            error.message ?: "服务器暂时不可用，当前显示本机缓存。"
                        },
                    )
                }
            } finally {
                if (loadJob === currentCoroutineContext()[Job]) {
                    loadJob = null
                    mutableState.update { it.copy(googleAccountsLoading = false) }
                }
            }
        }
        loadJob = job
        job.start()
    }

    fun uploadLocalGoogleAccounts() {
        if (!mutableState.value.googleAccountMigrationPending) return
        persistGoogleAccounts(
            transform = { it },
            successMessage = "本机邮箱记录已上传到服务器。",
        )
    }

    fun discardLocalGoogleAccounts() {
        if (!mutableState.value.googleAccountMigrationPending) return
        actions.run("google-accounts", "已清除本机缓存，服务器台账仍为空。", failureMessage = "本机缓存清除失败。") {
            syncMutex.withLock {
                withStore { clear() }
                mutableState.update {
                    it.copy(
                        googleAccounts = emptyList(),
                        googleAccountsLoaded = true,
                        googleAccountMigrationPending = false,
                        googleAccountsRemoteReady = true,
                    )
                }
            }
        }
    }

    private fun persistGoogleAccounts(
        transform: (List<GoogleAccountRecord>) -> List<GoogleAccountRecord>,
        successMessage: String,
    ) {
        val current = mutableState.value
        if (!current.googleAccountsRemoteReady && !current.googleAccountMigrationPending) {
            setGoogleAccountError("服务器暂时不可用，邮箱台账当前为只读缓存。")
            return
        }
        actions.run("google-accounts", successMessage, failureMessage = "Google 邮箱台账保存失败。") {
            syncMutex.withLock {
                try {
                    if (!mutableState.value.googleAccountsRemoteReady && !mutableState.value.googleAccountMigrationPending) {
                        throw IllegalStateException("服务器暂时不可用，请重新加载邮箱台账后再修改。")
                    }
                    val accounts = transform(mutableState.value.googleAccounts)
                    val snapshot = api.replaceGoogleAccounts(accounts, mutableState.value.googleAccountsRevision)
                    withStore { write(snapshot.accounts) }
                    mutableState.update {
                        it.copy(
                            googleAccounts = snapshot.accounts,
                            googleAccountsLoaded = true,
                            googleAccountsRevision = snapshot.revision,
                            googleAccountMigrationPending = false,
                            googleAccountsRemoteReady = true,
                        )
                    }
                } catch (error: Throwable) {
                    if (error is ApiException && error.code == "GOOGLE_ACCOUNT_REVISION_CONFLICT") {
                        mutableState.update { it.copy(googleAccountsLoaded = false, googleAccountsRemoteReady = false) }
                        loadGoogleAccounts()
                        throw IllegalStateException("服务器上的邮箱台账已更新，正在重新加载。", error)
                    }
                    throw error
                }
            }
        }
    }

    private suspend fun <T> withStore(block: GoogleAccountStore.() -> T): T {
        val session = api.http.currentSession()
        return withContext(Dispatchers.IO) { sessionStore.withRequestSession(session) { googleAccountStore.block() } }
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
