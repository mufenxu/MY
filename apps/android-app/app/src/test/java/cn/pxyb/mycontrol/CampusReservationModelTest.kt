package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.CAMPUS_LIBRARY_SEAT_AREAS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBRARY_SEAT_OFFICIAL_WEBVIEW_LOGIN_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBRARY_SEAT_OVERVIEW_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBRARY_SEAT_SEATS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_AVAILABILITY_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_RESERVATIONS_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_RULES_PATH
import cn.pxyb.mycontrol.data.CAMPUS_LIBROOM_SPACES_PATH
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloor
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatVenue
import cn.pxyb.mycontrol.data.formatCampusReservationRulesForDisplay
import cn.pxyb.mycontrol.data.parseCampusReservationSpacesPayload
import cn.pxyb.mycontrol.data.parseLibrarySeatAreasPayload
import cn.pxyb.mycontrol.data.parseLibrarySeatOverviewPayload
import cn.pxyb.mycontrol.data.parseLibrarySeatSeatsPayload
import cn.pxyb.mycontrol.data.toCampusAutoReservationTask
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatUiState
import cn.pxyb.mycontrol.ui.feature.campus.reservation.ReservationUiState
import cn.pxyb.mycontrol.ui.feature.campus.reservation.copyForNextRun
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject
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
        assertEquals("/apps/campus/api/campus/library-seat/overview", CAMPUS_LIBRARY_SEAT_OVERVIEW_PATH)
        assertEquals("/apps/campus/api/campus/library-seat/areas", CAMPUS_LIBRARY_SEAT_AREAS_PATH)
        assertEquals("/apps/campus/api/campus/library-seat/seats", CAMPUS_LIBRARY_SEAT_SEATS_PATH)
        assertEquals("/apps/campus/api/campus/library-seat/reservations", CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH)
        assertEquals("/apps/campus/api/campus/library-seat/official-webview-login", CAMPUS_LIBRARY_SEAT_OFFICIAL_WEBVIEW_LOGIN_PATH)
    }

    @Test
    fun `campus reservation rules render html as readable Chinese text`() {
        val rules = JSONObject()
            .put(
                "seat",
                "座位预约规则中文<p style=\"text-align: left;\">1、读者可预约当日或次日的座位。</p><p><br></p><p style=\"text-align: left;\">2、预约成功后30分钟内完成签到。</p>"
            )

        val text = formatCampusReservationRulesForDisplay(rules)

        assertTrue(text.contains("座位预约规则中文"))
        assertTrue(text.contains("1、读者可预约当日或次日的座位。"))
        assertTrue(text.contains("2、预约成功后30分钟内完成签到。"))
        assertFalse(text.contains("<p"))
        assertFalse(text.contains("style="))
        assertFalse(text.contains("seat："))
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
    fun `campus reservation spaces prefer top level data over occupied date blocks`() {
        val response = JSONObject()
            .put(
                "data",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("id", 21)
                            .put("name", "单人学习间14")
                            .put(
                                "date",
                                JSONArray()
                                    .put(JSONObject().put("areaId", 21).put("begin_timestamp", "2026-08-29 08:00:00"))
                                    .put(JSONObject().put("areaId", 21).put("begin_timestamp", "2026-08-29 13:15:00"))
                            )
                    )
            )

        val spaces = parseCampusReservationSpacesPayload(response)

        assertEquals(listOf(CampusReservationSpace(id = 21, name = "单人学习间14")), spaces)
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
            executeDate = "2026-08-23",
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
        assertEquals("2026-08-23", task.executeDate)
        assertEquals(2, task.candidates.size)
        assertEquals(1, task.candidates[0].areaId)
        assertEquals(2, task.candidates[1].areaId)
        assertEquals("succeeded", task.lastStatus)
        assertEquals(0, task.lastCandidateIndex)
    }

    @Test
    fun `campus auto reservation task parses lifecycle and attempt details`() {
        val payload = JSONObject()
            .put("id", "task-123")
            .put("name", "周三研讨")
            .put("enabled", true)
            .put("reservationDate", "2026-08-27")
            .put("executeDate", "2026-08-24")
            .put("executeTime", "07:43")
            .put(
                "candidates",
                JSONArray().put(JSONObject().put("areaId", 9).put("startTime", "09:00").put("endTime", "11:00"))
            )
            .put("title", "个人学习")
            .put("content", "完成课程阅读")
            .put("mobile", "13800138000")
            .put("open", false)
            .put("status", "waiting")
            .put("statusText", "等待运行")
            .put("nextRunAt", "2026-08-24T07:43:00.000Z")
            .put("lastRunAt", "2026-08-23T07:43:00.000Z")
            .put(
                "lastAttempts",
                JSONArray().put(
                    JSONObject()
                        .put("candidateIndex", 0)
                        .put("status", "failed")
                        .put("conflict", true)
                        .put("transient", false)
                        .put("attempt", 1)
                        .put("message", "该时段已被占用")
                )
            )
            .put(
                "lastReservation",
                JSONObject()
                    .put("id", "reservation-1")
                    .put("date", "2026-08-27")
                    .put("startTime", "09:00")
                    .put("endTime", "11:00")
            )

        val task = payload.toCampusAutoReservationTask()

        assertEquals("waiting", task.status)
        assertEquals("等待运行", task.statusText)
        assertEquals("2026-08-24T07:43:00.000Z", task.nextRunAt)
        assertEquals("2026-08-23T07:43:00.000Z", task.lastRunAt)
        assertEquals(1, task.lastAttempts.size)
        assertEquals(0, task.lastAttempts[0].candidateIndex)
        assertTrue(task.lastAttempts[0].conflict)
        assertEquals("reservation-1", task.lastReservation?.id)
        assertEquals("09:00", task.lastReservation?.startTime)
    }

    @Test
    fun `campus auto reservation task copies to the next weekly target and resets execution state`() {
        val task = CampusAutoReservationTask(
            id = "task-123",
            name = "周三研讨",
            enabled = false,
            status = "succeeded",
            statusText = "已完成",
            reservationDate = "2026-08-26",
            executeDate = "2026-08-23",
            executeTime = "07:43",
            candidates = listOf(CampusAutoReservationCandidate(areaId = 9)),
            lastStatus = "succeeded",
            lastCandidateIndex = 0,
        )

        val copied = task.copyForNextRun(LocalDate.parse("2026-08-26"))

        assertEquals("", copied.id)
        assertTrue(copied.enabled)
        assertEquals("waiting", copied.status)
        assertEquals("2026-09-02", copied.reservationDate)
        assertEquals("2026-08-30", copied.executeDate)
        assertEquals("07:43", copied.executeTime)
        assertEquals(null, copied.lastStatus)
        assertEquals(null, copied.lastCandidateIndex)
    }

    @Test
    fun `library seat overview parses venue floors and dates`() {
        val response = JSONObject()
            .put(
                "data",
                JSONObject()
                    .put(
                        "buildings",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("id", "1744276833606668288")
                                    .put("name", "图书馆")
                                    .put(
                                        "floors",
                                        JSONArray()
                                            .put(JSONObject().put("id", "1935932081147318272").put("name", "二层"))
                                    )
                            )
                    )
                    .put("dates", JSONArray().put("2026-08-29").put("2026-08-30"))
            )

        val overview = parseLibrarySeatOverviewPayload(response)

        assertEquals(
            listOf(
                LibrarySeatVenue(
                    id = "1744276833606668288",
                    name = "图书馆",
                    floors = listOf(LibrarySeatFloor(id = "1935932081147318272", name = "二层"))
                )
            ),
            overview.venues,
        )
        assertEquals(listOf("2026-08-29", "2026-08-30"), overview.dates)
    }

    @Test
    fun `library seat areas parse long ids and availability counts`() {
        val response = JSONObject()
            .put(
                "data",
                JSONObject()
                    .put(
                        "pageList",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("id", "1935932990019440640")
                                    .put("buildingId", "1744276833606668288")
                                    .put("floorId", "1935932081147318272")
                                    .put("name", "二层电子阅览区")
                                    .put("buildingName", "图书馆")
                                    .put("floorName", "二层")
                                    .put("seatTotal", 188)
                                    .put("seatFree", 7)
                                    .put("maxMinute", 240)
                            )
                    )
            )

        val areas = parseLibrarySeatAreasPayload(response)

        assertEquals(
            listOf(
                LibrarySeatArea(
                    id = "1935932990019440640",
                    venueId = "1744276833606668288",
                    floorId = "1935932081147318272",
                    name = "二层电子阅览区",
                    buildingName = "图书馆",
                    floorName = "二层",
                    seatTotal = 188,
                    seatFree = 7,
                    maxMinute = 240,
                )
            ),
            areas,
        )
    }

    @Test
    fun `library seat status parses free and occupied seats`() {
        val response = JSONObject()
            .put(
                "data",
                JSONObject()
                    .put(
                        "1935965539382956032",
                        JSONObject()
                            .put("id", "1935965539382956032")
                            .put("label", "1")
                            .put("name", "1行1列")
                            .put("status", "IN_USE")
                    )
                    .put(
                        "1935965539382956037",
                        JSONObject()
                            .put("id", "1935965539382956037")
                            .put("label", "6")
                            .put("name", "1行6列")
                            .put("status", "FREE")
                    )
            )

        val seats = parseLibrarySeatSeatsPayload(response)

        assertEquals(2, seats.size)
        assertFalse(seats[0].isFree)
        assertTrue(seats[1].isFree)
        assertEquals("可预约", seats[1].statusText)
    }

    @Test
    fun `library seat reservation request holds expected values`() {
        val request = LibrarySeatReservationRequest(
            seatId = "1935965539382956037",
            date = "2026-08-29",
            startMinute = 480,
            endMinute = 600,
        )

        assertEquals("1935965539382956037", request.seatId)
        assertEquals("2026-08-29", request.date)
        assertEquals(480, request.startMinute)
        assertEquals(600, request.endMinute)
    }

    @Test
    fun `library seat ui state defaults correctly`() {
        val state = LibrarySeatUiState()
        assertFalse(state.refreshing)
        assertTrue(state.venues.isEmpty())
        assertTrue(state.areas.isEmpty())
        assertTrue(state.seats.isEmpty())
        assertFalse(state.submitLoading)
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
