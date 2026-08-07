package cn.pxyb.mycontrol.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class GoogleAccountNavigationTest {
    @Test
    fun googleAccountDeskReturnsToItsActualParent() {
        assertEquals(MainTab.Overview, parentTabForSubScreen("google-accounts", "overview"))
        assertEquals(MainTab.Profile, parentTabForSubScreen("google-accounts", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("google-accounts", "search"))
    }

    @Test
    fun standardSecondaryPagesHaveStableParents() {
        assertEquals(MainTab.Profile, parentTabForSubScreen("account", "overview"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("operations", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("search", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("today", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("notifications", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("insights", "profile"))
        assertEquals(MainTab.Overview, parentTabForSubScreen("scenes", "profile"))
    }

    @Test
    fun mainPagesAreNotTreatedAsSecondaryPages() {
        assertEquals(null, parentTabForSubScreen("overview", null))
        assertEquals(null, parentTabForSubScreen("profile", null))
    }
}
