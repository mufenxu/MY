package cn.pxyb.mycontrol.data

import android.net.Uri
import android.util.Base64
import android.os.Build
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType

import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.YearMonth
import java.io.IOException
import java.util.Locale
import java.util.concurrent.TimeUnit

class PlatformApi(
    private val sessionStore: SessionStore,
    private val snapshotStore: ResponseSnapshotStore,
) {
    init {
        snapshotStore.setAccount(sessionStore.readActiveUsername())
    }

    fun setAccount(username: String?) {
        snapshotStore.setAccount(username)
    }
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val platformOrigin = Uri.parse(BuildConfig.PLATFORM_BASE_URL).let { uri ->
        if (uri.scheme.isNullOrBlank() || uri.authority.isNullOrBlank()) {
            ""
        } else {
            "${uri.scheme}://${uri.authority}"
        }
    }
    private val client = HttpClientProvider.client
    @Volatile private var offline = false
    @Volatile private var cachedAtMillis: Long? = null

    fun isOffline(): Boolean = offline

    fun cachedAtMillis(): Long? = cachedAtMillis

    suspend fun login(
        username: String,
        password: String,
        totp: String = "",
        recoveryCode: String = "",
    ): LoginResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("username", username.trim())
            .put("password", password)
        if (totp.isNotBlank()) body.put("totp", totp.trim())
        if (recoveryCode.isNotBlank()) body.put("recoveryCode", recoveryCode.trim())

        val response = execute("/api/auth/login", "POST", body, authenticated = false)
        val user = response.json.optJSONObject("user").toPlatformUser()
        response.toLoginResult(user, response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun loginCapabilities(): LoginCapabilities = withContext(Dispatchers.IO) {
        val json = execute("/api/auth/status", authenticated = false).json
        LoginCapabilities(androidPasskeySupported = json.optBoolean("androidPasskeySupported"))
    }

    suspend fun beginPasskeyLogin(username: String): PasskeyChallenge = withContext(Dispatchers.IO) {
        val normalizedUsername = username.trim()
        val json = execute(
            "/api/auth/passkey/options",
            "POST",
            JSONObject().put("username", normalizedUsername),
            authenticated = false,
        ).json
        PasskeyChallenge(
            username = normalizedUsername,
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务器未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun completePasskeyLogin(challenge: PasskeyChallenge, responseJson: String): LoginResult =
        withContext(Dispatchers.IO) {
            val response = execute(
                "/api/auth/passkey/verify",
                "POST",
                JSONObject()
                    .put("username", challenge.username)
                    .put("challengeId", challenge.challengeId)
                    .put("response", JSONObject(responseJson)),
                authenticated = false,
            )
            response.toLoginResult(response.json.optJSONObject("user").toPlatformUser())
        }

    suspend fun persistLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        sessionStore.writeCookie(
            result.sessionCookie,
            result.sessionExpiresAtMillis,
            result.sessionIdleMinutes,
        )
        sessionStore.writeLastUsername(result.user.username)
        sessionStore.writeActiveUsername(result.user.username)
        snapshotStore.setAccount(result.user.username)
    }

    suspend fun discardLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${BuildConfig.PLATFORM_BASE_URL}/api/auth/logout")
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .header("Cookie", result.sessionCookie)
            .header("X-Platform-Request", "console")
            .post(JSONObject().toString().toRequestBody(jsonMediaType))
            .build()
        runCatching { client.newCall(request).execute().close() }
        Unit
    }

    suspend fun scanQrLogin(requestId: String, scanToken: String): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/scan",
            "POST",
            JSONObject().put("scanToken", scanToken),
        ).json.toQrLoginTarget()
    }

    suspend fun createQrLoginRequest(): QrLoginRequest = withContext(Dispatchers.IO) {
        val json = execute(
            "/api/auth/qr/requests",
            "POST",
            JSONObject()
                .put("clientKind", "android")
                .put("confirmationMethod", "passkey"),
            authenticated = false,
        ).json
        QrLoginRequest(
            requestId = json.optString("requestId"),
            requesterVerifier = json.optString("requesterVerifier"),
            qrDataUrl = json.optString("qrDataUrl"),
            expiresAt = json.optString("expiresAt"),
        )
    }

    suspend fun qrLoginRequestStatus(
        requestId: String,
        requesterVerifier: String,
    ): QrLoginRequestStatus = withContext(Dispatchers.IO) {
        val json = execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/status",
            "POST",
            JSONObject().put("requesterVerifier", requesterVerifier),
            authenticated = false,
        ).json
        QrLoginRequestStatus(
            requestId = json.optString("requestId"),
            status = json.optString("status"),
            expiresAt = json.optString("expiresAt"),
        )
    }

    suspend fun consumeQrLoginRequest(
        requestId: String,
        requesterVerifier: String,
    ): LoginResult = withContext(Dispatchers.IO) {
        val response = execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/consume",
            "POST",
            JSONObject().put("requesterVerifier", requesterVerifier),
            authenticated = false,
        )
        val user = response.json.optJSONObject("user").toPlatformUser()
        response.toLoginResult(user, response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun beginQrPasskey(requestId: String): QrPasskeyChallenge = withContext(Dispatchers.IO) {
        val json = execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/passkey/options",
            "POST",
            JSONObject(),
        ).json
        QrPasskeyChallenge(
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务端未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun approveQrWithPasskey(
        requestId: String,
        challenge: QrPasskeyChallenge,
        responseJson: String,
    ): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put(
                "passkey",
                JSONObject()
                    .put("challengeId", challenge.challengeId)
                    .put("response", JSONObject(responseJson)),
            ),
        ).json.toQrLoginTarget()
    }

    suspend fun approveQrWithBiometric(requestId: String): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put("localConfirmation", true),
        ).json.toQrLoginTarget()
    }

    suspend fun rejectQrLogin(requestId: String): Unit = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/reject",
            "POST",
            JSONObject(),
        )
        Unit
    }

    suspend fun createWebLoginLink(redirectUrl: String): WebLoginLink = withContext(Dispatchers.IO) {
        val json = execute(
            "/api/auth/web-login-tickets",
            "POST",
            JSONObject().put("redirect", redirectUrl),
        ).json
        WebLoginLink(
            loginUrl = json.optString("loginUrl"),
            redirect = json.optString("redirect", redirectUrl),
            expiresAt = json.nullableString("expiresAt"),
        )
    }

    suspend fun externalApplications(): List<ExternalApplication> = withContext(Dispatchers.IO) {
        parseExternalApplications(execute(EXTERNAL_APPLICATIONS_PATH).json)
    }

    suspend fun launchExternalApplication(id: String): ExternalApplicationLaunch = withContext(Dispatchers.IO) {
        parseExternalApplicationLaunch(
            execute(
                "$EXTERNAL_APPLICATIONS_PATH/${encodePath(id)}/launch",
                "POST",
                JSONObject(),
            ).json,
        )
    }

    suspend fun authStatus(): PlatformUser? = withContext(Dispatchers.IO) {
        if (!sessionStore.hasSession()) return@withContext null
        try {
            val json = execute("/api/auth/status", authenticated = true).json
            if (!json.optBoolean("authenticated")) {
                sessionStore.clear()
                null
            } else {
                json.optJSONObject("user").toPlatformUser().also { snapshotStore.setAccount(it.username) }
            }
        } catch (error: ApiException) {
            if (error.status == 401 || error.status == 403) {
                sessionStore.clear()
                null
            } else {
                throw error
            }
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        runCatching { execute("/api/auth/logout", "POST", JSONObject()) }
        sessionStore.clear()
        snapshotStore.clear()
    }

    suspend fun overview(force: Boolean = false): OverviewData = withContext(Dispatchers.IO) {
        val path = if (force) "/api/operations/overview?refresh=1" else "/api/operations/overview"
        val json = execute(path).json
        OverviewData(
            services = json.optJSONArray("services").objects().map { it.toServiceInfo() },
            incidents = json.optJSONArray("incidents").objects().map { it.toIncidentInfo() },
            audits = json.optJSONArray("audit").objects().map { it.toAuditInfo() },
            refreshedAt = json.nullableString("refreshedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun incidents(): List<IncidentInfo> = withContext(Dispatchers.IO) {
        execute("/api/incidents?limit=100").json
            .optJSONArray("incidents").objects().map { it.toIncidentInfo() }
    }

    suspend fun updateIncident(
        id: String,
        action: String,
        note: String = "",
        muteMinutes: Int? = null,
    ): IncidentInfo = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", action)
        note.trim().takeIf(String::isNotBlank)?.let { body.put("note", it.take(500)) }
        muteMinutes?.let { body.put("muteMinutes", it.coerceIn(5, 7 * 24 * 60)) }
        execute("/api/incidents/${encodePath(id)}/actions", "POST", body).json
            .optJSONObject("incident")
            ?.toIncidentInfo()
            ?: throw ApiException("异常操作未返回有效结果。", 502, "INCIDENT_ACTION_INVALID")
    }

    suspend fun tasks(): TaskData = withContext(Dispatchers.IO) {
        val json = execute("/api/tasks?limit=100").json
        TaskData(
            tasks = json.optJSONArray("tasks").objects().map { item ->
                val source = item.optString("source", "platform")
                val rawId = item.optString("id")
                val sourceId = item.nullableString("sourceId")
                    ?: rawId.removePrefix("$source:").takeIf { it.isNotBlank() && it != rawId }
                PlatformTask(
                    id = rawId,
                    title = item.optString("title", "平台任务"),
                    detail = item.optString("detail"),
                    status = item.optString("status", "pending"),
                    source = source,
                    sourceId = sourceId,
                    requestedBy = item.optString("requestedBy", "--"),
                    updatedAt = item.nullableString("updatedAt"),
                )
            },
            generatedAt = json.nullableString("generatedAt"),
        )
    }

    suspend fun todos(): TodoSnapshot = withContext(Dispatchers.IO) {
        execute(TODOS_PATH).json.toTodoSnapshotEnvelope()
    }

    suspend fun appNotifications(
        limit: Int = 50,
        cursor: String? = null,
        unreadOnly: Boolean = false,
    ): AppNotificationPage = withContext(Dispatchers.IO) {
        val query = buildList {
            add("limit=${limit.coerceIn(1, 100)}")
            cursor?.takeIf(String::isNotBlank)?.let { add("cursor=${encodePath(it)}") }
            if (unreadOnly) add("unreadOnly=true")
        }.joinToString("&")
        execute("/api/app/notifications?$query").json
            .toAppNotificationPage()
    }

    suspend fun allAppNotifications(maxItems: Int = 200): List<AppAlertRecord> = withContext(Dispatchers.IO) {
        val result = mutableListOf<AppAlertRecord>()
        var cursor: String? = null
        repeat(3) {
            val page = appNotifications(limit = 100, cursor = cursor)
            result += page.items
            if (result.size >= maxItems || page.nextCursor == null) return@withContext result.take(maxItems)
            cursor = page.nextCursor
        }
        result.take(maxItems)
    }

    suspend fun markAppNotificationRead(id: String) = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/${encodePath(id)}/read", "POST", JSONObject())
        Unit
    }

    suspend fun snoozeAppNotification(id: String, snoozedUntilMillis: Long) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/notifications/${encodePath(id)}/snooze",
            "POST",
            JSONObject().put("snoozedUntil", Instant.ofEpochMilli(snoozedUntilMillis).toString()),
        )
        Unit
    }

    suspend fun archiveAppNotification(id: String) = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/${encodePath(id)}", "DELETE")
        Unit
    }

    suspend fun markAllAppNotificationsRead() = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/read-all", "POST", JSONObject())
        Unit
    }

    suspend fun clearReadAppNotifications() = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/clear-read", "POST", JSONObject())
        Unit
    }

    suspend fun appNotificationPreference(): AppNotificationPreference = withContext(Dispatchers.IO) {
        execute("/api/app/preferences").json
            .optJSONObject("preference")
            ?.toAppNotificationPreference()
            ?: AppNotificationPreference()
    }

    suspend fun saveAppNotificationPreference(preference: AppNotificationPreference) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/preferences",
            "PUT",
            JSONObject()
                .put("enabled", preference.enabled)
                .put(
                    "quietHours",
                    JSONObject()
                        .put("enabled", preference.quietHoursEnabled)
                        .put("startHour", preference.quietStartHour)
                        .put("endHour", preference.quietEndHour),
                )
                .put("timezoneOffsetMinutes", preference.timezoneOffsetMinutes),
        )
        Unit
    }

    suspend fun registerAppDevice(installationId: String) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/devices",
            "POST",
            JSONObject()
                .put("installationId", installationId)
                .put("provider", "poll")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}".trim()),
        )
        Unit
    }

    suspend fun mutateTodos(revision: Int, mutations: List<TodoMutation>): TodoSnapshot =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("revision", revision)
                .put("operations", JSONArray().apply { mutations.forEach { put(it.toJson()) } })
            execute("$TODOS_PATH/mutations", "POST", body).json.toTodoSnapshotEnvelope()
        }

    suspend fun campusTimetable(): CampusTimetable = withContext(Dispatchers.IO) {
        val envelope = execute(CAMPUS_TIMETABLE_PATH).json
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
                    events = calendar.optJSONArray("events").objects().map { event ->
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
            courses = json.optJSONArray("courses").objects().map { item ->
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
        val rows = data.optJSONArray("rows").objects()
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
            sectionTimes = data.optJSONArray("sectionTimes").objects().map { item ->
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
            buildingOptions = data.optJSONArray("buildingOptions").objects().map { item ->
                CampusFreeClassroomOption(
                    value = item.optString("value"),
                    name = item.optString("name"),
                )
            },
            buildings = data.optJSONArray("buildings").objects().map { item ->
                CampusFreeClassroomBuilding(
                    number = item.optString("number"),
                    name = item.optString("name"),
                    roomCount = item.optInt("roomCount"),
                    seats = item.optInt("seats"),
                    rooms = item.optJSONArray("rooms").objects().map { room ->
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
        val response = execute("$CAMPUS_LIBROOM_SPACES_PATH$queryString")
        parseCampusReservationSpacesPayload(response.json, response.jsonArray)
    }

    suspend fun campusReservationOfficialWebSession(): PlatformWebSession = withContext(Dispatchers.IO) {
        val response = execute(CAMPUS_LIBROOM_OFFICIAL_WEBVIEW_LOGIN_PATH)
        val data = response.json.optJSONObject("data") ?: response.json
        val url = data.optString("url").takeIf { it.isNotBlank() }
            ?: throw ApiException("服务端未返回学校官方预约地址。", 500, "LIBROOM_OFFICIAL_URL_MISSING")
        PlatformWebSession(
            url = url,
            cookies = data.optJSONArray("cookies").objects().mapNotNull { item ->
                val cookieUrl = item.optString("url").takeIf { it.startsWith("https://") } ?: return@mapNotNull null
                val cookieValue = item.optString("value").takeIf { "=" in it } ?: return@mapNotNull null
                PlatformWebCookie(cookieUrl, cookieValue)
            },
        )
    }

    suspend fun librarySeatOfficialWebSession(): PlatformWebSession = withContext(Dispatchers.IO) {
        val response = execute(CAMPUS_LIBRARY_SEAT_OFFICIAL_WEBVIEW_LOGIN_PATH)
        val data = response.json.optJSONObject("data") ?: response.json
        val url = data.optString("url").takeIf { it.isNotBlank() }
            ?: throw ApiException("服务端未返回学校座位预约地址。", 500, "LIBRARY_SEAT_OFFICIAL_URL_MISSING")
        PlatformWebSession(
            url = url,
            cookies = data.optJSONArray("cookies").objects().mapNotNull { item ->
                val cookieUrl = item.optString("url").takeIf { it.startsWith("https://") } ?: return@mapNotNull null
                val cookieValue = item.optString("value").takeIf { "=" in it } ?: return@mapNotNull null
                PlatformWebCookie(cookieUrl, cookieValue)
            },
        )
    }

    suspend fun librarySeatOverview(): LibrarySeatOverview = withContext(Dispatchers.IO) {
        parseLibrarySeatOverviewPayload(execute(CAMPUS_LIBRARY_SEAT_OVERVIEW_PATH).json)
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
        parseLibrarySeatAreasPayload(execute("$CAMPUS_LIBRARY_SEAT_AREAS_PATH$query").json)
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
        parseLibrarySeatSeatsPayload(execute("$CAMPUS_LIBRARY_SEAT_SEATS_PATH$query").json)
    }

    suspend fun submitLibrarySeatReservation(request: LibrarySeatReservationRequest): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("seatId", request.seatId)
            .put("date", request.date)
            .put("startMinute", request.startMinute)
            .put("endMinute", request.endMinute)
            .put("capToken", request.capToken)
        execute(CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH, method = "POST", body = body)
    }

    suspend fun campusReservationRules(spaceId: Int): String = withContext(Dispatchers.IO) {
        val response = execute("$CAMPUS_LIBROOM_RULES_PATH?spaceId=$spaceId")
        val data = response.json.opt("data") ?: response.json
        formatCampusReservationRulesForDisplay(data)
    }

    suspend fun campusReservationAvailability(spaceId: Int, date: String): CampusReservationAvailability = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AVAILABILITY_PATH?spaceId=$spaceId&date=${encodePath(date)}"
        val response = execute(path)
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
        execute(CAMPUS_LIBROOM_RESERVATIONS_PATH, method = "POST", body = body)
    }

    suspend fun campusMyReservations(): List<CampusMyReservation> = withContext(Dispatchers.IO) {
        val response = execute(CAMPUS_LIBROOM_RESERVATIONS_PATH)
        val data = response.json.optJSONArray("data") ?: response.jsonArray
        data.objects().map { it.toCampusMyReservation() }
    }

    suspend fun cancelCampusReservation(reservationId: String): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_RESERVATIONS_PATH/${encodePath(reservationId)}/cancel"
        execute(path, method = "POST")
    }

    suspend fun campusAutoReservations(): List<CampusAutoReservationTask> = withContext(Dispatchers.IO) {
        val response = execute(CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH)
        val data = response.json.optJSONArray("data") ?: response.jsonArray
        data.objects().map { it.toCampusAutoReservationTask() }
    }

    suspend fun createCampusAutoReservation(task: CampusAutoReservationTask): CampusAutoReservationTask = withContext(Dispatchers.IO) {
        val response = execute(CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH, method = "POST", body = task.toJson())
        val data = response.json.optJSONObject("data") ?: response.json
        data.toCampusAutoReservationTask()
    }

    suspend fun updateCampusAutoReservation(task: CampusAutoReservationTask): CampusAutoReservationTask = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH/${encodePath(task.id)}"
        val response = execute(path, method = "PUT", body = task.toJson())
        val data = response.json.optJSONObject("data") ?: response.json
        data.toCampusAutoReservationTask()
    }

    suspend fun deleteCampusAutoReservation(taskId: String): Unit = withContext(Dispatchers.IO) {
        val path = "$CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH/${encodePath(taskId)}"
        execute(path, method = "DELETE")
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

    private suspend fun campusData(path: String): JSONObject {
        val envelope = execute(path).json
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

    suspend fun resourceExpiries(): List<ResourceExpiry> = withContext(Dispatchers.IO) {
        execute(RESOURCE_EXPIRIES_PATH).json.optJSONArray("data").objects().map { item ->
            ResourceExpiry(
                id = item.optString("id"),
                type = item.optString("type"),
                name = item.optString("name", "未命名资源"),
                expiresAt = item.optString("expiresAt"),
                advanceNoticeDays = item.optInt("advanceNoticeDays").coerceAtLeast(0),
            )
        }
    }

    suspend fun releases(): ReleaseData = withContext(Dispatchers.IO) {
        val json = execute("/api/releases").json
        ReleaseData(
            builds = json.optJSONArray("builds").objects().map { item ->
                ReleaseBuild(
                    id = item.optString("id"),
                    status = item.optString("status", "unknown"),
                    conclusion = item.optString("conclusion", item.optString("status", "unknown")),
                    revision = item.optString("revision", item.optString("sha", "")),
                    createdAt = item.nullableString("createdAt") ?: item.nullableString("startedAt"),
                    components = item.optJSONArray("artifacts").objects().mapNotNull { it.nullableString("component") },
                )
            },
        )
    }

    suspend fun backupQuality(): BackupQuality = withContext(Dispatchers.IO) {
        val json = execute("/api/backups/quality").json
        val latest = json.optJSONObject("latestBackup")
        val offsite = json.optJSONObject("offsite") ?: JSONObject()
        val capabilities = json.optJSONObject("capabilities") ?: JSONObject()
        BackupQuality(
            latestName = latest?.nullableString("name"),
            latestAt = latest?.nullableString("createdAt"),
            ageHours = json.optDoubleOrNull("ageHours"),
            rpoHours = json.optInt("rpoHours", 26),
            rpoState = json.optString("rpoState", "unknown"),
            validBackups = json.optInt("validBackups"),
            offsiteConfigured = offsite.optBoolean("configured"),
            offsiteHealthy = if (offsite.has("healthy") && !offsite.isNull("healthy")) offsite.optBoolean("healthy") else null,
            canBackup = capabilities.optBoolean("canBackup"),
            checkedAt = json.nullableString("checkedAt"),
        )
    }

    suspend fun security(): SecurityData = withContext(Dispatchers.IO) {
        val json = execute("/api/security/sessions").json
        val currentNonce = json.optString("currentNonce")
        val security = json.optJSONObject("security") ?: JSONObject()
        SecurityData(
            sessions = json.optJSONArray("sessions").objects().map { item ->
                SecuritySession(
                    nonce = item.optString("nonce"),
                    subject = item.optString("subject"),
                    role = item.optString("role", "viewer"),
                    ip = item.optString("ip", "--"),
                    userAgent = item.optString("userAgent", "未知设备"),
                    createdAt = item.nullableString("createdAt"),
                    lastSeenAt = item.nullableString("lastSeenAt"),
                    expiresAt = item.nullableString("expiresAt"),
                    sessionKind = item.optString("sessionKind", "browser"),
                    parentSessionNonce = item.nullableString("parentSessionNonce"),
                    deviceId = item.nullableString("deviceId"),
                    current = item.optString("nonce") == currentNonce,
                )
            },
            totpEnabled = security.optBoolean("totpEnabled"),
            passkeyCount = security.optInt("passkeyCount"),
            recoveryCodesRemaining = security.optInt("recoveryCodesRemaining"),
            sessionTtlHours = security.optInt("sessionTtlHours"),
            sessionIdleMinutes = security.optInt("sessionIdleMinutes"),
        )
    }

    suspend fun revokeSession(nonce: String): Unit = withContext(Dispatchers.IO) {
        execute("/api/security/sessions/${encodePath(nonce)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun changePassword(password: String, newPassword: String, totp: String = ""): Boolean =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("password", password)
                .put("newPassword", newPassword)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/password", "POST", body).json.optBoolean("currentSessionRevoked")
        }

    suspend fun beginTotpEnrollment(password: String, totp: String = ""): TotpEnrollment =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val enrollment = execute("/api/security/totp/enrollment", "POST", body).json
                .optJSONObject("enrollment")
                ?: throw ApiException("服务器未返回动态验证注册参数。", 500, "TOTP_ENROLLMENT_MISSING")
            TotpEnrollment(
                secret = enrollment.optString("secret"),
                uri = enrollment.optString("uri"),
                qrDataUrl = enrollment.nullableString("qrDataUrl"),
                expiresAt = enrollment.nullableString("expiresAt"),
            )
        }

    suspend fun confirmTotpEnrollment(code: String): List<String> = withContext(Dispatchers.IO) {
        execute("/api/security/totp/confirm", "POST", JSONObject().put("totp", code.trim())).json
            .optJSONArray("recoveryCodes").toStringList()
    }

    suspend fun regenerateRecoveryCodes(password: String, totp: String = ""): List<String> =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/totp/recovery-codes", "POST", body).json
                .optJSONArray("recoveryCodes").toStringList()
        }

    suspend fun disableTotp(password: String, totp: String = ""): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("password", password)
        if (totp.isNotBlank()) body.put("totp", totp.trim())
        execute("/api/security/totp", "DELETE", body).json.optBoolean("currentSessionRevoked")
    }

    suspend fun passkeys(): List<PlatformPasskey> = withContext(Dispatchers.IO) {
        execute("/api/security/passkeys").json.optJSONArray("passkeys").objects().map { item ->
            PlatformPasskey(
                id = item.optString("id"),
                name = item.optString("name", "Passkey"),
                deviceType = item.nullableString("deviceType"),
                createdAt = item.nullableString("createdAt"),
                lastUsedAt = item.nullableString("lastUsedAt"),
            )
        }
    }

    suspend fun beginPasskeyRegistration(password: String, totp: String = ""): PasskeyRegistrationChallenge =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val json = execute("/api/security/passkeys/options", "POST", body).json
            PasskeyRegistrationChallenge(
                challengeId = json.optString("challengeId"),
                optionsJson = json.optJSONObject("options")?.toString()
                    ?: throw ApiException("服务器未返回 Passkey 注册参数。", 500, "PASSKEY_OPTIONS_MISSING"),
            )
        }

    suspend fun completePasskeyRegistration(
        challengeId: String,
        responseJson: String,
        name: String,
    ): Unit = withContext(Dispatchers.IO) {
        execute(
            "/api/security/passkeys/verify",
            "POST",
            JSONObject()
                .put("challengeId", challengeId)
                .put("response", JSONObject(responseJson))
                .put("name", name),
        )
        Unit
    }

    suspend fun deletePasskey(id: String, password: String, totp: String = ""): Unit =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/passkeys/${encodePath(id)}", "DELETE", body)
            Unit
        }

    suspend fun iot(): IotData = withContext(Dispatchers.IO) {
        val status = execute("/apps/iot/api/status").json
        val devicesJson = execute("/apps/iot/api/devices").json
        val scenesJson = execute("/apps/iot/api/automations/scenes").jsonArray
        val rulesJson = execute("/apps/iot/api/automations/rules").jsonArray
        val runsJson = execute("/apps/iot/api/automations/runs?limit=20").jsonArray
        val now = System.currentTimeMillis()
        val devices = devicesJson.keys().asSequence().mapNotNull { id ->
            devicesJson.optJSONObject(id)?.let { item ->
                val lastActive = item.optLongOrNull("lastActive")
                val onlineStatus = item.nullableString("onlineStatus")
                val relays = item.optJSONObject("relays")?.let { relayJson ->
                    relayJson.keys().asSequence().associateWith { relayId ->
                        relayJson.nullableString(relayId)?.uppercase()
                    }
                } ?: emptyMap()
                val relayOnline = relays.isNotEmpty() && relays.values.any { it != null }
                val online = when {
                    item.has("online") -> item.optBoolean("online")
                    onlineStatus?.equals("online", ignoreCase = true) == true -> true
                    relayOnline -> true
                    else -> lastActive != null && now - lastActive < 180_000
                }
                DeviceInfo(
                    id = id,
                    name = item.optString("name", item.optString("deviceName", id)),
                    online = online,
                    temperature = item.optDoubleOrNull("temperature") ?: item.optDoubleOrNull("temp"),
                    humidity = item.optDoubleOrNull("humidity") ?: item.optDoubleOrNull("hum"),
                    lastActive = lastActive,
                    relays = relays,
                )
            }
        }.toList()
        val insights = devices
            .filter { it.temperature != null || it.humidity != null }
            .mapNotNull { device ->
                try {
                    execute(
                        "/apps/iot/api/devices/${encodePath(device.id)}/insights?range=24h",
                    ).json.toDeviceTelemetryInsight(device)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: ApiException) {
                    if (shouldInvalidatePlatformSession(error.status, error.code)) throw error
                    null
                } catch (_: IOException) {
                    null
                }
            }
        IotData(
            mqttConnected = status.optBoolean("mqttConnected"),
            deviceOnline = status.optBoolean("deviceOnline"),
            connectionState = status.optString("connectionState", "unknown"),
            messagesReceived = status.optLong("messagesReceived"),
            devices = devices,
            scenes = scenesJson.objects().map { item ->
                IotScene(
                    id = item.optString("id"),
                    name = item.optString("name", "未命名场景"),
                    actionCount = item.optJSONArray("actions")?.length() ?: 0,
                    updatedAt = item.nullableString("updated_at") ?: item.nullableString("updatedAt"),
                    actions = item.optJSONArray("actions").objects().map { action ->
                        IotSceneAction(
                            deviceId = action.optString("deviceId"),
                            relayId = action.optString("relayId"),
                            status = action.optString("status", "OFF").uppercase(),
                        )
                    },
                )
            },
            rules = rulesJson.objects().mapNotNull { item ->
                val condition = item.optJSONObject("condition") ?: return@mapNotNull null
                AutomationRule(
                    id = item.optString("id"),
                    name = item.optString("name", "未命名规则"),
                    enabled = item.optBoolean("enabled", true),
                    condition = AutomationCondition(
                        deviceId = condition.optString("deviceId"),
                        metric = condition.optString("metric"),
                        operator = condition.optString("operator"),
                        value = condition.opt("value")?.toString().orEmpty(),
                        relayId = condition.nullableString("relayId"),
                    ),
                    actions = item.optJSONArray("actions").objects().map { action ->
                        IotSceneAction(
                            deviceId = action.optString("deviceId"),
                            relayId = action.optString("relayId"),
                            status = action.optString("status", "OFF").uppercase(),
                        )
                    },
                    cooldownSeconds = item.optInt("cooldown_seconds", 300),
                    version = item.optInt("version", 1),
                    createdAt = item.optLongOrNull("created_at"),
                    updatedAt = item.optLongOrNull("updated_at"),
                    lastTriggeredAt = item.optLongOrNull("last_triggered_at"),
                )
            },
            runs = runsJson.objects().map { item ->
                AutomationRun(
                    id = item.optString("id"),
                    sourceType = item.optString("source_type"),
                    sourceId = item.optString("source_id"),
                    sourceName = item.optString("source_name", "自动化"),
                    actor = item.optString("actor"),
                    state = item.optString("state", "unknown"),
                    deviceConfirmed = item.optBoolean("device_confirmed", false),
                    results = item.optJSONArray("results").objects().map { result ->
                        AutomationRunResult(
                            deviceId = result.optString("deviceId"),
                            relayId = result.optString("relayId"),
                            status = result.optString("status"),
                            state = result.optString("state", "unknown"),
                            message = result.optString("message"),
                        )
                    },
                    createdAt = item.optLongOrNull("created_at"),
                )
            },
            insights = insights,
        )
    }

    suspend fun ct8(): Ct8Data = withContext(Dispatchers.IO) {
        val statsEnvelope = execute("/apps/core/api/ct8/stats").json
        val statusEnvelope = execute("/apps/core/api/ct8/status?limit=6").json
        val stats = statsEnvelope.optJSONObject("stats") ?: JSONObject()
        val status = statusEnvelope.optJSONObject("data") ?: JSONObject()
        val active = status.optJSONObject("activeTask")
        val latest = status.optJSONObject("latest") ?: status.optJSONArray("runs").objects().firstOrNull()
        Ct8Data(
            totalHosts = stats.optIntOrNull("totalHosts") ?: latest?.optIntOrNull("total_accounts"),
            successHosts = stats.optIntOrNull("successHosts") ?: latest?.optIntOrNull("success_count"),
            failedHosts = stats.optIntOrNull("failedHosts") ?: latest?.optIntOrNull("failed_count"),
            activeStatus = active?.optString("status", "idle") ?: "idle",
            latestStatus = latest?.optString("status", latest.optStringOr("workflow_conclusion", "unknown")) ?: "unknown",
            latestRunId = latest?.nullableString("run_id") ?: latest?.nullableString("id"),
            lastRunAt = stats.nullableString("lastRunTime")
                ?: latest?.nullableString("start_time")
                ?: latest?.nullableString("createdAt"),
        )
    }

    suspend fun runDiagnostics(): DiagnosticData = withContext(Dispatchers.IO) {
        val json = execute("/api/diagnostics/run", "POST", JSONObject(), timeoutSeconds = 45).json
        DiagnosticData(
            checks = json.optJSONArray("checks").objects().map { item ->
                DiagnosticCheck(
                    id = item.optString("id"),
                    label = item.optString("label", item.optString("id", "检查项")),
                    status = item.optString("status", "unknown"),
                    message = item.optString("message", item.optString("detail")),
                )
            },
            checkedAt = json.nullableString("checkedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun triggerBackup(): Unit = withContext(Dispatchers.IO) {
        execute("/api/backups/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun triggerCt8(): Unit = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/trigger", "POST", JSONObject().put("inputs", JSONObject()), timeoutSeconds = 45)
        Unit
    }

    suspend fun runIotScene(id: String): Unit = withContext(Dispatchers.IO) {
        execute("/apps/iot/api/automations/scenes/${encodePath(id)}/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun createIotScene(name: String, actions: List<IotSceneAction>): Unit = withContext(Dispatchers.IO) {
        execute("/apps/iot/api/automations/scenes", "POST", sceneBody(name, actions))
        Unit
    }

    suspend fun updateIotScene(id: String, name: String, actions: List<IotSceneAction>): Unit =
        withContext(Dispatchers.IO) {
            execute(
                "/apps/iot/api/automations/scenes/${encodePath(id)}",
                "PUT",
                sceneBody(name, actions),
            )
            Unit
        }

    suspend fun deleteIotScene(id: String): Unit = withContext(Dispatchers.IO) {
        execute("/apps/iot/api/automations/scenes/${encodePath(id)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun createIotRule(
        name: String,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): Unit = withContext(Dispatchers.IO) {
        execute(
            "/apps/iot/api/automations/rules",
            "POST",
            automationRuleBody(name, true, condition, actions, cooldownSeconds),
        )
        Unit
    }

    suspend fun updateIotRule(
        id: String,
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): Unit = withContext(Dispatchers.IO) {
        execute(
            "/apps/iot/api/automations/rules/${encodePath(id)}",
            "PUT",
            automationRuleBody(name, enabled, condition, actions, cooldownSeconds),
        )
        Unit
    }

    suspend fun setIotRuleEnabled(id: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        execute(
            "/apps/iot/api/automations/rules/${encodePath(id)}",
            "PUT",
            JSONObject().put("enabled", enabled),
        )
        Unit
    }

    suspend fun deleteIotRule(id: String): Unit = withContext(Dispatchers.IO) {
        execute("/apps/iot/api/automations/rules/${encodePath(id)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun controlIotRelay(deviceId: String, relayId: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        execute(
            "/apps/iot/api/devices/${encodePath(deviceId)}/relays/${encodePath(relayId)}/control",
            "POST",
            JSONObject().put("status", if (enabled) "ON" else "OFF"),
            timeoutSeconds = 15,
        )
        Unit
    }

    suspend fun googleAccounts(): GoogleAccountSnapshot = withContext(Dispatchers.IO) {
        execute("/api/google-accounts").json.toGoogleAccountSnapshot()
    }

    suspend fun replaceGoogleAccounts(
        accounts: List<GoogleAccountRecord>,
        revision: Int,
    ): GoogleAccountSnapshot = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("revision", revision)
            .put("accounts", JSONArray().apply { accounts.forEach { put(it.toGoogleAccountJson()) } })
        execute("/api/google-accounts", "PUT", body).json.toGoogleAccountSnapshot()
    }

    private fun execute(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = true,
        timeoutSeconds: Long = 30,
    ): ApiResponse {
        val requestBuilder = Request.Builder()
            .url("${BuildConfig.PLATFORM_BASE_URL}$path")
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .header("X-Platform-Device-Id", sessionStore.readOrCreateDeviceId())
        if (authenticated) {
            val cookie = sessionStore.readCookie()
                ?: throw ApiException("登录会话已失效，请重新登录。", 401, "UNAUTHORIZED")
            requestBuilder.header("Cookie", cookie)
        }
        if (method != "GET") {
            requestBuilder.header("X-Platform-Request", "console")
            if (platformOrigin.isNotBlank()) requestBuilder.header("Origin", platformOrigin)
        }
        val requestBody = if (method == "GET") null else (body ?: JSONObject()).toString().toRequestBody(jsonMediaType)
        requestBuilder.method(method, requestBody)

        val requestClient = if (timeoutSeconds == 30L) client else client.newBuilder()
            .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .build()
        val cacheable = method == "GET" && (path in CACHEABLE_PATHS || path.isIotInsightPath()) &&
            (path != AUTH_STATUS_PATH || authenticated)
        try {
            requestClient.newCall(requestBuilder.build()).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val json = parseJsonObject(raw)
                val jsonArray = parseJsonArray(raw)
                if (!response.isSuccessful) {
                    if (shouldInvalidatePlatformSession(response.code, json.optString("code"))) {
                        sessionStore.clear()
                    }
                    throw ApiException(
                        json.optString("message", json.optString("error", "请求失败（HTTP ${response.code}）")),
                        response.code,
                        json.optString("code", "HTTP_ERROR"),
                        json.optJSONObject("details"),
                    )
                }
                if (authenticated) sessionStore.markUsed()
                if (cacheable) snapshotStore.write(path, raw)
                offline = false
                cachedAtMillis = null
                return ApiResponse(json, jsonArray, extractSessionCookie(response.headers.values("Set-Cookie")))
            }
        } catch (error: IOException) {
            val snapshot = if (cacheable) snapshotStore.read(path) else null
            offline = true
            cachedAtMillis = snapshot?.savedAtMillis
            if (snapshot == null) throw error
            return ApiResponse(
                json = parseJsonObject(snapshot.body),
                jsonArray = parseJsonArray(snapshot.body),
                cookie = null,
            )
        }
    }

    private fun parseJsonObject(raw: String): JSONObject = runCatching {
        if (raw.isBlank() || raw.trimStart().startsWith("[")) JSONObject() else JSONObject(raw)
    }.getOrElse { JSONObject() }

    private fun parseJsonArray(raw: String): JSONArray = runCatching {
        if (raw.trimStart().startsWith("[")) JSONArray(raw) else JSONArray()
    }.getOrElse { JSONArray() }

    private fun ApiResponse.toLoginResult(
        user: PlatformUser,
        recoveryCodes: List<String> = emptyList(),
    ): LoginResult {
        val cookie = cookie ?: throw ApiException("服务器未返回安全会话。", 500, "SESSION_MISSING")
        val session = json.optJSONObject("session") ?: JSONObject()
        val expiresAtMillis = session.nullableString("expiresAt")
            ?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: decodeSessionExpiry(cookie)
        if (expiresAtMillis <= System.currentTimeMillis()) {
            throw ApiException("服务器返回的会话有效期无效。", 500, "SESSION_EXPIRY_INVALID")
        }
        return LoginResult(
            user = user,
            sessionCookie = cookie,
            sessionExpiresAtMillis = expiresAtMillis,
            sessionIdleMinutes = session.optInt("idleTimeoutMinutes", 30).coerceAtLeast(1),
            recoveryCodes = recoveryCodes,
        )
    }

    private fun decodeSessionExpiry(cookie: String): Long {
        return runCatching {
            val token = cookie.substringAfter('=', "")
            val payload = token.substringBefore('.')
            val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            JSONObject(String(decoded, StandardCharsets.UTF_8)).optLong("exp") * 1000L
        }.getOrDefault(0L)
    }

    private fun extractSessionCookie(headers: List<String>): String? = headers
        .map { it.substringBefore(';').trim() }
        .firstOrNull { it.startsWith("__Host-my_platform_session=") || it.startsWith("my_platform_session=") }

    private fun encodePath(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private fun String.isIotInsightPath(): Boolean =
        startsWith("/apps/iot/api/devices/") && endsWith("/insights?range=24h")

    private fun sceneBody(name: String, actions: List<IotSceneAction>): JSONObject = JSONObject()
        .put("name", name.trim())
        .put(
            "actions",
            JSONArray().apply {
                actions.forEach { action ->
                    put(
                        JSONObject()
                            .put("deviceId", action.deviceId)
                            .put("relayId", action.relayId)
                            .put("status", action.status.uppercase()),
                    )
                }
            },
        )

    private fun automationRuleBody(
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): JSONObject = JSONObject()
        .put("name", name.trim())
        .put("enabled", enabled)
        .put(
            "condition",
            JSONObject()
                .put("deviceId", condition.deviceId)
                .put("metric", condition.metric)
                .put("operator", condition.operator)
                .put(
                    "value",
                    if (condition.metric in setOf("temperature", "humidity")) {
                        condition.value.toDoubleOrNull() ?: condition.value
                    } else {
                        condition.value.uppercase()
                    },
                )
                .apply { condition.relayId?.let { put("relayId", it) } },
        )
        .put("cooldownSeconds", cooldownSeconds.coerceIn(5, 86_400))
        .put(
            "actions",
            JSONArray().apply {
                actions.forEach { action ->
                    put(
                        JSONObject()
                            .put("deviceId", action.deviceId)
                            .put("relayId", action.relayId)
                            .put("status", action.status.uppercase()),
                    )
                }
            },
        )

    private data class ApiResponse(val json: JSONObject, val jsonArray: JSONArray, val cookie: String?)

    private companion object {
        const val AUTH_STATUS_PATH = "/api/auth/status"
        const val EXTERNAL_APPLICATIONS_PATH = "/api/external-apps"
        const val TODOS_PATH = "/apps/core/api/todos"
        const val RESOURCE_EXPIRIES_PATH = "/apps/core/api/resources/expiry-summary"
        val CACHEABLE_PATHS = setOf(
            AUTH_STATUS_PATH,
            "/api/operations/overview",
            "/api/incidents?limit=100",
            "/api/tasks?limit=100",
            EXTERNAL_APPLICATIONS_PATH,
            TODOS_PATH,
            CAMPUS_TIMETABLE_PATH,
            RESOURCE_EXPIRIES_PATH,
            "/apps/iot/api/status",
            "/apps/iot/api/devices",
            "/apps/iot/api/automations/scenes",
            "/apps/iot/api/automations/rules",
            "/apps/iot/api/automations/runs?limit=20",
        )
    }
}

private fun JSONObject.toDeviceTelemetryInsight(fallbackDevice: DeviceInfo): DeviceTelemetryInsight {
    val device = optJSONObject("device") ?: JSONObject()
    val summary = optJSONObject("summary") ?: JSONObject()
    return DeviceTelemetryInsight(
        deviceId = device.optString("id", fallbackDevice.id),
        deviceName = device.optString("name", fallbackDevice.name),
        state = device.optString("state", if (fallbackDevice.online) "healthy" else "offline"),
        range = optString("range", "24h"),
        generatedAt = optLongOrNull("generatedAt"),
        sampleCount = summary.optInt("samples"),
        temperature = summary.optJSONObject("temperature").toTelemetryMetricSummary(),
        humidity = summary.optJSONObject("humidity").toTelemetryMetricSummary(),
        anomalyCount = summary.optInt("anomalyCount"),
        series = optJSONArray("series").objects().mapNotNull { item ->
            val createdAt = item.optLongOrNull("created_at") ?: return@mapNotNull null
            TelemetrySeriesPoint(
                createdAt = createdAt,
                sampleCount = item.optInt("sampleCount"),
                temperature = item.optDoubleOrNull("temp"),
                humidity = item.optDoubleOrNull("hum"),
            )
        },
    )
}

private fun JSONObject?.toTelemetryMetricSummary(): TelemetryMetricSummary {
    val json = this ?: JSONObject()
    return TelemetryMetricSummary(
        count = json.optInt("count"),
        minimum = json.optDoubleOrNull("min"),
        maximum = json.optDoubleOrNull("max"),
        average = json.optDoubleOrNull("average"),
    )
}

internal fun parseExternalApplications(json: JSONObject): List<ExternalApplication> =
    json.optJSONArray("applications").objects().map { item ->
        val health = item.optJSONObject("health") ?: JSONObject()
        ExternalApplication(
            id = item.optString("id"),
            name = item.optString("name", "外部应用"),
            description = item.optString("description"),
            launchUrl = item.optString("launchUrl"),
            healthUrl = item.nullableString("healthUrl"),
            requiredRole = item.optString("requiredRole", "viewer"),
            openMode = item.optString("openMode", "webview"),
            enabled = item.optBoolean("enabled", true),
            canAccess = item.optBoolean("canAccess", false),
            health = ExternalApplicationHealth(
                state = health.optString("state", "unmonitored"),
                httpStatus = health.optIntOrNull("httpStatus"),
                latencyMs = health.optLongOrNull("latencyMs"),
                checkedAt = health.nullableString("checkedAt"),
            ),
        )
    }

internal fun parseExternalApplicationLaunch(json: JSONObject) = ExternalApplicationLaunch(
    loginUrl = json.optString("loginUrl"),
    openMode = json.optString("openMode", "webview"),
    expiresAt = json.nullableString("expiresAt"),
    autoLogin = json.optJSONObject("autoLogin")?.let { autoLogin ->
        ExternalApplicationAutoLogin(
            loginUrl = autoLogin.optString("loginUrl"),
            username = autoLogin.optString("username"),
            password = autoLogin.optString("password"),
            homeUrl = autoLogin.nullableString("homeUrl"),
        )
    },
)

private fun JSONObject?.toPlatformUser(): PlatformUser {
    val json = this ?: throw ApiException("登录响应缺少账号信息。", 500, "USER_MISSING")
    return PlatformUser(
        username = json.optString("username", "admin"),
        role = json.optString("role", "viewer"),
        totpEnabled = json.optBoolean("totpEnabled"),
        passkeyCount = json.optInt("passkeyCount"),
    )
}

private fun JSONObject.toQrLoginTarget(): QrLoginTarget {
    val browser = optJSONObject("browser") ?: JSONObject()
    return QrLoginTarget(
        requestId = optString("requestId"),
        status = optString("status", "scanned"),
        verificationCode = optString("verificationCode"),
        browser = QrLoginBrowser(
            label = browser.optString("label", "未知浏览器"),
            ip = browser.optString("ip", "未知 IP"),
            userAgent = browser.optString("userAgent", "未知设备"),
        ),
        expiresAt = optString("expiresAt"),
        confirmationMethod = optString("confirmationMethod", "biometric"),
    )
}

private fun JSONObject.toServiceInfo() = ServiceInfo(
    id = optString("id"),
    name = optString("shortName", optString("name", optString("id", "服务"))),
    category = optString("category", "service"),
    state = optString("state", "unmonitored"),
    latencyMs = optLongOrNull("latencyMs"),
    httpStatus = optIntOrNull("httpStatus"),
    adminUrl = nullableString("adminUrl"),
)

private fun JSONObject.toIncidentInfo() = IncidentInfo(
    id = optString("id"),
    title = optString("title", "系统异常"),
    description = optString("description"),
    severity = optString("severity", "warning"),
    status = optString("status", "open"),
    source = optString("source", "platform"),
    serviceId = nullableString("serviceId"),
    openedAt = nullableString("openedAt"),
    updatedAt = nullableString("updatedAt") ?: nullableString("lastSeenAt"),
)

private fun JSONObject.toAuditInfo() = AuditInfo(
    id = optString("id", optString("_id")),
    action = optString("action", "platform.event"),
    actor = optString("actor", "system"),
    outcome = optString("outcome", "success"),
    occurredAt = nullableString("occurredAt") ?: nullableString("createdAt"),
)

private fun JSONObject.toGoogleAccountSnapshot(): GoogleAccountSnapshot {
    val data = optJSONArray("accounts") ?: optJSONArray("data") ?: JSONArray()
    return GoogleAccountSnapshot(
        accounts = data.toGoogleAccounts(),
        revision = optInt("revision", 0).coerceAtLeast(0),
    )
}

private fun JSONArray.toGoogleAccounts(): List<GoogleAccountRecord> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let { add(it.toGoogleAccount()) }
}

private fun JSONObject.toGoogleAccount(): GoogleAccountRecord {
    val aliases = (optJSONArray("aliases") ?: JSONArray()).toGoogleAliases()
    return GoogleAccountRecord(
        id = optString("id"),
        primaryEmail = optString("primaryEmail"),
        displayName = optString("displayName"),
        emailStatus = optString("emailStatus", "unknown"),
        openAiStatus = optString("openAiStatus").ifBlank {
            if (aliases.any { it.openAiStatus == "registered" }) "registered" else "unregistered"
        },
        note = optString("note"),
        lastCheckedAt = optLongOrNull("lastCheckedAt"),
        nextReviewAt = optLongOrNull("nextReviewAt"),
        tags = (optJSONArray("tags") ?: JSONArray()).toStrings(),
        archived = optBoolean("archived", false),
        aliases = aliases,
    )
}

private fun JSONArray.toGoogleAliases(): List<GoogleAliasRecord> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let { add(it.toGoogleAlias()) }
}

