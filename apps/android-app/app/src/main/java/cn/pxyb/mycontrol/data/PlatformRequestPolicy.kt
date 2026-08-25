package cn.pxyb.mycontrol.data

internal const val CAMPUS_API_PATH = "/apps/campus/api"
internal const val CAMPUS_TIMETABLE_PATH = "$CAMPUS_API_PATH/academic/timetable"
internal const val CAMPUS_GPA_PATH = "$CAMPUS_API_PATH/academic/gpa"
internal const val CAMPUS_FREE_CLASSROOMS_PATH = "$CAMPUS_API_PATH/academic/free-classrooms"
internal const val CAMPUS_ENERGY_SUMMARY_PATH = "$CAMPUS_API_PATH/energy/summary"
internal const val CAMPUS_LIBROOM_SPACES_PATH = "$CAMPUS_API_PATH/campus/libroom/spaces"
internal const val CAMPUS_LIBROOM_RULES_PATH = "$CAMPUS_API_PATH/campus/libroom/rules"
internal const val CAMPUS_LIBROOM_AVAILABILITY_PATH = "$CAMPUS_API_PATH/campus/libroom/availability"
internal const val CAMPUS_LIBROOM_RESERVATIONS_PATH = "$CAMPUS_API_PATH/campus/libroom/reservations"
internal const val CAMPUS_LIBROOM_AUTO_RESERVATIONS_PATH = "$CAMPUS_API_PATH/campus/libroom/auto-reservations"

internal fun shouldInvalidatePlatformSession(status: Int, code: String): Boolean =
    status == 401 && code in setOf(
        "UNAUTHORIZED",
        "PLATFORM_SESSION_REQUIRED",
        "ACCOUNT_DISABLED",
    )
