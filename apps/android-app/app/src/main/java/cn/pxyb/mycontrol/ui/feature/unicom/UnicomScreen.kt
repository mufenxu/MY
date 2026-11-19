package cn.pxyb.mycontrol.ui.feature.unicom

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.clipboard.rememberAppClipboard
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.util.DateTimeUtils.formatLocalDateTime
import kotlinx.coroutines.delay

@Composable
fun UnicomScreen(
    state: UnicomUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadDetails: () -> Unit,
    onLoadXinjiangActivities: () -> Unit,
    onLoadCoupons: () -> Unit,
    onLoadMoreCoupons: () -> Unit,
    onViewCoupon: (String) -> Unit,
    onCloseCoupon: () -> Unit,
    onSendSms: (String) -> Unit,
    onCaptchaVerified: (String, String, String) -> Unit,
    onLogin: (String, String) -> Unit,
    onDisconnect: () -> Unit,
) {
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var captchaId by remember { mutableStateOf<String?>(null) }
    var switching by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val clipboard = rememberAppClipboard()
    LaunchedEffect(Unit) { if (!state.loaded) onRefresh() }
    DisposableEffect(Unit) { onDispose { onCloseCoupon() } }
    LaunchedEffect(state.session.loginId, state.session.connected) {
        code = ""
        if (state.session.connected && state.session.loginId == null) { phone = ""; switching = false }
        if (captchaId != state.session.loginId) captchaId = null
    }
    LaunchedEffect(state.session.retryAt) {
        now = System.currentTimeMillis()
        while (now < state.session.retryAt) { delay(1000); now = System.currentTimeMillis() }
    }
    val remaining = ((state.session.retryAt - now + 999) / 1000).coerceAtLeast(0)
    val session = state.session
    AppSubPage(
        title = "联通账户", subtitle = "账户余量、套餐、卡券与新疆活动",
        onBack = onBack, contentPadding = contentPadding,
        refreshing = state.busy && state.operation == "refresh", onRefresh = onRefresh,
    ) {
        if (!state.loaded) item {
            GlassShimmerList(itemCount = 4)
        }
        state.message?.let { message -> item {
            AppFeedbackBanner(message, type = if (state.error) AppFeedbackType.Error else AppFeedbackType.Success,
                onRetry = if (state.error && !state.busy) when (state.operation) {
                    "details" -> onLoadDetails
                    "activities" -> onLoadXinjiangActivities
                    "coupons" -> onLoadCoupons
                    "moreCoupons" -> onLoadMoreCoupons
                    "coupon" -> onLoadCoupons
                    else -> onRefresh
                } else null, showCloseButton = false)
        } }
        if (session.connected) {
            item {
                AppPanel {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(session.maskedPhone, style = MaterialTheme.typography.titleLarge)
                        Text(if (state.queriedAt > 0) "更新于 ${formatLocalDateTime(state.queriedAt)}" else "已连接联通账号",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AppButton("刷新账户余量", onRefresh, loading = state.busy && state.operation == "refresh", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        AppSecondaryButton("查询套餐与余量明细", onLoadDetails, loading = state.busy && state.operation == "details", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        AppSecondaryButton("查询 N选1与电子券", onLoadCoupons, loading = state.busy && state.operation == "coupons", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        AppSecondaryButton("查询新疆活动记录", onLoadXinjiangActivities, loading = state.busy && state.operation == "activities", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        AppSecondaryButton("登录其他号码", { switching = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        AppSecondaryButton("退出联通账号", onDisconnect, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            state.metrics.forEach { metric -> item(key = "unicom-${metric.id}") {
                AppPanel {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(metric.title, style = MaterialTheme.typography.titleMedium)
                        Text(metric.value ?: "暂不可用", style = MaterialTheme.typography.displaySmall)
                        if (metric.unit.isNotBlank()) Text(metric.unit, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } }
            state.details?.let { details ->
                item { AppSectionHeader("套餐与余量明细", subtitle = "更新于 ${formatLocalDateTime(details.queriedAt)}") }
                item {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            AppDetailRow("账户昵称", details.nickname ?: "暂不可用")
                            AppDetailRow("当前套餐", details.packageName ?: "暂不可用")
                        }
                    }
                }
                details.groups.forEach { group -> item(key = "unicom-allowance-${group.id}") {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(group.title, style = MaterialTheme.typography.titleMedium)
                            AppDetailRow("剩余", group.remaining?.let { "$it ${group.unit}" } ?: "暂不可用")
                            AppDetailRow("已用", group.used?.let { "$it ${group.unit}" } ?: "暂不可用")
                        }
                    }
                } }
            }
            state.activities?.let { activities ->
                item { AppSectionHeader("新疆联通活动", subtitle = "更新于 ${formatLocalDateTime(activities.queriedAt)}") }
                item {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(activities.title, style = MaterialTheme.typography.titleMedium)
                            Text(when {
                                !activities.eligible -> "官方认证显示，当前号码不属于新疆联通活动适用用户。"
                                activities.records.isEmpty() -> "当前活动暂无个人获奖记录。"
                                else -> "以下为当前活动的个人获奖记录。"
                            }, style = MaterialTheme.typography.bodyMedium)
                            if (activities.eligible) Text("领奖及券码请前往联通官方 App 查看。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                activities.records.forEach { prize -> item(key = "unicom-prize-${prize.id}") {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(prize.prizeName, style = MaterialTheme.typography.titleMedium)
                            AppDetailRow("中奖时间", prize.drawnAt?.let(::formatLocalDateTime) ?: "暂不可用")
                        }
                    }
                } }
            }
            state.coupons?.let { coupons ->
                item { AppSectionHeader("已领用卡券", subtitle = "更新于 ${formatLocalDateTime(coupons.queriedAt)}") }
                if (coupons.items.isEmpty()) item {
                    AppPanel {
                        Text("当前没有已领用的卡券。", modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                coupons.items.forEach { coupon -> item(key = "unicom-coupon-${coupon.id}") {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(coupon.name, style = MaterialTheme.typography.titleMedium)
                            coupon.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            AppDetailRow("状态", coupon.status)
                            AppSecondaryButton("查看券码与有效期", { onViewCoupon(coupon.id) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                        }
                    }
                } }
                if (coupons.hasMore) item {
                    AppSecondaryButton("加载更多卡券", onLoadMoreCoupons, loading = state.busy && state.operation == "moreCoupons", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                }
            }
        }
        if (state.loaded && (!session.connected || switching || session.loginId != null)) item {
            AppPanel {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("短信验证码登录", style = MaterialTheme.typography.titleMedium)
                    AppTextField(phone, { phone = it.filter { char -> char in '0'..'9' }.take(11) },
                        label = "联通手机号", enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
                    AppButton(if (remaining > 0) "${remaining}秒后可重发" else "发送验证码", { onSendSms(phone) },
                        enabled = !state.busy && phone.length == 11 && remaining == 0L, loading = state.busy && state.operation == "sms", modifier = Modifier.fillMaxWidth())
                    if (session.stage == "captcha_required" && session.loginId != null) {
                        Text("联通要求安全验证，完成后将发送短信验证码。", style = MaterialTheme.typography.bodyMedium)
                        AppButton("开始安全验证", { captchaId = session.loginId }, enabled = !state.busy, loading = state.busy && state.operation == "captcha", modifier = Modifier.fillMaxWidth())
                    }
                    if (session.stage in setOf("sms_sent", "sms_pending") && session.loginId != null) {
                        Text(if (session.stage == "sms_pending") "发送结果待确认。如 ${session.loginPhone} 已收到短信，可继续登录。" else "验证码发送至 ${session.loginPhone}", style = MaterialTheme.typography.bodySmall)
                        AppTextField(code, { code = it.filter { char -> char in '0'..'9' }.take(8) }, label = "短信验证码", isPassword = true,
                            enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
                        AppButton("登录并查询", { val value = code; code = ""; onLogin(session.loginId, value) },
                            enabled = !state.busy && code.length in 4..8, loading = state.busy && state.operation == "login", modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
    captchaId?.takeIf { it == session.loginId && session.stage == "captcha_required" }?.let { id ->
        UnicomCaptchaDialog(onDismiss = { captchaId = null }, onVerified = { ticket, randStr ->
            captchaId = null
            onCaptchaVerified(id, ticket, randStr)
        })
    }
    state.selectedCouponId?.takeIf { session.connected }?.let { id ->
        val detail = state.couponDetail?.takeIf { it.id == id }
        var copied by remember(id, detail?.code) { mutableStateOf(false) }
        AppDialog(
            onDismissRequest = onCloseCoupon,
            title = detail?.name ?: "卡券详情",
            footer = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    detail?.code?.let { couponCode ->
                        AppDialogPrimaryButton(if (copied) "已复制券码" else "复制券码", {
                            clipboard.copy(couponCode, label = "联通券码", sensitive = true)
                            copied = true
                        }, modifier = Modifier.fillMaxWidth())
                    }
                    AppDialogSecondaryButton("关闭", onCloseCoupon, modifier = Modifier.fillMaxWidth())
                }
            },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.busy && state.operation == "coupon") GlassShimmerList(itemCount = 3)
                if (state.error && state.operation == "coupon") {
                    AppFeedbackBanner(state.message ?: "卡券详情未获取成功。", type = AppFeedbackType.Error,
                        onRetry = if (state.busy) null else ({ onViewCoupon(id) }), showCloseButton = false)
                }
                detail?.let {
                    AppDetailRow("状态", it.status)
                    AppDetailRow("有效期", it.validUntil ?: "暂不可用")
                    AppDetailRow("券码", it.code ?: "券码暂未生成，请稍后重试")
                }
            }
        }
    }
}