private fun JSONObject.toGoogleAlias(): GoogleAliasRecord = GoogleAliasRecord(
    id = optString("id"),
    address = optString("address"),
    aliasType = optString("aliasType", "plus"),
    aliasStatus = optString("aliasStatus", "candidate"),
    openAiStatus = optString("openAiStatus", "unregistered"),
    registeredAt = optLongOrNull("registeredAt"),
    lastVerifiedAt = optLongOrNull("lastVerifiedAt"),
    note = optString("note"),
)

private fun GoogleAccountRecord.toGoogleAccountJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("primaryEmail", primaryEmail)
    put("displayName", displayName)
    put("emailStatus", emailStatus)
    put("openAiStatus", openAiStatus)
    put("note", note)
    put("lastCheckedAt", lastCheckedAt ?: JSONObject.NULL)
    put("nextReviewAt", nextReviewAt ?: JSONObject.NULL)
    put("tags", JSONArray().apply { tags.forEach { put(it) } })
    put("archived", archived)
    put("aliases", JSONArray().apply { aliases.forEach { put(it.toGoogleAliasJson()) } })
}

private fun GoogleAliasRecord.toGoogleAliasJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("address", address)
    put("aliasType", aliasType)
    put("aliasStatus", aliasStatus)
    put("openAiStatus", openAiStatus)
    put("registeredAt", registeredAt ?: JSONObject.NULL)
    put("lastVerifiedAt", lastVerifiedAt ?: JSONObject.NULL)
    put("note", note)
}

