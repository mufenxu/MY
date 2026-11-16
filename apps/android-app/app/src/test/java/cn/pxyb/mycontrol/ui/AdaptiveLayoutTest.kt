package cn.pxyb.mycontrol.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AdaptiveWindowInfo
import cn.pxyb.mycontrol.ui.components.layout.WindowHeightSizeClass
import cn.pxyb.mycontrol.ui.components.layout.WindowWidthSizeClass
import cn.pxyb.mycontrol.ui.components.layout.adaptiveGridColumnCount
import cn.pxyb.mycontrol.ui.components.layout.computeHeightSizeClass
import cn.pxyb.mycontrol.ui.components.layout.computeWidthSizeClass
import cn.pxyb.mycontrol.ui.navigation.AppRoute
import cn.pxyb.mycontrol.ui.navigation.contentMaxWidthForRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveLayoutTest {
    private fun window(width: Dp, height: Dp) = AdaptiveWindowInfo(
        widthSizeClass = computeWidthSizeClass(width),
        heightSizeClass = computeHeightSizeClass(height),
        windowWidth = width,
        windowHeight = height,
    )

    @Test
    fun widthClassSwitchesAtSixHundredAndEightHundredForty() {
        assertEquals(WindowWidthSizeClass.Compact, computeWidthSizeClass(599.dp))
        assertEquals(WindowWidthSizeClass.Medium, computeWidthSizeClass(600.dp))
        assertEquals(WindowWidthSizeClass.Medium, computeWidthSizeClass(839.dp))
        assertEquals(WindowWidthSizeClass.Expanded, computeWidthSizeClass(840.dp))
    }

    @Test
    fun heightClassSwitchesAtFourEightyAndNineHundred() {
        assertEquals(WindowHeightSizeClass.Compact, computeHeightSizeClass(479.dp))
        assertEquals(WindowHeightSizeClass.Medium, computeHeightSizeClass(480.dp))
        assertEquals(WindowHeightSizeClass.Expanded, computeHeightSizeClass(900.dp))
    }

    @Test
    fun navigationRailOnlyReplacesBottomBarOnExpandedWindows() {
        assertTrue(window(1280.dp, 800.dp).usesNavigationRail)
        assertTrue(window(840.dp, 1200.dp).usesNavigationRail)
        // 手机与平板竖屏、分屏窄窗保留底部胶囊导航。
        assertFalse(window(390.dp, 844.dp).usesNavigationRail)
        assertFalse(window(700.dp, 1000.dp).usesNavigationRail)
    }

    @Test
    fun navigationRailFallsBackToBottomBarWhenWindowIsTooShort() {
        // 手机横屏宽度达到展开档，但高度放不下导航轨的全部入口。
        assertFalse(window(900.dp, 400.dp).usesNavigationRail)
    }

    @Test
    fun routesCapContentWidthByPurpose() {
        assertEquals(760.dp, contentMaxWidthForRoute(AppRoute.DailyNews))
        assertEquals(720.dp, contentMaxWidthForRoute(AppRoute.NotificationSettings))
        assertEquals(1200.dp, contentMaxWidthForRoute(AppRoute.Overview))
        assertEquals(1200.dp, contentMaxWidthForRoute(AppRoute.Agenda))
        assertEquals(1120.dp, contentMaxWidthForRoute(AppRoute.Profile))
    }

    @Test
    fun adaptiveGridAddsColumnsWithWidthAndDropsThemForLargeText() {
        assertEquals(1, adaptiveGridColumnCount(360.dp, fontScale = 1f, minCellWidth = 360.dp, maxColumns = 3))
        assertEquals(2, adaptiveGridColumnCount(732.dp, fontScale = 1f, minCellWidth = 360.dp, maxColumns = 3))
        assertEquals(3, adaptiveGridColumnCount(1200.dp, fontScale = 1f, minCellWidth = 360.dp, maxColumns = 3))
        assertEquals(2, adaptiveGridColumnCount(1200.dp, fontScale = 1.5f, minCellWidth = 360.dp, maxColumns = 3))
    }
}
