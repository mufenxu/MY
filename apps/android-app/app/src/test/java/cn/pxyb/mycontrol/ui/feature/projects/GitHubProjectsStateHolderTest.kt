package cn.pxyb.mycontrol.ui.feature.projects

import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class GitHubProjectsStateHolderTest {

    @Test
    fun `switching to a different repository clears stale releases`() {
        val stale = release("v1.0.0")
        val state = GitHubProjectsUiState(
            releases = listOf(stale),
            releasesLoaded = true,
            releasesRepoFullName = "mufenxu/MY",
        )

        val switched = state.switchingReleasesTo("mufenxu/other-repo")

        assertTrue(switched.releases.isEmpty())
        assertFalse(switched.releasesLoaded)
        assertEquals("mufenxu/other-repo", switched.releasesRepoFullName)
    }

    @Test
    fun `switching to the same repository keeps releases to avoid flashing blank`() {
        val kept = release("v1.0.0")
        val state = GitHubProjectsUiState(
            releases = listOf(kept),
            releasesLoaded = true,
            releasesRepoFullName = "mufenxu/MY",
        )

        val switched = state.switchingReleasesTo("mufenxu/MY")

        assertSame(kept, switched.releases.single())
        assertFalse(switched.releasesLoaded)
        assertEquals("mufenxu/MY", switched.releasesRepoFullName)
    }

    @Test
    fun `first switch from empty repository state clears releases`() {
        val state = GitHubProjectsUiState(
            releases = listOf(release("v0.9.0")),
            releasesLoaded = true,
            releasesRepoFullName = null,
        )

        val switched = state.switchingReleasesTo("mufenxu/MY")

        assertTrue(switched.releases.isEmpty())
        assertFalse(switched.releasesLoaded)
        assertEquals("mufenxu/MY", switched.releasesRepoFullName)
    }

    @Test
    fun `switching does not touch repositories profile or busy flags`() {
        val state = GitHubProjectsUiState(
            repositories = listOf(repository("mufenxu/MY")),
            repositoriesLoaded = true,
            profile = null,
            profileLoaded = false,
            releases = emptyList(),
            releasesLoaded = true,
            releasesRepoFullName = "mufenxu/MY",
            visibilityBusy = true,
            releasesBusy = true,
        )

        val switched = state.switchingReleasesTo("mufenxu/other-repo")

        assertEquals(1, switched.repositories.size)
        assertTrue(switched.repositoriesLoaded)
        assertNull(switched.profile)
        assertFalse(switched.profileLoaded)
        assertTrue(switched.visibilityBusy)
        assertTrue(switched.releasesBusy)
    }

    private fun release(tag: String) = GitHubReleaseRecord(
        tagName = tag,
        name = tag,
        body = "",
        draft = false,
        prerelease = false,
        publishedAt = null,
        htmlUrl = null,
        targetCommitish = null,
        assetsCount = 0,
    )

    private fun repository(fullName: String) = GitHubRepositoryRecord(
        name = fullName.substringAfter('/'),
        fullName = fullName,
        description = null,
        visibility = "public",
        isPrivate = false,
        htmlUrl = null,
        language = null,
        defaultBranch = "main",
        updatedAt = null,
        archived = false,
    )
}
