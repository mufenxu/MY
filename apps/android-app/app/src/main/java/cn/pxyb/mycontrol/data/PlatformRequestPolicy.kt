package cn.pxyb.mycontrol.data

internal const val CAMPUS_TIMETABLE_PATH = "/apps/campus/api/academic/timetable"

internal fun shouldInvalidatePlatformSession(status: Int, code: String): Boolean =
    status == 401 && code in setOf(
        "UNAUTHORIZED",
        "PLATFORM_SESSION_REQUIRED",
        "ACCOUNT_DISABLED",
    )
