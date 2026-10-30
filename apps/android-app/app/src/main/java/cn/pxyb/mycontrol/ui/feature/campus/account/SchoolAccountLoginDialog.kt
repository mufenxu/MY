package cn.pxyb.mycontrol.ui.feature.campus.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.input.AppTextField

/** 设备侧回归用例的定位锚点：靠文案匹配会在文案调整时静默失效。 */
internal const val SCHOOL_ACCOUNT_PHONE_TAG = "school-account-phone"
internal const val SCHOOL_ACCOUNT_CODE_TAG = "school-account-code"

/**
 * 学校账号短信登录弹窗。
 *
 * 用手机号 + 学校下发的短信验证码换取统一身份认证票据，成功后服务端会自动
 * 激活教务、能耗、一卡通、研讨间与座位预约，用户不需要再去后台网页登录。
 *
 * 只负责渲染 [SchoolAccountUiState] 并回传意图，所有网络与倒计时都在
 * [SchoolAccountStateHolder] 里，便于单测和失败分支收敛。
 */
@Composable
internal fun SchoolAccountLoginDialog(
    state: SchoolAccountUiState,
    onDismiss: () -> Unit,
    onPhoneChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onSendCode: () -> Unit,
    onResendCode: () -> Unit,
    onBackToPhone: () -> Unit,
    onVerify: () -> Unit,
) {
    if (!state.visible) return
    val codePhase = state.phase == SchoolAccountPhase.Code

    AppDialogForm(
        title = if (codePhase) "输入短信验证码" else "学校账号已过期",
        subtitle = if (codePhase) {
            "已发送至 ${state.maskedPhone.ifBlank { "绑定的手机号" }}，5 分钟内有效"
        } else {
            "验证手机号后自动恢复当前页，无需前往后台"
        },
        icon = if (codePhase) Icons.Outlined.VpnKey else Icons.Outlined.Shield,
        onDismissRequest = onDismiss,
        onConfirm = if (codePhase) onVerify else onSendCode,
        confirmText = if (codePhase) "登录并恢复" else "获取验证码",
        cancelText = if (codePhase) "关闭" else "暂不登录",
        enabled = if (codePhase) state.canVerify else state.canSend,
        loading = if (codePhase) state.verifying else state.sending,
        errorMessage = state.error,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            state.hint?.let { hint ->
                Text(
                    text = hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (codePhase) {
                AppTextField(
                    value = state.code,
                    onValueChange = onCodeChange,
                    label = "验证码",
                    placeholder = "请输入 6 位数字",
                    enabled = !state.verifying,
                    clearable = false,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { if (state.canVerify) onVerify() }),
                    testTag = SCHOOL_ACCOUNT_CODE_TAG,
                )
                Text(
                    text = "验证码由学校统一身份认证下发，5 分钟内有效；连续输错 5 次需要重新获取。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppSecondaryButton(
                        text = if (state.cooldownSeconds > 0) "${state.cooldownSeconds} 秒后可重发" else "重新发送验证码",
                        onClick = onResendCode,
                        modifier = Modifier.weight(1f),
                        enabled = state.cooldownSeconds <= 0,
                        loading = state.sending,
                        height = 40.dp,
                        compact = true,
                    )
                    AppSecondaryButton(
                        text = "修改手机号",
                        onClick = onBackToPhone,
                        modifier = Modifier.weight(1f),
                        enabled = !state.verifying && !state.sending,
                        height = 40.dp,
                        compact = true,
                    )
                }
            } else {
                AppTextField(
                    value = state.phone,
                    onValueChange = onPhoneChange,
                    label = "手机号",
                    placeholder = "与学校账号绑定的 11 位手机号",
                    enabled = !state.sending,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { if (state.canSend) onSendCode() }),
                    testTag = SCHOOL_ACCOUNT_PHONE_TAG,
                )
                Text(
                    text = "验证码用于换取学校登录票据，本应用不会保存学校密码。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
