package cn.pxyb.mycontrol.ui.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.ui.components.button.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppQrCode
import cn.pxyb.mycontrol.ui.components.input.AppTextField

@Composable
internal fun TotpSetupDialog(
    state: AccountManagementUiState,
    reauthenticated: Boolean,
    onDismiss: () -> Unit,
    onBegin: (password: String) -> Unit,
    onConfirm: (code: String) -> Unit,
) {
    val enrollment = state.totpEnrollment
    val codes = state.recoveryCodes
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var attemptedAction by remember { mutableStateOf<String?>(null) }
    val busy = state.busyAction == "totp-enroll" || state.busyAction == "totp-confirm"
    val step = when {
        codes.isNotEmpty() -> "codes"
        enrollment != null -> "qr"
        else -> "reauth"
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Shield,
        title = when (step) {
            "qr" -> "扫描二维码绑定"
            "codes" -> "保存恢复码"
            else -> "开启动态验证"
        },
        subtitle = when (step) {
            "reauth" -> if (reauthenticated) "身份已确认，可以继续设置动态验证。" else "开启后登录需要输入动态验证码。请验证当前密码，或返回使用 Passkey 确认身份。"
            "qr" -> "使用 Auth 验证器等应用扫描，或手动输入密钥。"
            else -> "以下恢复码仅显示这一次，请立即妥善保存。"
        },
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                when (step) {
                    "reauth" -> {
                        if (!reauthenticated) AppTextField(
                            value = password,
                            onValueChange = { password = it; localError = null },
                            label = "当前密码",
                            isPassword = true,
                            enabled = !busy,
                        )
                    }
                    "qr" -> {
                        AppQrCode(
                            dataUrl = enrollment?.qrDataUrl,
                            contentDescription = "TOTP 二维码",
                            errorMessage = "二维码加载失败，请使用下方密钥手动添加。",
                        )
                        SelectionContainer {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Text(
                                    enrollment?.secret.orEmpty(),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                )
                            }
                        }
                        AppTextField(
                            value = code,
                            onValueChange = { code = it.filter(Char::isDigit).take(6); localError = null },
                            label = "输入验证器中的 6 位动态码",
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            enabled = !busy,
                        )
                    }
                    else -> {
                        SelectionContainer {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                codes.forEach { codeText ->
                                    Surface(
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            codeText,
                                            fontFamily = FontFamily.Monospace,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                DialogError(localError ?: attemptedAction?.let(state.actionErrors::get))
            }
        },
        footer = {
            when (step) {
                "reauth" -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppDialogSecondaryButton(
                        text = "取消",
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                    )
                    AppDialogPrimaryButton(
                        text = "下一步",
                        onClick = {
                            if (!reauthenticated && password.isBlank()) {
                                localError = "请输入当前密码。"
                            } else {
                                attemptedAction = "totp-enroll"
                                onBegin(password)
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        busy = busy,
                    )
                }
                "qr" -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppDialogSecondaryButton(
                        text = "取消",
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                    )
                    AppDialogPrimaryButton(
                        text = "确认绑定",
                        onClick = {
                            if (code.length != 6) {
                                localError = "请输入 6 位动态验证码。"
                            } else {
                                attemptedAction = "totp-confirm"
                                onConfirm(code)
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        busy = busy,
                    )
                }
                else -> AppDialogPrimaryButton(
                    text = "我已保存",
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
    )
}

@Composable
internal fun TotpManageDialog(
    state: AccountManagementUiState,
    reauthenticated: Boolean,
    onDismiss: () -> Unit,
    onRegenerate: (password: String, totp: String) -> Unit,
    onDisable: (password: String, totp: String) -> Unit,
    onShowRecoveryCodes: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var pendingAction by remember { mutableStateOf<String?>(null) }
    var pendingCompletion by remember { mutableStateOf<Int?>(null) }
    val busy = state.busyAction == "recovery-codes" || state.busyAction == "totp-disable"

    LaunchedEffect(state.actionCompletions["recovery-codes"]) {
        if (pendingAction == "recovery" && pendingCompletion?.let { (state.actionCompletions["recovery-codes"] ?: 0) > it } == true && state.recoveryCodes.isNotEmpty()) {
            onShowRecoveryCodes()
        }
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Shield,
        title = "动态验证管理",
        subtitle = if (reauthenticated) "身份已确认，可以执行以下操作。" else "请输入当前密码与动态验证码，或返回使用 Passkey 确认身份。",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (!reauthenticated) AppTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (!reauthenticated) AppTextField(
                    value = totp,
                    onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                    label = "6 位动态验证码",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    enabled = !busy,
                )
                DialogError(localError ?: pendingAction?.let { state.actionErrors[if (it == "recovery") "recovery-codes" else "totp-disable"] })
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "重新生成恢复码",
                    onClick = {
                        when {
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                pendingAction = "recovery"
                                pendingCompletion = state.actionCompletions["recovery-codes"] ?: 0
                                onRegenerate(password, totp)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy && pendingAction == "recovery",
                )
                AppDialogDangerButton(
                    text = "关闭动态验证",
                    onClick = {
                        when {
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                pendingAction = "disable"
                                onDisable(password, totp)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy && pendingAction == "disable",
                )
            }
        },
    )
}

@Composable
internal fun RecoveryCodesDialog(
    codes: List<String>,
    onDismiss: () -> Unit,
    requireAcknowledgement: Boolean = false,
) {
    AppDialog(
        onDismissRequest = { if (!requireAcknowledgement) onDismiss() },
        icon = Icons.Outlined.VpnKey,
        title = "新恢复码（仅显示一次）",
        subtitle = "旧恢复码已全部失效。请立即妥善保存，每行一个。",
        content = {
            SelectionContainer {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    codes.forEach { code ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                code,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
            }
        },
        footer = {
            AppDialogPrimaryButton(
                text = "我已保存",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    )
}

@Composable
internal fun LoginTotpEnrollment(enrollment: TotpEnrollment) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("将此密钥添加到身份验证器，再输入下方的六位动态验证码。")
        AppQrCode(dataUrl = enrollment.qrDataUrl, contentDescription = "动态验证绑定二维码", modifier = Modifier.align(Alignment.CenterHorizontally))
        SelectionContainer { Text(enrollment.secret, fontFamily = FontFamily.Monospace) }
    }
}