private fun JSONArray.toStrings(): List<String> = buildList {
    for (index in 0 until length()) {
        optString(index).trim().takeIf(String::isNotBlank)?.let(::add)
    }
}.distinct()

private fun JSONArray?.toInts(): List<Int> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optInt(index).takeIf { it > 0 }?.let(::add)
    }
}

private fun JSONObject.toTodoSnapshotEnvelope(): TodoSnapshot {
    val data = optJSONArray("data") ?: optJSONArray("tasks") ?: JSONArray()
    return TodoSnapshot(
        tasks = data.objects().mapNotNull(JSONObject::toTodoTask),
        revision = optInt("revision", 0).coerceAtLeast(0),
    )
}

private fun JSONArray?.objects(): List<JSONObject> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optJSONObject(index)?.let(::add)
    }
}

internal fun parseCampusReservationSpacesPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<CampusReservationSpace> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val directList = when (payload) {
        is JSONArray -> payload.objects().filter(JSONObject::isCampusReservationSpaceRow)
        is JSONObject -> payload.optJSONArray("data").objects().filter(JSONObject::isCampusReservationSpaceRow)
        else -> emptyList()
    }
    val targetList = directList.takeIf { it.isNotEmpty() } ?: findNestedCampusReservationSpaceRows(payload)
    return targetList.mapNotNull(JSONObject::toCampusReservationSpace)
}

internal fun parseLibrarySeatOverviewPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): LibrarySeatOverview {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val root = when (payload) {
        is JSONObject -> payload
        is JSONArray -> JSONObject().put("buildings", payload)
        else -> JSONObject()
    }
    val venuesSource = root.optJSONArray("buildings")
        ?: root.optJSONArray("venues")
        ?: root.optJSONArray("list")
        ?: root.optJSONArray("data")
        ?: JSONArray()
    val venues = venuesSource.objects().mapNotNull { row ->
        val id = row.seatString("id", "buildingId", "value")
        val name = row.seatString("name", "buildingName", "label").ifBlank { if (id.isNotBlank()) "场馆 $id" else "" }
        if (id.isBlank() || name.isBlank()) return@mapNotNull null
        val floorsSource = row.optJSONArray("floors")
            ?: row.optJSONArray("floorList")
            ?: row.optJSONArray("children")
            ?: JSONArray()
        LibrarySeatVenue(
            id = id,
            name = name,
            floors = floorsSource.objects().mapNotNull { floor ->
                val floorId = floor.seatString("id", "floorId", "value")
                val floorName = floor.seatString("name", "floorName", "label").ifBlank { if (floorId.isNotBlank()) "楼层 $floorId" else "" }
                if (floorId.isBlank() || floorName.isBlank()) null else LibrarySeatFloor(floorId, floorName)
            }
        )
    }
    val dates = (root.optJSONArray("dates")
        ?: root.optJSONObject("data")?.optJSONArray("dates")
        ?: json.optJSONArray("dates")
        ?: jsonArray).strings()
    return LibrarySeatOverview(venues = venues, dates = dates)
}

internal fun parseLibrarySeatAreasPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<LibrarySeatArea> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.objects()
        is JSONObject -> payload.optJSONArray("areas")?.objects()
            ?: payload.optJSONArray("pageList")?.objects()
            ?: payload.optJSONArray("list")?.objects()
            ?: payload.optJSONArray("rows")?.objects()
            ?: payload.optJSONArray("records")?.objects()
            ?: payload.optJSONObject("data")?.optJSONArray("pageList")?.objects()
            ?: payload.optJSONObject("data")?.optJSONArray("list")?.objects()
            ?: payload.optJSONObject("data")?.optJSONArray("rows")?.objects()
            ?: payload.optJSONObject("data")?.optJSONArray("records")?.objects()
            ?: emptyList()
        else -> emptyList()
    }
    return rows.mapNotNull { row ->
        val id = row.seatString("id", "roomId", "areaId", "area_id")
        if (id.isBlank()) return@mapNotNull null
        LibrarySeatArea(
            id = id,
            venueId = row.seatString("buildingId", "venueId"),
            floorId = row.seatString("floorId"),
            name = row.seatString("name", "roomName").ifBlank { "阅览区 $id" },
            nameE = row.seatString("nameE", "englishName"),
            buildingName = row.seatString("buildingName", "venueName"),
            floorName = row.seatString("floorName"),
            seatTotal = row.optionalSeatInt("seatTotal", "total"),
            seatFree = row.optionalSeatInt("seatFree", "free"),
            seatLock = row.optionalSeatInt("seatLock", "locked"),
            seatScene = row.optionalSeatInt("seatScene", "scene"),
            maxMinute = row.optionalSeatInt("maxMinute"),
            type = row.seatString("type"),
            markMode = row.optionalSeatInt("markMode"),
        )
    }
}

internal fun parseLibrarySeatSeatsPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<LibrarySeatStatus> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.objects()
        is JSONObject -> {
            val direct = mutableListOf<JSONObject>()
            val keys = payload.keys()
            while (keys.hasNext()) {
                val value = payload.opt(keys.next())
                when (value) {
                    is JSONObject -> direct.add(value)
                    is JSONArray -> direct.addAll(value.objects())
                }
            }
            direct
        }
        else -> emptyList()
    }
    return rows.mapNotNull { row ->
        val id = row.seatString("id", "seatId")
        if (id.isBlank()) return@mapNotNull null
        val status = row.seatString("status")
        LibrarySeatStatus(
            id = id,
            label = row.seatString("label", "seatNo", "no").ifBlank { id },
            name = row.seatString("name", "seatName").ifBlank { "座位 $id" },
            status = status,
            statusText = when (status.uppercase()) {
                "FREE" -> "可预约"
                "IN_USE" -> "已占用"
                "LOCK", "LOCKED" -> "锁定"
                "BROKEN" -> "不可用"
                else -> status.ifBlank { "未知" }
            },
            isFree = status.equals("FREE", ignoreCase = true),
        )
    }.sortedWith(compareBy<LibrarySeatStatus> { it.label.toIntOrNull() ?: Int.MAX_VALUE }.thenBy { it.label })
}

