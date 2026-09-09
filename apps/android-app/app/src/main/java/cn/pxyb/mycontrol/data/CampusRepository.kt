package cn.pxyb.mycontrol.data

import android.net.Uri
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext

import org.json.JSONArray
import org.json.JSONObject
import java.time.YearMonth

class CampusRepository internal constructor(private val http: PlatformHttpClient) {
    suspend fun campusTimetable(): CampusTimetable = withContext(Dispatchers.IO) {
        val envelope = http.execute(CAMPUS_TIMETABLE_PATH).json
        val json = envelope.optJSONObject("data") ?: envelope
        CampusTimetable(
            currentCalendarText = json.optString("currentCalendarText"),
            termText = json.optString("termText"),
            schoolCalendar = json.optJSONObject("schoolCalendar")?.let { calendar ->
                CampusAcademicCalendar(
                    academicYear = calendar.optString("academicYear"),
                    season = calendar.optString("season"),
                    termLabel = calendar.optString("termLabel"),
                    termStartDate = calendar.optString("termStartDate"),
                    termEndDate = calendar.optString("termEndDate"),
                    teachingWeeks = calendar.optIntOrNull("teachingWeeks"),
                    weekFirst = calendar.optInt("weekFirst", 1),
                    currentWeek = calendar.optIntOrNull("currentWeek"),
                    isHoliday = calendar.optBoolean("isHoliday"),
                    statusText = calendar.optString("statusText"),
                    events = calendar.optJSONArray("events").platformObjects().map { event ->
                        CampusCalendarEvent(
                            startDate = event.optString("startDate"),
                            endDate = event.optString("endDate"),
                            label = event.optString("label"),
                        )
                    },
                )
            },
            generatedAt = json.nullableString("generatedAt"),
            live = json.optBoolean("live"),
            staleReason = json.nullableString("staleReason"),
            courses = json.optJSONArray("courses").platformObjects().map { item ->
                val location = item.optJSONObject("location")
                CampusCourse(
                    id = item.optString("id"),
                    courseCode = item.optString("courseCode"),
                    courseName = item.optString("courseName", "课程"),
                    teacher = item.optString("teacher"),
                    weekText = item.optString("weekText"),
                    weeks = item.optJSONArray("weeks").toInts(),
                    day = item.optInt("day"),
                    dayName = item.optString("dayName"),
                    sectionText = item.optString("sectionText"),
                    startSection = item.optInt("startSection"),
                    endSection = item.optInt("endSection"),
                    timeRange = item.optString("timeRange"),
                    location = location?.optString("display") ?: item.optString("location"),
                )
            },
        )
    }

    suspend fun campusDashboard(): CampusDashboard = withContext(Dispatchers.IO) {
        supervisorScope {
            val timetable = async { campusTimetable() }
            val gpa = async { campusRequestOrNull(::campusGpa) }
            val freeClassrooms = async { campusRequestOrNull { campusFreeClassrooms() } }
            val campus = async { campusRequestOrNull(::campusLife) }
            val energy = async { campusRequestOrNull(::campusEnergy) }
            val campusLife = campus.await()
            val campusEnergy = energy.await()
            CampusDashboard(
                timetable = timetable.await(),
                overview = CampusOverview(
                    gpa = gpa.await(),
                    freeClassrooms = freeClassrooms.await(),
                    cardBalance = campusLife?.cardBalance,
                    waterCode = campusLife?.waterCode,
                    dormitory = campusLife?.dormitory,
                    energyBalance = campusEnergy?.balance,
                    energyRoom = campusEnergy?.room,
                ),
            )
        }
    }

    private suspend fun campusGpa(): CampusGpa {
        val data = campusData(CAMPUS_GPA_PATH)
        val rows = data.optJSONArray("rows").platformObjects()
        fun value(type: String): String? = rows.firstOrNull { it.optString("type") == type }
            ?.displayString("value")

        return CampusGpa(
            overall = data.optJSONObject("main")?.displayString("value") ?: value("GPA"),
            core = value("核心课GPA"),
            required = value("必修课GPA"),
            degree = value("学位课GPA"),
        )
    }

