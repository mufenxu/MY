package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.navigation.restoredMainTab
import cn.pxyb.mycontrol.ui.navigation.restoredWorkspaceDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NavigationStateTest {
    @Test
    fun restoresKnownNavigationValues() {
        assertEquals(MainTab.Tools, restoredMainTab("Tools"))
        assertEquals(WorkspaceDestination.Today, restoredWorkspaceDestination("Today"))
    }

    @Test
    fun ignoresUnknownNavigationValues() {
        assertNull(restoredMainTab("missing"))
        assertNull(restoredWorkspaceDestination("missing"))
    }

    @Test
    fun migratesLegacyEventsTabToNotifications() {
        assertEquals("Notifications", restoredMainTab("Events")?.name)
    }
}