private fun findNestedCampusReservationSpaceRows(value: Any?): List<JSONObject> {
    val queue = ArrayDeque<Any>()
    val foundArrays = mutableListOf<List<JSONObject>>()
    if (value is JSONObject || value is JSONArray) queue.add(value)

    val seen = mutableSetOf<Any>()
    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        if (!seen.add(current)) continue
        when (current) {
            is JSONArray -> {
                val list = current.objects().filter(JSONObject::isNamedCampusReservationSpaceRow)
                if (list.isNotEmpty()) foundArrays.add(list)
                for (i in 0 until current.length()) {
                    current.opt(i)?.let { if (it is JSONObject || it is JSONArray) queue.add(it) }
                }
            }
            is JSONObject -> {
                val keys = current.keys()
                while (keys.hasNext()) {
                    current.opt(keys.next())?.let { if (it is JSONObject || it is JSONArray) queue.add(it) }
                }
            }
        }
    }
    return foundArrays.maxByOrNull { it.size } ?: emptyList()
}

private fun JSONObject.seatString(vararg keys: String): String {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        val text = opt(key)?.toString()?.trim().orEmpty()
        if (text.isNotBlank()) return text
    }
    return ""
}

private fun JSONObject.optionalSeatInt(vararg keys: String): Int {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        val value = opt(key)
        val number = when (value) {
            is Number -> value.toInt()
            else -> value?.toString()?.trim()?.toIntOrNull()
        }
        if (number != null) return number
    }
    return 0
}

private fun JSONObject.toCampusReservationSpace(): CampusReservationSpace? {
    val id = campusReservationSpaceId()
    if (id <= 0) return null
    return CampusReservationSpace(
        id = id,
        name = campusReservationSpaceName() ?: "空间 $id",
    )
}

private fun JSONObject.isCampusReservationSpaceRow(): Boolean =
    campusReservationSpaceId() > 0

private fun JSONObject.isNamedCampusReservationSpaceRow(): Boolean =
    isCampusReservationSpaceRow() && campusReservationSpaceName() != null

private fun JSONObject.campusReservationSpaceId(): Int =
    optInt("id", optInt("area_id", optInt("areaId", 0)))

private fun JSONObject.campusReservationSpaceName(): String? =
    displayString("name")
        ?: displayString("area_name")
        ?: displayString("areaName")
        ?: displayString("title")
        ?: displayString("room_name")

private fun JSONArray?.strings(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optString(index).takeIf(String::isNotBlank)?.let(::add)
    }
}

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
}

private fun JSONObject?.optStringOr(key: String, fallback: String): String = this?.optString(key, fallback) ?: fallback

private fun JSONObject.nullableString(key: String): String? =
    takeIf { has(key) && !isNull(key) }?.optString(key)?.takeIf { it.isNotBlank() }

private fun JSONObject.displayString(key: String): String? = opt(key)
    ?.takeUnless { it == JSONObject.NULL }
    ?.toString()
    ?.trim()
    ?.takeIf { it.isNotBlank() }

internal fun formatCampusReservationRulesForDisplay(value: Any?): String {
    val sections = mutableListOf<String>()
    collectCampusReservationRuleSections(value, sections)
    return sections
        .map(::htmlToPlainCampusText)
        .filter { it.isNotBlank() && it != "暂无数据" }
        .distinct()
        .joinToString("\n\n")
        .ifBlank { "暂无规则信息" }
}

private fun collectCampusReservationRuleSections(value: Any?, sections: MutableList<String>) {
    when (value) {
        null, JSONObject.NULL -> Unit
        is JSONObject -> {
            val keys = value.keys()
            while (keys.hasNext()) collectCampusReservationRuleSections(value.opt(keys.next()), sections)
        }
        is JSONArray -> {
            for (index in 0 until value.length()) collectCampusReservationRuleSections(value.opt(index), sections)
        }
        is String -> sections.add(value)
    }
}

