package cn.pxyb.mycontrol.data

internal const val CAMPUS_API_PATH = "/apps/campus/api"
internal const val CAMPUS_TIMETABLE_PATH = "$CAMPUS_API_PATH/academic/timetable"
internal const val CAMPUS_GPA_PATH = "$CAMPUS_API_PATH/academic/gpa"
internal const val CAMPUS_FREE_CLASSROOMS_PATH = "$CAMPUS_API_PATH/academic/free-classrooms"
internal const val CAMPUS_SUMMARY_PATH = "$CAMPUS_API_PATH/campus/summary"
internal const val CAMPUS_IDENTITY_CARD_CODE_PATH = "$CAMPUS_API_PATH/identity-card/code"
internal const val CAMPUS_WATER_PATH = "$CAMPUS_API_PATH/campus/water"
internal const val CAMPUS_WATER_VALVE_PATH = "$CAMPUS_API_PATH/campus/water-valve"
internal const val CAMPUS_WATER_VALVE_BIND_PATH = "$CAMPUS_WATER_VALVE_PATH/bind"
internal const val CAMPUS_WATER_VALVE_OPEN_PATH = "$CAMPUS_WATER_VALVE_PATH/open"
internal const val CAMPUS_WATER_VALVE_CLOSE_PATH = "$CAMPUS_WATER_VALVE_PATH/close"
internal const val CAMPUS_WATER_VALVE_UNBIND_PATH = "$CAMPUS_WATER_VALVE_PATH/unbind"
internal const val CAMPUS_WATER_VALVE_REORDER_PATH = "$CAMPUS_WATER_VALVE_PATH/reorder"
internal const val CAMPUS_ENERGY_SUMMARY_PATH = "$CAMPUS_API_PATH/energy/summary"
internal const val CAMPUS_LIBROOM_SPACES_PATH = "$CAMPUS_API_PATH/campus/libroom/spaces"
internal const val CAMPUS_LIBROOM_RULES_PATH = "$CAMPUS_API_PATH/campus/libroom/rules"
internal const val CAMPUS_LIBROOM_AVAILABILITY_PATH = "$CAMPUS_API_PATH/campus/libroom/availability"
internal const val CAMPUS_LIBROOM_RESERVATIONS_PATH = "$CAMPUS_API_PATH/campus/libroom/reservations"
internal const val CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH = "$CAMPUS_API_PATH/campus/libroom/auto-reservations"
internal const val CAMPUS_LIBROOM_OFFICIAL_WEBVIEW_LOGIN_PATH = "$CAMPUS_API_PATH/campus/libroom/official-webview-login"
internal const val CAMPUS_LIBRARY_SEAT_OVERVIEW_PATH = "$CAMPUS_API_PATH/campus/library-seat/overview"
internal const val CAMPUS_LIBRARY_SEAT_AREAS_PATH = "$CAMPUS_API_PATH/campus/library-seat/areas"
internal const val CAMPUS_LIBRARY_SEAT_SEATS_PATH = "$CAMPUS_API_PATH/campus/library-seat/seats"
internal const val CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH = "$CAMPUS_API_PATH/campus/library-seat/reservations"
internal const val CAMPUS_LIBRARY_SEAT_RESERVATIONS_HISTORY_PATH = "$CAMPUS_API_PATH/campus/library-seat/reservations/history"
internal const val CAMPUS_LIBRARY_SEAT_OFFICIAL_WEBVIEW_LOGIN_PATH = "$CAMPUS_API_PATH/campus/library-seat/official-webview-login"
internal const val CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH = "$CAMPUS_API_PATH/campus/library-seat/waitlists"
internal const val CAMPUS_LIBRARY_SEAT_CURRENT_USE_PATH = "$CAMPUS_API_PATH/campus/library-seat/current-use"
internal const val CAMPUS_LIBRARY_SEAT_CURRENT_USE_CHECK_IN_PATH = "$CAMPUS_LIBRARY_SEAT_CURRENT_USE_PATH/check-in"
internal const val CAMPUS_LIBRARY_SEAT_CURRENT_USE_LEAVE_PATH = "$CAMPUS_LIBRARY_SEAT_CURRENT_USE_PATH/leave"
internal const val CAMPUS_LIBRARY_SEAT_CURRENT_USE_STOP_PATH = "$CAMPUS_LIBRARY_SEAT_CURRENT_USE_PATH/stop"
internal const val CAMPUS_LIBRARY_SEAT_TIMELINE_PATH = "$CAMPUS_API_PATH/campus/library-seat/timeline"
internal const val CAMPUS_LIBRARY_SEAT_BREACHES_PATH = "$CAMPUS_API_PATH/campus/library-seat/breaches"
internal const val CAMPUS_LIBRARY_SEAT_DOOR_LOGS_PATH = "$CAMPUS_API_PATH/campus/library-seat/door-logs"

internal fun shouldInvalidatePlatformSession(status: Int, code: String): Boolean =
    status == 401 && code in setOf(
        "UNAUTHORIZED",
        "PLATFORM_SESSION_REQUIRED",
        "ACCOUNT_DISABLED",
    )
