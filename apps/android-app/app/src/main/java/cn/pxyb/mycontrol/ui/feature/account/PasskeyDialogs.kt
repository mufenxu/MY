package cn.pxyb.mycontrol.ui.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.dialog.DialogInfoText
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonInlineRows
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.util.DateTimeUtils.formatPlatformTime

@Composable
internal fun PasskeyListDialog(
    state: AccountManagementUiState,
    onDismiss: () -> Unit,
    onRegister: () -> Unit,
    onDelete: (PlatformPasskey) -> Unit,
) {
    val loading = state.busyAction == "passkey-list"
    AppDialog(
        onDismissRequest = { if (state.busyAction == null) onDismiss() },
        icon = Icons.Outlined.Fingerprint,
        title = "Passkey 管理",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (!state.androidPasskeySupported) {
                    Text(
                        "服务器尚未关联当前 App 签名，无法在本机新增或使用 Passkey。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (loading && state.passkeys.isEmpty()) {
                    AppSkeletonInlineRows(
                        rowCount = 2,
                        leadingSize = 30.dp,
                        lineWidths = listOf(0.42f, 0.66f),
                    )
                } else if (state.passkeys.isEmpty()) {
                    DialogInfoText("暂无已绑定的 Passkey")
                } else {
                    Column {
                        state.passkeys.forEachIndexed { index, passkey ->
                            if (index > 0) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        passkey.name,
                                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        "${passkey.deviceType ?: "设备凭据"} · ${formatPlatformTime(passkey.createdAt)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                IconButton(
                                    onClick = { onDelete(passkey) },
                                    enabled = state.busyAction == null,
                                ) {
                                    Icon(
                                        Icons.Outlined.DeleteOutline,
                                        contentDescription = "删除 ${passkey.name}",
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    }
                }
                DialogError(state.actionErrors["passkey-list"])
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "关闭",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = state.busyAction == null,
                )
                AppDialogPrimaryButton(
                    text = "新增 Passkey",
                    onClick = onRegister,
                    modifier = Modifier.weight(1f),
                    enabled = state.androidPasskeySupported && state.busyAction == null,
                )
            }
        },
    )
}


@Composable
internal fun PasskeyRegisterDialog(
    state: AccountManagementUiState,
    reauthenticated: Boolean,
    totpEnabled: Boolean,
    onDismiss: () -> Unit,
    onRegister: (name: String, password: String, totp: String) -> Unit,
    onFinished: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var submittedAt by remember { mutableStateOf<Int?>(null) }
    val busy = state.busyAction == "passkey-register"

    LaunchedEffect(state.actionCompletions["passkey-register"]) {
        if (submittedAt?.let { (state.actionCompletions["passkey-register"] ?: 0) > it } == true) onFinished()
    }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Fingerprint,
        title = "绑定新 Passkey",
        subtitle = if (reauthenticated) "身份已确认，将使用系统凭据管理器创建 Passkey。" else "将调用系统凭据管理器创建生物识别密钥，请先验证当前密码${if (totpEnabled) "与 6 位动态验证码" else ""}。",
        confirmText = "开始绑定",
        onConfirm = {
                        when {
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["passkey-register"] ?: 0
                                onRegister(name.trim().ifBlank { "Passkey" }, password, totp)
                            }
                        }
                    },
        loading = busy,
        enabled = !busy,
        errorMessage = localError ?: state.actionErrors["passkey-register"].takeIf { submittedAt != null },
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppTextField(
                    value = name,
                    onValueChange = { name = it; localError = null },
                    label = "名称（可选）",
                    enabled = !busy,
                )
                if (!reauthenticated) AppTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
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
internal fun DeletePasskeyDialog(
    state: AccountManagementUiState,
    reauthenticated: Boolean,
    passkey: PlatformPasskey,
    totpEnabled: Boolean,
    onDismiss: () -> Unit,
    onDelete: (password: String, totp: String) -> Unit,
    onFinished: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var submittedAt by remember { mutableStateOf<Int?>(null) }
    val busy = state.busyAction == "passkey-delete"

    LaunchedEffect(state.actionCompletions["passkey-delete"]) {
        if (submittedAt?.let { (state.actionCompletions["passkey-delete"] ?: 0) > it } == true) onFinished()
    }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.DeleteOutline,
        title = "删除 Passkey",
        subtitle = "确认删除「${passkey.name}」？删除后该设备将无法再用于登录。",
        confirmText = "确认删除",
        onConfirm = {
                        when {
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["passkey-delete"] ?: 0
                                onDelete(password, totp)
                            }
                        }
                    },
        loading = busy,
        enabled = !busy,
        danger = true,
        errorMessage = localError ?: state.actionErrors["passkey-delete"].takeIf { submittedAt != null },
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
