package cn.pxyb.mycontrol.ui.feature.projects

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.GitHubProfileRecord
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * GitHub 域的界面状态。
 *
 * 迁移自 [cn.pxyb.mycontrol.ui.AppUiState] 的 7 个平铺字段：仓库、账号资料与 Releases
 * 三份数据各自带「已加载」标记，切换仓库时靠 [releasesRepoFullName] 判断是否需要清空列表。
 */
@Immutable
data class GitHubProjectsUiState(
    val repositories: List<GitHubRepositoryRecord> = emptyList(),
    val repositoriesLoaded: Boolean = false,
    val profile: GitHubProfileRecord? = null,
    val profileLoaded: Boolean = false,
    val releases: List<GitHubReleaseRecord> = emptyList(),
    val releasesLoaded: Boolean = false,
    val releasesRepoFullName: String? = null,
    val visibilityBusy: Boolean = false,
    val releasesBusy: Boolean = false,
)

/**
 * 切到 [fullName] 这个仓库时的状态转移。
 *
 * 只有目标仓库与当前不同才清空列表：同一仓库下拉刷新时保留旧列表，
 * 避免界面在请求返回前闪成空白。
 */
internal fun GitHubProjectsUiState.switchingReleasesTo(fullName: String): GitHubProjectsUiState = copy(
    releases = if (releasesRepoFullName == fullName) releases else emptyList(),
    releasesLoaded = false,
    releasesRepoFullName = fullName,
)

class GitHubProjectsStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val canRequest: () -> Boolean,
    private val onError: (String?) -> Unit,
    private val onMessage: (String) -> Unit,
    private val confirmationMutex: Mutex,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<GitHubProjectsUiState>(parentScope, GitHubProjectsUiState(), onSessionExpired) {
    private var repositoriesJob: Job? = null
    private var profileJob: Job? = null
    private var releasesJob: Job? = null

    override fun clearPendingState(current: GitHubProjectsUiState): GitHubProjectsUiState =
        current.copy(visibilityBusy = false, releasesBusy = false)

    fun loadRepositories() {
        if (!canRequest() || repositoriesJob?.isActive == true) return
        repositoriesJob = scope.launch {
            runCatching { api.githubRepositories() }
                .onSuccess { repositories ->
                    mutableState.update {
                        it.copy(repositories = repositories, repositoriesLoaded = true)
                    }
                }
                .onFailure { error ->
                    handleRequestFailure(error)
                    onError(error.message ?: "GitHub 仓库加载失败。")
                    mutableState.update { it.copy(repositoriesLoaded = true) }
                }
        }
    }

    fun loadProfile() {
        if (!canRequest() || profileJob?.isActive == true) return
        profileJob = scope.launch {
            runCatching { api.githubProfile() }
                .onSuccess { profile ->
                    mutableState.update { it.copy(profile = profile, profileLoaded = true) }
                }
                .onFailure { error ->
                    handleRequestFailure(error)
                    onError(error.message ?: "GitHub 账号资料加载失败。")
                    mutableState.update { it.copy(profileLoaded = true) }
                }
        }
    }

    fun refresh() {
        onError(null)
        loadProfile()
        loadRepositories()
    }

    /**
     * 加载某个仓库的 Releases。切换仓库时会先清空上一仓库的列表，
     * 重复加载同一仓库则保留现有内容直到新结果返回。
     */
    fun loadReleases(owner: String, repo: String) {
        if (!canRequest()) return
        val fullName = "$owner/$repo"
        releasesJob?.cancel()
        releasesJob = scope.launch {
            onError(null)
            mutableState.update { it.switchingReleasesTo(fullName) }
            runCatching { api.githubReleases(owner, repo) }
                .onSuccess { releases ->
                    mutableState.update {
                        it.copy(
                            releases = releases,
                            releasesLoaded = true,
                            releasesRepoFullName = fullName,
                        )
                    }
                }
                .onFailure { error ->
                    handleRequestFailure(error)
                    onError(error.message ?: "GitHub Releases 加载失败。")
                    mutableState.update { it.copy(releasesLoaded = true) }
                }
        }
    }

    fun updateVisibility(
        owner: String,
        repo: String,
        visibility: String,
        confirmation: suspend () -> Boolean,
    ) {
        if (!canRequest()) return
        val current = mutableState.value
        if (current.visibilityBusy || current.releasesBusy) {
            onError("相关操作正在进行，请稍后重试。")
            return
        }
        scope.launch {
            mutableState.update { it.copy(visibilityBusy = true) }
            try {
                val confirmed = confirmationMutex.withLock { confirmation() }
                if (!confirmed) return@launch
                api.updateGitHubVisibility(owner, repo, visibility)
                val repositories = api.githubRepositories()
                mutableState.update {
                    it.copy(repositories = repositories, repositoriesLoaded = true)
                }
                onMessage("仓库可见性已更新。")
            } catch (error: Throwable) {
                handleRequestFailure(error)
                onError(error.message ?: "操作失败，请稍后重试。")
            } finally {
                mutableState.update { it.copy(visibilityBusy = false) }
            }
        }
    }

    fun createRelease(
        owner: String,
        repo: String,
        tag: String,
        name: String,
        body: String,
        draft: Boolean,
        prerelease: Boolean,
        confirmation: suspend () -> Boolean,
    ) {
        if (!canRequest()) return
        val current = mutableState.value
        if (current.releasesBusy || current.visibilityBusy) {
            onError("相关操作正在进行，请稍后重试。")
            return
        }
        scope.launch {
            mutableState.update { it.copy(releasesBusy = true) }
            try {
                val confirmed = confirmationMutex.withLock { confirmation() }
                if (!confirmed) return@launch
                api.createGitHubRelease(owner, repo, tag, name, body, draft, prerelease)
                mutableState.update { it.copy(releasesBusy = false) }
                onMessage("Release 已创建。")
                loadReleases(owner, repo)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                onError(error.message ?: "操作失败，请稍后重试。")
            } finally {
                mutableState.update { it.copy(releasesBusy = false) }
            }
        }
    }
}
