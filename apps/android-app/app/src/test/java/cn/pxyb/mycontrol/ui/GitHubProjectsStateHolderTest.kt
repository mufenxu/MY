package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.ui.feature.projects.GitHubProjectsUiState
import cn.pxyb.mycontrol.ui.feature.projects.switchingReleasesTo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GitHubProjectsStateHolderTest {
    @Test
    fun `switching to another repository clears the previous release list`() {
        val state = GitHubProjectsUiState(
            releases = listOf(release("v1.0.0")),
            releasesLoaded = true,
            releasesRepoFullName = "me/alpha",
        )

        val switched = state.switchingReleasesTo("me/beta")

        assertEquals("me/beta", switched.releasesRepoFullName)
        assertTrue(switched.releases.isEmpty())
        assertFalse(switched.releasesLoaded)
    }

    @Test
    fun `reloading the same repository keeps the current list until the request returns`() {
        val releases = listOf(release("v1.0.0"))
        val state = GitHubProjectsUiState(
            releases = releases,
            releasesLoaded = true,
            releasesRepoFullName = "me/alpha",
        )

        val reloaded = state.switchingReleasesTo("me/alpha")

        assertEquals(releases, reloaded.releases)
        assertFalse(reloaded.releasesLoaded)
    }

    @Test
    fun `first load has nothing to keep`() {
        val switched = GitHubProjectsUiState().switchingReleasesTo("me/alpha")

        assertTrue(switched.releases.isEmpty())
        assertFalse(switched.releasesLoaded)
        assertEquals("me/alpha", switched.releasesRepoFullName)
    }

    private fun release(tag: String) = GitHubReleaseRecord(
        tagName = tag,
        name = tag,
        body = null,
        draft = false,
        prerelease = false,
        publishedAt = null,
        htmlUrl = null,
        targetCommitish = "main",
        assetsCount = 0,
    )
}