    suspend fun campusFreeClassrooms(
        dayplus: Int = 0,
        sections: List<Int> = listOf(11, 12),
        building: String = "study",
    ): CampusFreeClassrooms = withContext(Dispatchers.IO) {
        val safeDayplus = dayplus.coerceIn(0, 2)
        val safeSections = sections.filter { it in 1..12 }.distinct().sorted().ifEmpty { listOf(11, 12) }
        val safeBuilding = building.takeIf {
            it in setOf("study", "all", "111", "112", "201", "202", "203", "205", "701")
        } ?: "study"
        val path = "$CAMPUS_FREE_CLASSROOMS_PATH?dayplus=$safeDayplus&sections=${safeSections.joinToString(",")}&building=${encodePath(safeBuilding)}"
        val data = campusData(path)
        val stats = data.optJSONObject("stats") ?: JSONObject()
        CampusFreeClassrooms(
            rooms = stats.optionalInt("rooms"),
            seats = stats.optionalInt("seats"),
            dayLabel = data.displayString("dayLabel"),
            date = data.displayString("date"),
            weekday = data.displayString("weekday"),
            sections = data.optJSONArray("sections").toInts(),
            sectionTimes = data.optJSONArray("sectionTimes").platformObjects().map { item ->
                CampusSectionTime(
                    section = item.optInt("section"),
                    start = item.optString("start"),
                    end = item.optString("end"),
                )
            },
            building = data.optJSONObject("building")?.let { item ->
                CampusFreeClassroomOption(
                    value = item.optString("value"),
                    name = item.optString("name"),
                )
            },
            buildingOptions = data.optJSONArray("buildingOptions").platformObjects().map { item ->
                CampusFreeClassroomOption(
                    value = item.optString("value"),
                    name = item.optString("name"),
                )
            },
            buildings = data.optJSONArray("buildings").platformObjects().map { item ->
                CampusFreeClassroomBuilding(
                    number = item.optString("number"),
                    name = item.optString("name"),
                    roomCount = item.optInt("roomCount"),
                    seats = item.optInt("seats"),
                    rooms = item.optJSONArray("rooms").platformObjects().map { room ->
                        CampusFreeClassroomRoom(
                            room = room.optString("room"),
                            floor = room.displayString("floor"),
                            seats = room.optionalInt("seats")?.takeIf { it > 0 },
                        )
                    },
                )
            },
            buildingCount = stats.optionalInt("buildings"),
        )
    }

    suspend fun campusReservationSpaces(
        date: String? = null,
        startTime: String? = null,
        endTime: String? = null,
    ): List<CampusReservationSpace> = withContext(Dispatchers.IO) {
        val queryParams = mutableListOf<String>()
        if (!date.isNullOrBlank()) queryParams.add("date=${Uri.encode(date.trim())}")
        if (!startTime.isNullOrBlank()) queryParams.add("startTime=${Uri.encode(startTime.trim())}")
        if (!endTime.isNullOrBlank()) queryParams.add("endTime=${Uri.encode(endTime.trim())}")
        val queryString = if (queryParams.isNotEmpty()) "?${queryParams.joinToString("&")}" else ""
        val response = http.execute("$CAMPUS_LIBROOM_SPACES_PATH$queryString")
        parseCampusReservationSpacesPayload(response.json, response.jsonArray)
    }

