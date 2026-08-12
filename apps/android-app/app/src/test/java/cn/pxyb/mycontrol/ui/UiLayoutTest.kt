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
}
