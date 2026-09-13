package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import android.content.Context
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.ChaoxingActivity
import cn.pxyb.mycontrol.data.ChaoxingAutoSign
import cn.pxyb.mycontrol.data.ChaoxingAutoSignCourse
import cn.pxyb.mycontrol.data.ChaoxingAutoSignLocation
import cn.pxyb.mycontrol.data.ChaoxingCourse
import cn.pxyb.mycontrol.data.ChaoxingLocation
import cn.pxyb.mycontrol.data.ChaoxingRepository
import cn.pxyb.mycontrol.data.ChaoxingSession
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import org.json.JSONObject

private const val AUTO_SIGN_MAX_TIMES = 12

data class ChaoxingUiState(
    val session: ChaoxingSession = ChaoxingSession(),
    val courses: List<ChaoxingCourse> = emptyList(),
    val course: ChaoxingCourse? = null,
    val activities: List<ChaoxingActivity> = emptyList(),
    val selected: ChaoxingActivity? = null,
    val location: ChaoxingLocation? = null,
    val autoSign: ChaoxingAutoSign = ChaoxingAutoSign(),
    val busy: Boolean = false,
    val operation: String = "",
    val loaded: Boolean = false,
    val pending: Boolean = false,
    val officialRequired: Boolean = false,
    val captchaRequired: Boolean = false,
    val message: String? = null,
    val error: Boolean = false,
)

