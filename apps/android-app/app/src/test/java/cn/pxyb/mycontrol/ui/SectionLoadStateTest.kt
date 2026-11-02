package cn.pxyb.mycontrol.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [AppUiState.withSectionLoadState] 是分区状态的唯一写入口。
 *
 * [AppUiState.offlineMode] 与 [AppUiState.cachedAtMillis] 由分区状态派生而非独立维护，
 * 这里锁住派生规则：只要还有分区依赖缓存就保持离线态，最后一个分区回到实时数据时
 * 必须同时清掉离线标记。否则界面会出现「数据已刷新、离线横幅还在」的错位。
 */
class SectionLoadStateTest {
    @Test
    fun `cache fallback on one section raises the global offline flag`() {
        val next = AppUiState().withSectionLoadState(DataSection.Iot) {
            it.copy(updatedAtMillis = 1_000L, fromCache = true, cachedAtMillis = 500L, cacheFallback = true)
        }

        assertTrue(next.offlineMode)
        assertEquals(500L, next.cachedAtMillis)
        assertEquals(1_000L, next.sectionLoadStates[DataSection.Iot]?.updatedAtMillis)
    }

    @Test
    fun `clearing the last cache fallback clears the global offline flag`() {
        val cached = AppUiState(
            sectionLoadStates = mapOf(
                DataSection.Iot to SectionLoadState(
                    updatedAtMillis = 1_000L,
                    fromCache = true,
                    cachedAtMillis = 500L,
                    cacheFallback = true,
                ),
            ),
            offlineMode = true,
            cachedAtMillis = 500L,
        )

        val refreshed = cached.withSectionLoadState(DataSection.Iot) {
            it.copy(updatedAtMillis = 2_000L, fromCache = false, cachedAtMillis = null, cacheFallback = false)
        }

        assertFalse(refreshed.offlineMode)
        assertNull(refreshed.cachedAtMillis)
        assertEquals(2_000L, refreshed.sectionLoadStates[DataSection.Iot]?.updatedAtMillis)
    }

    @Test
    fun `older cache timestamp wins while several sections fall back`() {
        val state = AppUiState(
            sectionLoadStates = mapOf(
                DataSection.Overview to SectionLoadState(cacheFallback = true, cachedAtMillis = 900L),
                DataSection.Backup to SectionLoadState(cacheFallback = true, cachedAtMillis = 300L),
            ),
        )

        val next = state.withSectionLoadState(DataSection.Ct8) { it.copy(updatedAtMillis = 1L) }

        assertTrue(next.offlineMode)
        assertEquals(300L, next.cachedAtMillis)
    }

    @Test
    fun `sections that never fell back do not contribute a cache timestamp`() {
        val next = AppUiState().withSectionLoadState(DataSection.Backup) {
            it.copy(updatedAtMillis = 1L, cachedAtMillis = 800L)
        }

        assertFalse(next.offlineMode)
        assertNull(next.cachedAtMillis)
        assertEquals(800L, next.sectionLoadStates[DataSection.Backup]?.cachedAtMillis)
    }

    @Test
    fun `writing one section keeps the others untouched`() {
        val state = AppUiState(
            sectionLoadStates = mapOf(
                DataSection.Overview to SectionLoadState(updatedAtMillis = 10L, fromCache = true, cachedAtMillis = 5L),
                DataSection.Backup to SectionLoadState(error = "备份服务不可达。"),
            ),
        )

        val next = state.withSectionLoadState(DataSection.Iot) { it.copy(updatedAtMillis = 20L) }

        assertEquals(10L, next.sectionLoadStates[DataSection.Overview]?.updatedAtMillis)
        assertEquals("备份服务不可达。", next.sectionLoadStates[DataSection.Backup]?.error)
        assertEquals(20L, next.sectionLoadStates[DataSection.Iot]?.updatedAtMillis)
        assertEquals(3, next.sectionLoadStates.size)
    }
}
