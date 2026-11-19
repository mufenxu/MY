package cn.pxyb.mycontrol.ui.feature.unicom

import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.UnicomMetric
import cn.pxyb.mycontrol.data.UnicomDetails
import cn.pxyb.mycontrol.data.UnicomActivities
import cn.pxyb.mycontrol.data.UnicomCoupons
import cn.pxyb.mycontrol.data.UnicomCouponDetail
import cn.pxyb.mycontrol.data.UnicomRepository
import cn.pxyb.mycontrol.data.UnicomSession
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update

data class UnicomUiState(
    val session: UnicomSession = UnicomSession(),
    val metrics: List<UnicomMetric> = emptyList(),
    val queriedAt: Long = 0,
    val loaded: Boolean = false,
    val busy: Boolean = false,
    val operation: String = "",
    val message: String? = null,
    val error: Boolean = false,
    val details: UnicomDetails? = null,
    val activities: UnicomActivities? = null,
    val coupons: UnicomCoupons? = null,
    val selectedCouponId: String? = null,
    val couponDetail: UnicomCouponDetail? = null,
)

class UnicomStateHolder(
    parentScope: CoroutineScope,
    private val api: UnicomRepository,
    private val canRun: () -> Boolean,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<UnicomUiState>(parentScope, UnicomUiState(), onSessionExpired) {
    override fun clearPendingState(current: UnicomUiState) = current.copy(busy = false, operation = "", selectedCouponId = null, couponDetail = null)

    private fun <T> run(operation: String, action: suspend () -> T, success: UnicomUiState.(T) -> UnicomUiState, afterSuccess: () -> Unit = {}) {
        if (!canRun()) return
        launchAction(
            isBusy = { busy },
            start = { copy(busy = true, operation = operation, message = null, error = false) },
            action = action,
            success = { result -> success(result).copy(loaded = true, busy = false, operation = "") },
            failure = { error ->
                if (error is ApiException && error.code == "UNICOM_LOGIN_REQUIRED") {
                    UnicomUiState(loaded = true, message = "请重新登录联通号码后查询。", error = true)
                } else copy(busy = false, operation = operation, loaded = true, message = error.message ?: "联通请求未完成，请稍后重试。", error = true)
            },
            afterSuccess = afterSuccess,
        )
    }

    fun refresh() = run("refresh", {
        val session = api.session()
        if (!session.connected) UnicomUiState(session = session)
        else api.overview().let { UnicomUiState(it.session, it.metrics, it.queriedAt) }
    }, { result ->
        if (result.session.connected && session.maskedPhone == result.session.maskedPhone) {
            copy(session = result.session, metrics = result.metrics, queriedAt = result.queriedAt)
        } else result
    })

    fun loadDetails() = run("details", { api.details() }, { result -> copy(details = result) })

    fun loadXinjiangActivities() = run("activities", { api.xinjiangActivities() }, { result -> copy(activities = result) })

    fun loadCoupons() = run("coupons", { api.coupons() }, { result -> copy(coupons = result, selectedCouponId = null, couponDetail = null) })

    fun loadMoreCoupons() {
        val previous = mutableState.value.coupons ?: return
        if (!previous.hasMore) return
        run("moreCoupons", { api.coupons(previous.page + 1) }, { result ->
            copy(coupons = result.copy(items = (previous.items + result.items).distinctBy { it.id }))
        })
    }

    fun viewCoupon(id: String) {
        if (!canRun() || mutableState.value.busy || mutableState.value.coupons?.items?.none { it.id == id } != false) return
        mutableState.update { it.copy(selectedCouponId = id, couponDetail = null) }
        run("coupon", { api.couponDetail(id) }, { result ->
            if (selectedCouponId == id) copy(couponDetail = result) else this
        })
    }

    fun closeCoupon() = mutableState.update { it.copy(selectedCouponId = null, couponDetail = null) }

    fun startLogin(phone: String) = run("sms", { api.startLogin(phone) }, { session ->
        copy(session = session, message = if (session.stage == "sms_sent") "验证码已发送，请输入收到的短信验证码。" else null)
    })

    fun verifyCaptcha(id: String, ticket: String, randStr: String) {
        if (mutableState.value.session.loginId != id) return
        run("captcha", { api.verifyCaptcha(id, ticket, randStr) }, { session ->
            copy(session = session, message = if (session.stage == "sms_sent") "验证码已发送，请输入收到的短信验证码。" else null)
        })
    }

    fun login(id: String, code: String) {
        if (mutableState.value.session.loginId != id) return
        run("login", { api.login(id, code) }, { session -> UnicomUiState(session = session) }, afterSuccess = ::refresh)
    }

    fun disconnect() = run("disconnect", { api.disconnect() }, { session -> UnicomUiState(session = session, message = "已退出联通账号。") })
}