class ChaoxingStateHolder(
    parentScope: CoroutineScope,
    private val api: ChaoxingRepository,
    private val canRun: () -> Boolean,
    private val accountName: () -> String?,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<ChaoxingUiState>(parentScope, ChaoxingUiState(), onSessionExpired) {
    override fun clearPendingState(current: ChaoxingUiState) = current.copy(
        busy = false, operation = "", location = null,
        pending = current.pending || current.operation == "sign",
        message = if (current.operation == "sign") "签到请求已中断，请刷新官方记录确认结果。" else current.message,
        error = current.error || current.operation == "sign",
    )

    private fun <T> run(operation: String, action: suspend () -> T, success: ChaoxingUiState.(T) -> ChaoxingUiState, afterSuccess: () -> Unit = {}) {
        if (!canRun()) return
        launchAction(
            isBusy = { busy },
            start = { copy(busy = true, operation = operation, message = null, error = false) },
            action = action,
            success = { result -> success(result).copy(busy = false, operation = "", loaded = true) },
            failure = { error ->
                if (error is ApiException && error.code == "CHAOXING_LOGIN_REQUIRED") {
                    ChaoxingUiState(loaded = true, message = "学习通登录已失效，请重新连接账号。", error = true)
                } else {
                    val providerError = error is ApiException && error.code.orEmpty().startsWith("CHAOXING_PROVIDER_")
                    val uncertain = operation == "sign" && !providerError && (error !is ApiException || error.status >= 500)
                    copy(busy = false, operation = "", loaded = true,
                        session = if (error is ApiException && error.code == "CHAOXING_PROVIDER_LOGIN_REQUIRED") session.copy(signProviderConnected = false) else session,
                        pending = pending || uncertain,
                        message = if (uncertain) "签到结果暂未确认，请先刷新官方记录。" else error.message ?: "操作失败，请稍后重试。", error = true,
                        officialRequired = officialRequired || error is ApiException && error.code == "CHAOXING_OFFICIAL_REQUIRED")
                }
            },
            afterSuccess = afterSuccess,
        )
    }

    fun refresh() {
        val previous = mutableState.value
        run("refresh", action = {
            val session = api.session()
            if (!session.connected) return@run ChaoxingUiState(session = session)
            val courses = api.courses()
            val course = courses.firstOrNull { it.key == previous.course?.key } ?: courses.firstOrNull()
            val activities = course?.let { api.activities(it) }.orEmpty()
            ChaoxingUiState(session = session, courses = courses, course = course, activities = activities, autoSign = api.autoSign())
        }, success = { result -> result })
    }

    fun connect(cookies: String) {
        val owner = runCatching { JSONObject(cookies).optString("owner") }.getOrNull()
        if (owner.isNullOrBlank() || owner != accountName()) {
            report("MY 账号已切换，请重新连接学习通。")
            return
        }
        run("connect", { api.connect(cookies) }, { session -> ChaoxingUiState(session = session) }, afterSuccess = ::refresh)
    }

    fun disconnect() = run("disconnect", { api.disconnect() }, { ChaoxingUiState(loaded = true) })

    fun connectSignProvider(phone: String, password: String) = run(
        "provider-connect", { api.connectSignProvider(phone, password) },
        { session -> copy(session = session, message = "帮你签服务已连接，位置签到将通过该服务提交。", error = false) },
        afterSuccess = { mutableState.value.selected?.let(::openActivity) },
    )

    fun disconnectSignProvider() = run(
        "provider-disconnect", { api.disconnectSignProvider() },
        { session -> copy(session = session, message = "已断开帮你签服务。", error = false) },
        afterSuccess = { mutableState.value.selected?.let(::openActivity) },
    )

    fun selectCourse(course: ChaoxingCourse) = run("activities", { api.activities(course) }, { activities ->
        copy(course = course, activities = activities, selected = null, location = null, pending = false, officialRequired = false, captchaRequired = false)
    })

    fun openActivity(activity: ChaoxingActivity) {
        run("detail", { api.detail(activity) }, { detail ->
            copy(selected = detail, location = null, pending = false, officialRequired = detail.requiresOfficial, captchaRequired = detail.requiresCaptcha,
                activities = activities.map { if (it.id == detail.id) detail else it })
        })
    }

    fun refreshSelected() {
        val current = mutableState.value.selected ?: return
        run("detail", { api.detail(current) }, { detail ->
            copy(selected = if (selected?.id == detail.id) detail else selected, pending = false,
                captchaRequired = !detail.signed && (captchaRequired || detail.requiresCaptcha),
                activities = activities.map { if (it.id == detail.id) detail else it },
                message = "官方当前记录：${detail.recordText}。", error = false)
        })
    }

    fun locate(context: Context) {
        val activeId = mutableState.value.selected?.id ?: return
        run("locate", { currentChaoxingLocation(context.applicationContext) }, { result ->
            copy(location = result.takeIf { selected?.id == activeId }, error = false)
        })
    }

    fun sign() = submitSign("")

    fun signWithCaptcha(activeId: String, validate: String) {
        val current = mutableState.value
        if (current.selected?.id != activeId || !current.captchaRequired || validate.isBlank()) return
        submitSign(validate)
    }

    private fun submitSign(validate: String) {
        val state = mutableState.value
        val activity = state.selected ?: return
        if (!activity.canSign || state.pending || state.officialRequired) return
        if (activity.type == "4" && state.location == null) {
            report("请先获取当前位置。")
            return
        }
        run("sign", { api.sign(activity, state.location, validate) }, { result ->
            copy(selected = if (selected?.id == activity.id) result.activity else selected,
                activities = activities.map { if (it.id == activity.id) result.activity else it },
                location = if (result.requiresCaptcha) location else null, pending = result.pending, officialRequired = result.requiresOfficial,
                captchaRequired = result.requiresCaptcha,
                message = result.message, error = !result.confirmed && !result.requiresCaptcha)
        })
    }

    fun closeActivity() {
        if (mutableState.value.operation in listOf("locate", "detail")) cancelPending()
        mutableState.update { it.copy(selected = null, location = null, pending = false, officialRequired = false, captchaRequired = false, message = null) }
    }

    fun toggleAutoSign(enabled: Boolean) {
        val settings = mutableState.value.autoSign
        if (enabled && settings.times.isEmpty()) return report("请先添加签到时刻，再开启定时签到。")
        if (enabled && settings.location == null) return report("请先保存签到位置，再开启定时签到。")
        saveAutoSign(enabled, settings.times, settings.location, settings.course)
    }

    fun addAutoSignTime(time: String) {
        val settings = mutableState.value.autoSign
        if (settings.times.size >= AUTO_SIGN_MAX_TIMES) return report("签到时刻最多设置 $AUTO_SIGN_MAX_TIMES 个。")
        if (settings.times.contains(time)) return report("$time 已经在签到时刻中。")
        saveAutoSign(settings.enabled, (settings.times + time).sorted(), settings.location, settings.course)
    }

    fun removeAutoSignTime(time: String) {
        val settings = mutableState.value.autoSign
        if (settings.times.size <= 1) return report("请至少保留一个签到时刻。")
        saveAutoSign(settings.enabled, settings.times - time, settings.location, settings.course)
    }

    fun selectAutoSignCourse(course: ChaoxingCourse?) {
        val settings = mutableState.value.autoSign
        if (settings.course?.key == course?.key) return
        saveAutoSign(settings.enabled, settings.times, settings.location, course?.let { ChaoxingAutoSignCourse(it.courseId, it.classId, it.name) })
    }

    fun saveAutoSignLocation(context: Context) {
        val settings = mutableState.value.autoSign
        run("auto-sign-location", action = {
            val fix = currentChaoxingLocation(context.applicationContext)
            api.saveAutoSign(settings.enabled, settings.times, ChaoxingAutoSignLocation(fix.latitude, fix.longitude, fix.accuracy, fix.address, fix.isMock), settings.course)
        }, success = { result -> copy(autoSign = result, message = "签到位置已保存，定时签到会使用该位置。", error = false) })
    }

    fun runAutoSign() {
        if (!mutableState.value.autoSign.enabled) return report("请先开启定时签到。")
        run("auto-sign-run", action = { api.runAutoSign() to api.autoSign() }, success = { (result, settings) ->
            copy(autoSign = settings, message = result.message.ifBlank { "定时签到已执行。" }, error = result.failed)
        })
    }

    private fun saveAutoSign(enabled: Boolean, times: List<String>, location: ChaoxingAutoSignLocation?, course: ChaoxingAutoSignCourse?) = run(
        "auto-sign-save", action = { api.saveAutoSign(enabled, times, location, course) },
        success = { result -> copy(autoSign = result, message = if (result.enabled) "定时签到已开启。" else "定时签到已关闭。", error = false) },
    )

    fun report(message: String) { mutableState.update { it.copy(message = message, error = true) } }
    fun clearFeedback() { mutableState.update { it.copy(message = null) } }
}
