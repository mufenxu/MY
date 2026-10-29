package cn.pxyb.mycontrol.ui.feature.projects

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.pxyb.mycontrol.data.GitHubProfileRecord
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * GitHub 项目页的渲染级回归。
 *
 * 该页的数据原先平铺在 AppUiState 里，现已下沉为 GitHubProjectsUiState。
 * 这些用例锁住拆分前后的界面契约：仓库列表、账号卡片、空态，
 * 以及「点开仓库 → 通知外壳拉取 → 展示 Releases」这条接线。
 */
@RunWith(AndroidJUnit4::class)
class GitHubProjectsScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val loadCalls = mutableListOf<String>()

    @Test
    fun 仓库列表展示全部仓库() {
        showScreen(
            repositories = listOf(repository("me/alpha"), repository("me/beta")),
            loaded = true,
        )

        compose.onNodeWithText("me/alpha").assertExists()
        compose.onNodeWithText("me/beta").assertExists()
    }

    @Test
    fun 账号资料展示登录名与仓库统计() {
        showScreen(
            loaded = true,
            profile = GitHubProfileRecord(
                login = "mufenxu",
                name = "牧风徐",
                avatarUrl = null,
                htmlUrl = null,
                bio = null,
                publicRepos = 12,
                followers = 3,
                following = 5,
            ),
        )

        compose.onNodeWithText("牧风徐").assertExists()
        compose.onNodeWithText("@mufenxu · 当前 GitHub 账号").assertExists()
    }

    @Test
    fun 加载完成但没有仓库时展示空态() {
        showScreen(repositories = emptyList(), loaded = true)

        compose.onNodeWithText("没有可展示的仓库").assertExists()
    }

    @Test
    fun 点开仓库时按owner与repo拉取并展示对应Releases() {
        val releasesRepo = mutableStateOf<String?>(null)
        val releases = mutableStateOf(emptyList<GitHubReleaseRecord>())
        val releasesLoaded = mutableStateOf(false)

        compose.setContent {
            MYControlTheme(darkTheme = false) {
                GitHubProjectsScreen(
                    repositories = listOf(repository("me/alpha")),
                    loaded = true,
                    busy = false,
                    profile = null,
                    profileLoaded = true,
                    releases = releases.value,
                    releasesLoaded = releasesLoaded.value,
                    releasesRepoFullName = releasesRepo.value,
                    releasesBusy = false,
                    contentPadding = PaddingValues(0.dp),
                    onBack = {},
                    onRefresh = {},
                    onLoadReleases = { owner, repo ->
                        loadCalls += "$owner/$repo"
                        releasesRepo.value = "me/alpha"
                        releases.value = listOf(release("v1.2.0"))
                        releasesLoaded.value = true
                    },
                    onCreateRelease = { _, _, _, _, _, _, _ -> },
                    onUpdateVisibility = { _, _, _ -> },
                )
            }
        }

        compose.onNodeWithText("me/alpha").performClick()
        compose.waitForIdle()

        assertEquals(listOf("me/alpha"), loadCalls)
        // 标题用 name，副标题用 tagName，两者都渲染才算真的拿到了该仓库的 Releases。
        compose.onNodeWithText("Release v1.2.0").assertExists()
        compose.onNodeWithText("v1.2.0").assertExists()
    }

    private fun showScreen(
        repositories: List<GitHubRepositoryRecord> = emptyList(),
        loaded: Boolean = false,
        profile: GitHubProfileRecord? = null,
    ) {
        compose.setContent {
            MYControlTheme(darkTheme = false) {
                GitHubProjectsScreen(
                    repositories = repositories,
                    loaded = loaded,
                    busy = false,
                    profile = profile,
                    profileLoaded = profile != null || loaded,
                    releases = emptyList(),
                    releasesLoaded = false,
                    releasesRepoFullName = null,
                    releasesBusy = false,
                    contentPadding = PaddingValues(0.dp),
                    onBack = {},
                    onRefresh = {},
                    onLoadReleases = { _, _ -> },
                    onCreateRelease = { _, _, _, _, _, _, _ -> },
                    onUpdateVisibility = { _, _, _ -> },
                )
            }
        }
    }

    private fun repository(fullName: String) = GitHubRepositoryRecord(
        name = fullName.substringAfter('/'),
        fullName = fullName,
        description = null,
        visibility = "public",
        isPrivate = false,
        htmlUrl = null,
        language = "Kotlin",
        defaultBranch = "main",
        updatedAt = "2026-10-01T00:00:00Z",
        starCount = 0,
        forkCount = 0,
        fork = false,
        archived = false,
    )

    private fun release(tag: String) = GitHubReleaseRecord(
        tagName = tag,
        name = "Release $tag",
        body = null,
        draft = false,
        prerelease = false,
        publishedAt = "2026-10-01T00:00:00Z",
        htmlUrl = null,
        targetCommitish = "main",
        assetsCount = 0,
    )
}
