package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_AVAILABILITY_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_RESERVATIONS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_RULES_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_SPACES_PATH
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.ReservationUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CampusReservationModelTest {
    @Test
    fun `campus reservation api path constants are correctly formatted`() {
        assertEquals("/apps/campus/api/campus/libroom/spaces", CAMPUS_LIBROOM_SPACES_PATH)
        assertEquals("/apps/campus/api/campus/libroom/rules", CAMPUS_LIBROOM_RULES_PATH)
        assertEquals("/apps/campus/api/campus/libroom/availability", CAMPUS_LIBROOM_AVAILABILITY_PATH)
        assertEquals("/apps/campus/api/campus/libroom/reservations", CAMPUS_LIBROOM_RESERVATIONS_PATH)
        assertEquals("/apps/campus/api/campus/libroom/auto-reservations", CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH)
    }

    @Test
    fun `campus reservation request holds expected values`() {
        val request = CampusReservationRequest(
            areaId = 101,
            date = "2026-08-26",
            startTime = "09:00",
            endTime = "11:00",
            title = "毕业设计研读",
            content = "查阅论文与撰写报告",
            mobile = "13800138000",
            open = true,
        )
        assertEquals(101, request.areaId)
        assertEquals("2026-08-26", request.date)
        assertEquals("09:00", request.startTime)
        assertEquals("11:00", request.endTime)
        assertEquals("毕业设计研读", request.title)
        assertEquals("查阅论文与撰写报告", request.content)
        assertEquals("13800138000", request.mobile)
        assertTrue(request.open)
    }

    @Test
    fun `campus auto reservation task handles candidate ordering`() {
        val candidates = listOf(
            CampusAutoReservationCandidate(areaId = 1, startTime = "09:00", endTime = "11:00"),
            CampusAutoReservationCandidate(areaId = 2, startTime = "14:00", endTime = "16:00"),
        )
        val task = CampusAutoReservationTask(
            id = "task-123",
            name = "每周三自动预约",
            enabled = true,
            reservationDate = "2026-08-26",
            executeTime = "08:30",
            candidates = candidates,
            title = "研讨室使用",
            content = "自习与研讨",
            mobile = "13800138000",
            open = false,
            lastStatus = "succeeded",
            lastCandidateIndex = 0,
        )

        assertEquals("task-123", task.id)
        assertEquals(2, task.candidates.size)
        assertEquals(1, task.candidates[0].areaId)
        assertEquals(2, task.candidates[1].areaId)
        assertEquals("succeeded", task.lastStatus)
        assertEquals(0, task.lastCandidateIndex)
    }

    @Test
    fun `reservation ui state defaults correctly`() {
        val state = ReservationUiState()
        assertFalse(state.refreshing)
        assertTrue(state.spaces.isEmpty())
        assertFalse(state.spacesLoading)
        assertFalse(state.queryLoading)
        assertFalse(state.submitLoading)
        assertTrue(state.autoTasks.isEmpty())
    }
}