    suspend fun campusReservationOfficialWebSession(): PlatformWebSession = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBROOM_OFFICIAL_WEBVIEW_LOGIN_PATH)
        val data = response.json.optJSONObject("data") ?: response.json
        val url = data.optString("url").takeIf { it.isNotBlank() }
            ?: throw ApiException("服务端未返回学校官方预约地址。", 500, "LIBROOM_OFFICIAL_URL_MISSING")
        PlatformWebSession(
            url = url,
            cookies = data.optJSONArray("cookies").platformObjects().mapNotNull { item ->
                val cookieUrl = item.optString("url").takeIf { it.startsWith("https://") } ?: return@mapNotNull null
                val cookieValue = item.optString("value").takeIf { "=" in it } ?: return@mapNotNull null
                PlatformWebCookie(cookieUrl, cookieValue)
            },
        )
    }

    suspend fun librarySeatOfficialWebSession(): PlatformWebSession = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBRARY_SEAT_OFFICIAL_WEBVIEW_LOGIN_PATH)
        val data = response.json.optJSONObject("data") ?: response.json
        val url = data.optString("url").takeIf { it.isNotBlank() }
            ?: throw ApiException("服务端未返回学校座位预约地址。", 500, "LIBRARY_SEAT_OFFICIAL_URL_MISSING")
        PlatformWebSession(
            url = url,
            cookies = data.optJSONArray("cookies").platformObjects().mapNotNull { item ->
                val cookieUrl = item.optString("url").takeIf { it.startsWith("https://") } ?: return@mapNotNull null
                val cookieValue = item.optString("value").takeIf { "=" in it } ?: return@mapNotNull null
                PlatformWebCookie(cookieUrl, cookieValue)
            },
        )
    }

    suspend fun librarySeatOverview(): LibrarySeatOverview = withContext(Dispatchers.IO) {
        parseLibrarySeatOverviewPayload(http.execute(CAMPUS_LIBRARY_SEAT_OVERVIEW_PATH).json)
    }

    suspend fun librarySeatAreas(
        venueId: String,
        date: String,
        startMinute: Int,
        endMinute: Int = 0,
        floorId: String? = null,
        pageSize: Int = 50,
        currentPage: Int = 1,
        power: Boolean = false,
        window: Boolean = false,
    ): List<LibrarySeatArea> = withContext(Dispatchers.IO) {
        val query = buildList {
            add("venueId=${encodePath(venueId)}")
            add("date=${encodePath(date)}")
            add("startMinute=$startMinute")
            add("endMinute=$endMinute")
            add("pageSize=$pageSize")
            add("currentPage=$currentPage")
            add("power=$power")
            add("window=$window")
            floorId?.takeIf(String::isNotBlank)?.let { add("floorId=${encodePath(it)}") }
        }.joinToString("&", prefix = "?")
        parseLibrarySeatAreasPayload(http.execute("$CAMPUS_LIBRARY_SEAT_AREAS_PATH$query").json)
    }

    suspend fun librarySeatSeats(
        roomId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        amPm: Int = 0,
    ): List<LibrarySeatStatus> = withContext(Dispatchers.IO) {
        val query = buildList {
            add("roomId=${encodePath(roomId)}")
            add("date=${encodePath(date)}")
            add("startMinute=$startMinute")
            add("endMinute=$endMinute")
            add("amPm=$amPm")
        }.joinToString("&", prefix = "?")
        parseLibrarySeatSeatsPayload(http.execute("$CAMPUS_LIBRARY_SEAT_SEATS_PATH$query").json)
    }

    suspend fun submitLibrarySeatReservation(request: LibrarySeatReservationRequest): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("seatId", request.seatId)
            .put("date", request.date)
            .put("startMinute", request.startMinute)
            .put("endMinute", request.endMinute)
            .put("capToken", request.capToken)
        http.execute(CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH, method = "POST", body = body)
    }

    suspend fun librarySeatReservations(): List<LibrarySeatReservationRecord> = withContext(Dispatchers.IO) {
        parseLibrarySeatReservationRecordsPayload(http.execute(CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH).json)
    }

    suspend fun librarySeatReservationHistory(page: Int = 0, size: Int = 10): LibrarySeatReservationHistory =
        withContext(Dispatchers.IO) {
            val query = "?page=$page&size=$size"
            parseLibrarySeatReservationHistoryPayload(
                http.execute("$CAMPUS_LIBRARY_SEAT_RESERVATIONS_HISTORY_PATH$query").json,
            )
        }

    suspend fun librarySeatWaitlists(): List<LibrarySeatWaitlistTask> = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH)
        val data = response.json.optJSONArray("data") ?: response.jsonArray
        data.platformObjects().mapNotNull { it.toLibrarySeatWaitlistTask() }
    }

    suspend fun createLibrarySeatWaitlist(request: LibrarySeatWaitlistRequest): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("venueId", request.venueId)
            .put("floorId", request.floorId)
            .put("venueName", request.venueName)
            .put("floorName", request.floorName)
            .put("date", request.date)
            .put("startMinute", request.startMinute)
            .put("endMinute", request.endMinute)
            .put("minLabel", request.minLabel)
            .put("maxLabel", request.maxLabel)
            .put("seatLabels", JSONArray(request.seatLabels))
        http.execute(CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH, method = "POST", body = body)
    }

    suspend fun setLibrarySeatWaitlistEnabled(taskId: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH/${encodePath(taskId)}"
        http.execute(path, method = "PUT", body = JSONObject().put("enabled", enabled))
    }

    suspend fun deleteLibrarySeatWaitlist(taskId: String): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH/${encodePath(taskId)}"
        http.execute(path, method = "DELETE")
    }

    suspend fun campusReservationRules(spaceId: Int): String = withContext(Dispatchers.IO) {
        val response = http.execute("$CAMPUS_LIBROOM_RULES_PATH?spaceId=$spaceId")
        val data = response.json.opt("data") ?: response.json
        formatCampusReservationRulesForDisplay(data)
    }

    suspend fun campusReservationAvailability(spaceId: Int, date: String): CampusReservationAvailability = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AVAILABILITY_PATH?spaceId=$spaceId&date=${encodePath(date)}"
        val response = http.execute(path)
        val data = response.json.opt("data") ?: response.json
        val availability = if (data is JSONObject) data.optJSONObject("availability") ?: data else null
        if (availability == null) {
            CampusReservationAvailability(detail = formatCampusJsonValue(data))
        } else {
            CampusReservationAvailability(
                freeWindows = availability.optJSONArray("freeWindows").toReservationTimeWindows(),
                busyWindows = availability.optJSONArray("busyWindows").toReservationTimeWindows(),
                detail = availability.displayString("detail") ?: formatCampusJsonValue(availability),
            )
        }
    }

    suspend fun submitCampusReservation(request: CampusReservationRequest): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("areaId", request.areaId)
            .put("date", request.date)
            .put("startTime", request.startTime)
            .put("endTime", request.endTime)
            .put("title", request.title)
            .put("content", request.content)
            .put("mobile", request.mobile)
            .put("open", request.open)
        http.execute(CAMPUS_LIBROOM_RESERVATIONS_PATH, method = "POST", body = body)
    }

    suspend fun campusMyReservations(): List<CampusMyReservation> = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBROOM_RESERVATIONS_PATH)
        val data = response.json.optJSONArray("data") ?: response.jsonArray
        data.platformObjects().map { it.toCampusMyReservation() }
    }

    suspend fun cancelCampusReservation(reservationId: String): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_RESERVATIONS_PATH/${encodePath(reservationId)}/cancel"
        http.execute(path, method = "POST")
    }

    suspend fun campusAutoReservations(): List<CampusAutoReservationTask> = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH)
        val data = response.json.optJSONArray("data") ?: response.jsonArray
        data.platformObjects().map { it.toCampusAutoReservationTask() }
    }

    suspend fun createCampusAutoReservation(task: CampusAutoReservationTask): CampusAutoReservationTask = withContext(Dispatchers.IO) {
        val response = http.execute(CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH, method = "POST", body = task.toJson())
        val data = response.json.optJSONObject("data") ?: response.json
        data.toCampusAutoReservationTask()
    }

    suspend fun updateCampusAutoReservation(task: CampusAutoReservationTask): CampusAutoReservationTask = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH/${encodePath(task.id)}"
        val response = http.execute(path, method = "PUT", body = task.toJson())
        val data = response.json.optJSONObject("data") ?: response.json
        data.toCampusAutoReservationTask()
    }

    suspend fun deleteCampusAutoReservation(taskId: String): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH/${encodePath(taskId)}"
        http.execute(path, method = "DELETE")
    }

    private suspend fun campusLife(): CampusLife {
        val data = campusData(CAMPUS_SUMMARY_PATH)
        return CampusLife(
            cardBalance = data.optJSONObject("card")?.displayString("totalBalance"),
            waterCode = data.optJSONObject("water")
                ?.optJSONObject("waterCode")
                ?.optJSONObject("data")
                ?.displayString("ranCode"),
            dormitory = data.optJSONObject("accommodation")
                ?.optJSONObject("profile")
                ?.displayString("dormitoryInfo"),
        )
    }

    suspend fun campusIdentityCode(): CampusIdentityCode = withContext(Dispatchers.IO) {
        val data = campusData(CAMPUS_IDENTITY_CARD_CODE_PATH, method = "POST")
        CampusIdentityCode(
            qrImage = data.optString("qrImage"),
            expiresAt = data.optString("expiresAt"),
        )
    }

    suspend fun campusWaterValve(): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(CAMPUS_WATER_VALVE_PATH)
    }

    suspend fun campusWaterBill(month: String): CampusWaterBill = withContext(Dispatchers.IO) {
        val data = campusData("$CAMPUS_WATER_PATH?mode=month&time=$month")
        val bill = data.optJSONObject("waterBill")
        val records = bill?.optJSONArray("data").platformObjects().map { item ->
            val amount = item.optDouble("monDeal", Double.NaN)
            CampusWaterBillRecord(
                title = item.optString("deviceName", item.optString("payTypeName", "生活用水")),
                amount = if (amount.isFinite()) "¥%.2f".format(amount) else item.displayString("monDeal") ?: "--",
                time = item.optString("startTime", "--"),
                detail = item.displayString("waterCount")?.let { "$it L" }
                    ?: item.displayString("address") ?: "--",
            )
        }
        val total = records.sumOf { it.amount.removePrefix("¥").toDoubleOrNull() ?: 0.0 }
        CampusWaterBill(
            month = data.optJSONObject("billQuery")?.nullableString("label") ?: month,
            totalAmount = "¥%.2f".format(total),
            records = records,
            error = bill?.nullableString("error"),
        )
    }

    suspend fun bindCampusWaterValve(rawCode: String): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(
            CAMPUS_WATER_VALVE_BIND_PATH,
            method = "POST",
            body = JSONObject().put("rawCode", rawCode),
        )
    }

    suspend fun openCampusWaterValve(seqNo: String): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(
            CAMPUS_WATER_VALVE_OPEN_PATH,
            method = "POST",
            body = JSONObject().put("seqNo", seqNo),
        )
    }

    suspend fun closeCampusWaterValve(seqNo: String): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(
            CAMPUS_WATER_VALVE_CLOSE_PATH,
            method = "POST",
            body = JSONObject().put("seqNo", seqNo),
        )
    }

    suspend fun unbindCampusWaterValve(seqNo: String): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(
            CAMPUS_WATER_VALVE_UNBIND_PATH,
            method = "POST",
            body = JSONObject().put("seqNo", seqNo),
        )
    }

    suspend fun reorderCampusWaterValves(seqNos: List<String>): CampusWaterValve = withContext(Dispatchers.IO) {
        campusWaterValveData(
            CAMPUS_WATER_VALVE_REORDER_PATH,
            method = "POST",
            body = JSONObject().put("seqNos", JSONArray(seqNos)),
        )
    }

    private suspend fun campusWaterValveData(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
    ): CampusWaterValve {
        val envelope = http.execute(path, method = method, body = body).json
        val data = envelope.optJSONObject("data") ?: JSONObject()
        val devices = data.optJSONArray("devices").platformObjects().map { it.toCampusWaterValveDevice() }
        val legacyDevice = data.optBoolean("bound")
            .takeIf { it && devices.isEmpty() }
            ?.let { data.toCampusWaterValveDevice() }
        return CampusWaterValve(
            bound = data.optBoolean("bound") || devices.isNotEmpty(),
            seqNo = data.nullableString("seqNo"),
            deviceName = data.nullableString("deviceName"),
            running = data.optBoolean("running"),
            defaultValue = data.nullableString("defaultValue"),
            balance = data.nullableString("balance"),
            updatedAt = data.nullableString("updatedAt"),
            error = data.nullableString("error"),
            devices = devices.ifEmpty { legacyDevice?.let { listOf(it) } ?: emptyList() },
        )
    }

    private fun JSONObject.toCampusWaterValveDevice() = CampusWaterValveDevice(
        bound = optBoolean("bound", true),
        seqNo = nullableString("seqNo"),
        deviceName = nullableString("deviceName"),
        running = optBoolean("running"),
        defaultValue = nullableString("defaultValue"),
        balance = nullableString("balance"),
        updatedAt = nullableString("updatedAt"),
        error = nullableString("error"),
    )

    private suspend fun campusEnergy(): CampusEnergy {
        val data = campusData("$CAMPUS_ENERGY_SUMMARY_PATH?time=${YearMonth.now()}")
        val wallet = data.optJSONObject("wallet")
        return CampusEnergy(
            balance = wallet?.optJSONObject("account")?.displayString("remainingSum"),
            room = wallet?.optJSONObject("account")?.displayString("roomName")
                ?: wallet?.optJSONObject("view")?.displayString("roomName")
                ?: data.optJSONObject("meters")?.optJSONObject("view")?.displayString("roomName"),
        )
    }

    private suspend fun campusData(path: String, method: String = "GET"): JSONObject {
        val envelope = http.execute(path, method = method).json
        return envelope.optJSONObject("data") ?: envelope
    }

    private suspend fun <T> campusRequestOrNull(request: suspend () -> T): T? = try {
        request()
    } catch (error: CancellationException) {
        throw error
    } catch (_: Throwable) {
        null
    }

    private data class CampusLife(
        val cardBalance: String?,
        val waterCode: String?,
        val dormitory: String?,
    )

    private data class CampusEnergy(val balance: String?, val room: String?)

}

