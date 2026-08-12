package cn.pxyb.mycontrol.ui

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
}
