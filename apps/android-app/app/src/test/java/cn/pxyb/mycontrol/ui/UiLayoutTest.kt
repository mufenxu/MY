package cn.pxyb.mycontrol.ui

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

class UiLayoutTest {
    @Test
    fun quickActionsUseTwoColumnsForSmallOrLargeTextLayouts() {
        assertEquals(2, quickActionColumnCount(320.dp, fontScale = 1f))
        assertEquals(2, quickActionColumnCount(600.dp, fontScale = 1.3f))
    }

    @Test
    fun quickActionsUseFourColumnsOnWideLayouts() {
        assertEquals(4, quickActionColumnCount(720.dp, fontScale = 1f))
    }

    @Test
    fun unreadBadgeCapsLargeCounts() {
        assertEquals("", unreadBadgeLabel(0))
        assertEquals("9", unreadBadgeLabel(9))
        assertEquals("99+", unreadBadgeLabel(100))
    }

    @Test
    fun metricGridUsesFewerColumnsForLargeText() {
        assertEquals(2, metricGridColumnCount(400.dp, fontScale = 1.3f, maxColumns = 4))
        assertEquals(4, metricGridColumnCount(720.dp, fontScale = 1f, maxColumns = 4))
    }
}
