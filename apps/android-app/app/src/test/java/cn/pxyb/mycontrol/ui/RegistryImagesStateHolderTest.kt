package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.AcrImageCatalog
import cn.pxyb.mycontrol.data.AcrImageGroup
import cn.pxyb.mycontrol.data.AcrImageMutation
import cn.pxyb.mycontrol.data.AcrImageOutcome
import cn.pxyb.mycontrol.data.AcrImageTag
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RegistryImagesStateHolderTest {
    @Test
    fun `mutation summary counts deletions, skips and the remaining plan`() {
        val summary = summarizeAcrMutation(
            AcrImageMutation(
                deleted = listOf(outcome("platform-api-111111111111")),
                skipped = listOf(outcome("platform-api-latest", "protected")),
                failed = emptyList(),
                remaining = 2,
            ),
            "删除",
        )

        assertEquals("已删除 1 个镜像版本，跳过 1 个，还有 2 个待下一次清理。", summary)
    }

    @Test
    fun `mutation summary reports failures without inventing a remaining plan`() {
        val summary = summarizeAcrMutation(
            AcrImageMutation(
                deleted = emptyList(),
                skipped = emptyList(),
                failed = listOf(outcome("platform-api-222222222222", "delete-failed")),
            ),
            "清理",
        )

        assertEquals("已清理 0 个镜像版本，失败 1 个。", summary)
    }

    @Test
    fun `catalog tag lookup only matches candidate groups`() {
        val catalog = catalog(tags = listOf("platform-api-111111111111"))

        assertTrue(catalog.hasTag("platform-api-111111111111"))
        assertFalse(catalog.hasTag("platform-api-latest"))
        assertFalse(catalog.hasTag("platform-api-999999999999"))
    }

    @Test
    fun `protected reasons keep Chinese labels for every known classification`() {
        assertEquals("生产标签", protectedReasonLabel("production"))
        assertEquals("当前部署", protectedReasonLabel("configured"))
        assertEquals("构建缓存", protectedReasonLabel("internal"))
        assertEquals("受保护", protectedReasonLabel("in-use"))
    }

    @Test
    fun `timestamps convert to local time and reject invalid input`() {
        assertNotNull(formatAcrTimestamp("2026-09-11T10:00:00Z"))
        assertNull(formatAcrTimestamp(""))
        assertNull(formatAcrTimestamp(null))
        assertNull(formatAcrTimestamp("not-a-timestamp"))
    }

    private fun outcome(tag: String, reason: String? = null) = AcrImageOutcome(tag = tag, digest = null, reason = reason)

    private fun catalog(tags: List<String>) = AcrImageCatalog(
        repository = "crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my",
        registry = "crpi-ijf5w3rczq2vwnig.cn-beijing.personal.cr.aliyuncs.com",
        tagCount = tags.size,
        credentialsConfigured = true,
        canDelete = true,
        timelineAvailable = true,
        unknownTimelineTags = 0,
        protectedTags = emptyList(),
        groups = listOf(
            AcrImageGroup(
                prefix = "platform-api-",
                tags = tags.map { AcrImageTag(tag = it, revision = it.takeLast(12), createdAt = null) },
            ),
        ),
        otherTags = emptyList(),
        maxBatch = 60,
        fetchedAt = null,
    )
}
