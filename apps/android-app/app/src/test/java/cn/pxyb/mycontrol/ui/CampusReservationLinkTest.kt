package cn.pxyb.mycontrol.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class CampusReservationLinkTest {
    @Test
    fun opensCampusReservationSectionInsideManagedCampusApp() {
        assertEquals("/apps/campus/#reservation", campusReservationRedirect())
    }
}
