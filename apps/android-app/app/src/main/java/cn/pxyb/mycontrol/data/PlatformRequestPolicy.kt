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

/** 学校账号「手机号 + 短信验证码」登录通道。 */
internal const val CAMPUS_SMS_SEND_PATH = "$CAMPUS_API_PATH/auth/login/sms/send"
internal const val CAMPUS_SMS_VERIFY_PATH = "$CAMPUS_API_PATH/auth/login/sms/verify"

/**
 * 学校账号（统一身份认证）失效的服务端语义 code。
 *
 * 由 campus-service 在响应出口归一：教务、能耗、用户中心、研讨间、座位预约等
 * 各连接器抛出的 401 文案不同，但都表示「只有用户重新登录学校账号才能恢复」。
 */
internal const val SCHOOL_ACCOUNT_REQUIRED = "SCHOOL_ACCOUNT_REQUIRED"

internal fun shouldInvalidatePlatformSession(status: Int, code: String): Boolean =
    status == 401 && code in setOf(
        "UNAUTHORIZED",
        "PLATFORM_SESSION_REQUIRED",
        "ACCOUNT_DISABLED",
        "SESSION_REFRESH_INVALID",
        "DEVICE_BINDING_REQUIRED",
        "DEVICE_KEY_UNAVAILABLE",
        "DEVICE_RISK_DETECTED",
    )

/**
 * 学校账号失效：应弹出短信登录弹窗，**不能**清掉平台会话。
 *
 * 两者必须分开：平台会话失效要回到登录页，学校账号失效只是校园数据取不到，
 * 应用其余功能仍然可用。把它并入 [shouldInvalidatePlatformSession] 会让用户
 * 在校园会话过期时被整个踢出应用。
 */
internal fun isSchoolAccountRequired(status: Int, code: String): Boolean =
    status == 401 && code == SCHOOL_ACCOUNT_REQUIRED
