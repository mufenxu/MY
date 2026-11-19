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
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
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
    LaunchedEffect(Unit) { if (!state.loaded) onRefresh() }
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
        title = "联通账户", subtitle = "登录后查看当前账户余量",
        onBack = onBack, contentPadding = contentPadding,
        refreshing = state.busy && state.operation == "refresh", onRefresh = onRefresh,
    ) {
        if (!state.loaded) item {
            GlassShimmerList(itemCount = 4)
        }
        state.message?.let { message -> item {
            AppFeedbackBanner(message, type = if (state.error) AppFeedbackType.Error else AppFeedbackType.Success,
                onRetry = if (state.error && !state.busy) onRefresh else null, showCloseButton = false)
        } }
        if (session.connected) {
            item {
                AppPanel {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(session.maskedPhone, style = MaterialTheme.typography.titleLarge)
                        Text(if (state.queriedAt > 0) "更新于 ${formatLocalDateTime(state.queriedAt)}" else "已连接联通账号",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AppButton("刷新账户余量", onRefresh, loading = state.busy && state.operation == "refresh", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
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
}