private fun htmlToPlainCampusText(value: String): String {
    var text = decodeCampusHtmlEntities(value.trim())
    text = text
        .replace(Regex("(?i)<\\s*br\\s*/?\\s*>"), "\n")
        .replace(Regex("(?i)<\\s*/\\s*(p|div|li|tr|h[1-6])\\s*>"), "\n")
        .replace(Regex("(?i)<\\s*(p|div|li|tr|h[1-6])\\b[^>]*>"), "\n")
        .replace(Regex("<[^>]+>"), "")
    text = decodeCampusHtmlEntities(text)
    return text
        .replace('\u00A0', ' ')
        .replace(Regex("[\\t ]+"), " ")
        .lines()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .joinToString("\n")
}

private fun decodeCampusHtmlEntities(value: String): String {
    val named = value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
    return Regex("&#(x?[0-9a-fA-F]+);").replace(named) { match ->
        val raw = match.groupValues[1]
        val codePoint = if (raw.startsWith("x", ignoreCase = true)) {
            raw.drop(1).toIntOrNull(16)
        } else {
            raw.toIntOrNull()
        }
        if (codePoint != null && Character.isValidCodePoint(codePoint)) {
            String(Character.toChars(codePoint))
        } else {
            match.value
        }
    }
}

private val reservationStartTimeKeys = listOf(
    "startTime",
    "start_time",
    "start",
    "beginTime",
    "begin_time",
    "begin",
    "openTime",
    "open_time",
    "startMinute",
    "start_minute",
)

private val reservationEndTimeKeys = listOf(
    "endTime",
    "end_time",
    "end",
    "closeTime",
    "close_time",
    "finishTime",
    "finish_time",
    "endMinute",
    "end_minute",
)

private fun JSONArray?.toReservationTimeWindows(): List<CampusReservationTimeWindow> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optJSONObject(index)?.toReservationTimeWindow()?.let(::add)
        }
    }.distinct()
}

private fun JSONObject.toReservationTimeWindow(): CampusReservationTimeWindow? {
    val start = firstReservationTime(reservationStartTimeKeys)
    val end = firstReservationTime(reservationEndTimeKeys)
    return if (start != null && end != null && end > start) {
        CampusReservationTimeWindow(start = start.toReservationTimeText(), end = end.toReservationTimeText())
    } else {
        null
    }
}

private fun JSONObject.reservationTimeWindows(): List<CampusReservationTimeWindow> {
    val windows = mutableListOf<CampusReservationTimeWindow>()
    collectReservationTimeWindows(this, windows)
    return windows.distinct().ifEmpty { listOf(CampusReservationTimeWindow()) }
}

private fun collectReservationTimeWindows(value: Any?, windows: MutableList<CampusReservationTimeWindow>) {
    when (value) {
        is JSONArray -> {
            for (index in 0 until value.length()) collectReservationTimeWindows(value.opt(index), windows)
        }
        is JSONObject -> {
            val start = value.firstReservationTime(reservationStartTimeKeys)
            val end = value.firstReservationTime(reservationEndTimeKeys)
            if (start != null && end != null && end > start) {
                windows.add(CampusReservationTimeWindow(start = start.toReservationTimeText(), end = end.toReservationTimeText()))
            }
            val keys = value.keys()
            while (keys.hasNext()) collectReservationTimeWindows(value.opt(keys.next()), windows)
        }
    }
}

private fun JSONObject.firstReservationTime(keys: List<String>): Int? {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        parseReservationTime(opt(key))?.let { return it }
    }
    return null
}

private fun parseReservationTime(value: Any?): Int? {
    return when (value) {
        is Number -> value.toInt().takeIf { it in 0..1440 }
        else -> {
            val text = value?.toString()?.trim().orEmpty()
            val match = Regex("^(\\d{1,2}):([0-5]\\d)(?::[0-5]\\d)?$").matchEntire(text) ?: return null
            (match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()).takeIf { it in 0..1440 }
        }
    }
}

private fun Int.toReservationTimeText(): String {
    val hour = this / 60
    val minute = this % 60
    return String.format(Locale.ROOT, "%02d:%02d", hour, minute)
}

private fun JSONObject.optionalInt(key: String): Int? = opt(key)
    ?.takeUnless { it == JSONObject.NULL }
    ?.toString()
    ?.toIntOrNull()

private fun JSONObject.optLongOrNull(key: String): Long? =
    takeIf { has(key) && !isNull(key) }?.optLong(key)?.takeIf { it != 0L }

private fun JSONObject.optIntOrNull(key: String): Int? =
    takeIf { has(key) && !isNull(key) }?.optInt(key)

private fun JSONObject.optDoubleOrNull(key: String): Double? =
    takeIf { has(key) && !isNull(key) }?.optDouble(key)?.takeIf { it.isFinite() }

private fun JSONObject.toCampusAutoReservationTask(): CampusAutoReservationTask {
    val candidatesArray = optJSONArray("candidates") ?: JSONArray()
    val candidates = buildList {
        for (i in 0 until candidatesArray.length()) {
            val obj = candidatesArray.optJSONObject(i) ?: continue
            add(
                CampusAutoReservationCandidate(
                    areaId = obj.optInt("areaId", obj.optInt("area_id", 0)),
                    startTime = obj.optString("startTime", obj.optString("start_time", "09:00")),
                    endTime = obj.optString("endTime", obj.optString("end_time", "11:00")),
                )
            )
        }
    }
    return CampusAutoReservationTask(
        id = optString("id"),
        name = optString("name"),
        enabled = optBoolean("enabled", true),
        reservationDate = optString("reservationDate", optString("reservation_date", optString("startDate", optString("start_date", "")))),
        executeDate = optString("executeDate", optString("execute_date", optString("runDate", optString("run_date", "")))),
        executeTime = optString("executeTime", optString("execute_time", "08:30")),
        candidates = candidates,
        title = optString("title"),
        content = optString("content"),
        mobile = optString("mobile", optString("phone", "")),
        open = optBoolean("open", false),
        lastStatus = nullableString("lastStatus"),
        lastMessage = nullableString("lastMessage"),
        lastCandidateIndex = optIntOrNull("lastCandidateIndex"),
        lastExecutedAt = nullableString("lastExecutedAt"),
        createdAt = nullableString("createdAt"),
        updatedAt = nullableString("updatedAt"),
    )
}

private fun CampusAutoReservationTask.toJson(): JSONObject = JSONObject().apply {
    put("name", name.trim())
    put("enabled", enabled)
    put("reservationDate", reservationDate.trim())
    put("executeDate", executeDate.trim())
    put("executeTime", executeTime.trim())
    put("title", title.trim())
    put("content", content.trim())
    put("mobile", mobile.trim())
    put("open", open)
    val candidatesArr = JSONArray()
    candidates.forEach { candidate ->
        candidatesArr.put(
            JSONObject().apply {
                put("areaId", candidate.areaId)
                put("startTime", candidate.startTime)
                put("endTime", candidate.endTime)
            }
        )
    }
    put("candidates", candidatesArr)
}

private fun JSONObject.toCampusMyReservation(): CampusMyReservation = CampusMyReservation(
    id = optString("id", optString("order_id", optString("orderId", ""))),
    spaceId = optInt("spaceId", optInt("space_id", optInt("areaId", optInt("area_id", 0)))),
    spaceName = optString("spaceName", optString("space_name", optString("areaName", optString("area_name", optString("room_name", optString("name", "研讨间")))))),
    date = optString("date", optString("order_date", optString("reserve_date", ""))),
    startTime = optString("startTime", optString("start_time", optString("begin_time", ""))),
    endTime = optString("endTime", optString("end_time", optString("finish_time", ""))),
    title = optString("title", optString("subject", "个人预约研讨")),
    statusText = optString("statusText", optString("status_text", optString("status_name", optString("status", "预约成功")))),
    canCancel = optBoolean("canCancel", true),
    createdAt = optString("createdAt", optString("created_at", "")),
)

private fun formatCampusJsonValue(value: Any?): String = when (value) {
    null, JSONObject.NULL, "" -> "暂无数据"
    is JSONObject -> {
        val keys = value.keys()
        val lines = mutableListOf<String>()
        while (keys.hasNext()) {
            val key = keys.next()
            val item = value.opt(key)
            lines.add("$key：${formatCampusJsonValue(item)}")
        }
        lines.joinToString("\n").ifBlank { "暂无数据" }
    }
    is JSONArray -> {
        val lines = mutableListOf<String>()
        for (i in 0 until value.length()) {
            lines.add(formatCampusJsonValue(value.opt(i)))
        }
        lines.joinToString("\n").ifBlank { "暂无数据" }
    }
    else -> value.toString()
}
