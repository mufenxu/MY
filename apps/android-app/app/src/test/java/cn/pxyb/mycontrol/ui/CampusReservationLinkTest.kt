package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.feature.campus.reservation.campusReservationRedirect
import cn.pxyb.mycontrol.ui.navigation.AppRoute
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.parentTabForSubScreen
import org.junit.Assert.assertEquals
import org.junit.Test

class CampusReservationLinkTest {
    @Test
    fun opensCampusReservationSectionInsideManagedCampusApp() {
        assertEquals("/apps/campus/#reservation", campusReservationRedirect())
    }

    @Test
    fun librarySeatReservationBelongsToOverviewSubScreen() {
        assertEquals(MainTab.Overview, parentTabForSubScreen(AppRoute.LibrarySeatReservation, null))
    }
}
