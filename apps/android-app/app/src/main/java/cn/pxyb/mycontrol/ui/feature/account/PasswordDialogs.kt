package cn.pxyb.mycontrol.ui.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState

@Composable
internal fun ChangePasswordDialog(
    state: AccountManagementUiState,
    reauthenticated: Boolean,
    totpEnabled: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (oldPassword: String, newPassword: String, totp: String) -> Unit,
    onFinished: () -> Unit,
) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var submittedAt by remember { mutableStateOf<Int?>(null) }
    val busy = state.busyAction == "password"

    LaunchedEffect(state.actionCompletions["password"]) {
        if (submittedAt?.let { (state.actionCompletions["password"] ?: 0) > it } == true) onFinished()
    }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Lock,
        title = "修改登录密码",
        subtitle = "新密码长度需在 15 到 256 个字符之间，修改后所有设备将退出登录。",
        confirmText = "确认提交",
        onConfirm = {
                        when {
                            newPassword.length < 15 || newPassword.length > 256 ->
                                localError = "新密码长度需要在 15 到 256 个字符之间。"
                            newPassword != confirmPassword -> localError = "两次输入的新密码不一致。"
                            newPassword == oldPassword -> localError = "新密码不能与当前密码相同。"
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["password"] ?: 0
                                onSubmit(oldPassword, newPassword, totp)
                            }
                        }
                    },
        loading = busy,
        enabled = !busy,
        errorMessage = localError ?: state.actionErrors["password"].takeIf { submittedAt != null },
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!reauthenticated) AppTextField(
                    value = oldPassword,
                    onValueChange = { oldPassword = it; localError = null },
                    label = "当前原密码",
                    isPassword = true,
                    enabled = !busy,
                )
                AppTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; localError = null },
                    label = "输入新密码",
                    isPassword = true,
                    enabled = !busy,
                )
                AppTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; localError = null },
                    label = "确认新密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    if (!reauthenticated) AppTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        enabled = !busy,
                    )
                }

            }
        },
    )
}



@Composable
internal fun AccountRecoveryDialog(state: AppEntryUiState, onDismiss: () -> Unit, onRecover: (String, String) -> Unit) {
    var recoveryToken by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf(false) }
    LaunchedEffect(state.loginBusy, state.error, state.message) {
        if (submitted && !state.loginBusy && state.error == null && state.message != null) onDismiss()
    }
    AppDialogForm(
        title = "恢复平台账号",
        subtitle = "输入管理员签发的恢复凭据。恢复后将退出所有设备，并清除原有 Passkey 和动态验证设置。",
        onDismissRequest = { if (!state.loginBusy) onDismiss() },
        confirmText = "恢复账号",
        onConfirm = { submitted = true; onRecover(recoveryToken, newPassword) },
        loading = state.loginBusy,
        enabled = !state.loginBusy && recoveryToken.isNotBlank() && newPassword.length in 15..256 && newPassword == confirmation,
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(value = recoveryToken, onValueChange = { value ->
                    val fragment = runCatching { android.net.Uri.parse(value.trim()).encodedFragment }.getOrNull()
                    recoveryToken = if (fragment != null) android.net.Uri.Builder().scheme("https").authority("recovery").encodedQuery(fragment).build().getQueryParameter("recover") ?: value else value
                }, label = "一次性恢复凭据或恢复链接", isPassword = true, enabled = !state.loginBusy)
                AppTextField(value = newPassword, onValueChange = { newPassword = it.take(256) }, label = "新密码（15–256 位）", isPassword = true, enabled = !state.loginBusy)
                AppTextField(value = confirmation, onValueChange = { confirmation = it.take(256) }, label = "再次输入新密码", isPassword = true, enabled = !state.loginBusy)
                if (submitted) state.error?.let { AppFeedbackBanner(it, error = true) }
            }
        },
    )
}
