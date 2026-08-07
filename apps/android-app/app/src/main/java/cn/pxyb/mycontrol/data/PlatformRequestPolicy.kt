package cn.pxyb.mycontrol.data

internal const val CAMPUS_TIMETABLE_PATH = "/api/campus/academic/timetable"

internal fun shouldInvalidatePlatformSession(status: Int, code: String): Boolean =
    status == 401 || status == 403 && code == "UNAUTHORIZED"
