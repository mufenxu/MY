package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataUiState
import cn.pxyb.mycontrol.ui.feature.campus.mergingFreeClassrooms
import cn.pxyb.mycontrol.ui.feature.campus.mergingOverview
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CampusDataStateHolderTest {
    @Test
    fun `home refresh fills both the overview card and the empty result slot`() {
        val classrooms = CampusFreeClassrooms(rooms = 12)

        val merged = CampusDataUiState().mergingFreeClassrooms(classrooms)

        assertEquals(classrooms, merged.overview?.freeClassrooms)
        assertEquals(classrooms, merged.freeClassrooms)
    }

    @Test
    fun `home refresh keeps a user filtered result in place`() {
        val filtered = CampusFreeClassrooms(rooms = 3, dayLabel = "明天")
        val defaults = CampusFreeClassrooms(rooms = 40, dayLabel = "今天")
        val state = CampusDataUiState(overview = CampusOverview(cardBalance = "42.00"), freeClassrooms = filtered)

        val merged = state.mergingFreeClassrooms(defaults)

        assertEquals(defaults, merged.overview?.freeClassrooms)
        assertEquals(filtered, merged.freeClassrooms)
        assertEquals("42.00", merged.overview?.cardBalance)
    }

    @Test
    fun `overview merge only touches its own fields`() {
        val state = CampusDataUiState(
            overview = CampusOverview(cardBalance = "42.00", dormitory = "3-201"),
            timetable = null,
        )

        val merged = state.mergingOverview { it.copy(energyBalance = "18.60") }

        assertEquals("42.00", merged.overview?.cardBalance)
        assertEquals("3-201", merged.overview?.dormitory)
        assertEquals("18.60", merged.overview?.energyBalance)
        assertNull(merged.timetable)
    }
}
