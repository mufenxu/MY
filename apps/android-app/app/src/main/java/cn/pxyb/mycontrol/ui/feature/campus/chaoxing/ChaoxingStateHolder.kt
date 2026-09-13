package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import android.content.Context
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.ChaoxingActivity
import cn.pxyb.mycontrol.data.ChaoxingCourse
import cn.pxyb.mycontrol.data.ChaoxingLocation
import cn.pxyb.mycontrol.data.ChaoxingRepository
import cn.pxyb.mycontrol.data.ChaoxingSession
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class ChaoxingUiState(
    val session: ChaoxingSession = ChaoxingSession(),
    val courses: List<ChaoxingCourse> = emptyList(),
    val course: ChaoxingCourse? = null,
    val activities: List<ChaoxingActivity> = emptyList(),
    val selected: ChaoxingActivity? = null,
    val location: ChaoxingLocation? = null,
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
                    val uncertain = operation == "sign" && (error !is ApiException || error.status >= 500)
                    copy(busy = false, operation = "", loaded = true,
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
            ChaoxingUiState(session = session, courses = courses, course = course, activities = activities)
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
    fun report(message: String) { mutableState.update { it.copy(message = message, error = true) } }
    fun clearFeedback() { mutableState.update { it.copy(message = null) } }
}
