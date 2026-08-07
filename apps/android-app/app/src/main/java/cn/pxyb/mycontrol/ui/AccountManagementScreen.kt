package cn.pxyb.mycontrol.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockReset
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.PlatformPasskey

@Composable
fun AccountManagementScreen(
    state: AccountManagementUiState,
    contentPadding: PaddingValues,
    onDismiss: () -> Unit,
    onRefresh: () -> Unit,
    onChangedPassword: (oldPassword: String, newPassword: String, totp: String) -> Unit,
    onBeginTotpEnrollment: (password: String, totp: String) -> Unit,
    onConfirmTotpEnrollment: (code: String) -> Unit,
    onRegenerateRecoveryCodes: (password: String, totp: String) -> Unit,
    onDisableTotp: (password: String, totp: String) -> Unit,
    onClearTotpFlow: () -> Unit,
    onRefreshPasskeys: () -> Unit,
    onRegisterPasskey: (name: String, password: String, totp: String, requestCredential: suspend (String) -> String) -> Unit,
    onDeletePasskey: (id: String, password: String, totp: String) -> Unit,
    onRegisterPasskeyRequest: suspend (String) -> String,
    onSetAppLockEnabled: (Boolean) -> Unit,
) {
    // 支持按键与滑动手势返回上一级
    BackHandler(enabled = true, onBack = onDismiss)

    val user = state.user ?: return
    val security = state.security
    val totpEnabled = security?.totpEnabled == true || user.totpEnabled
    val passkeyCount = security?.passkeyCount ?: user.passkeyCount
    val recoveryCodesRemaining = security?.recoveryCodesRemaining

    var showChangePasswordDialog by remember { mutableStateOf(false) }
    var showTotpSetupDialog by remember { mutableStateOf(false) }
    var showTotpManageDialog by remember { mutableStateOf(false) }
    var showRecoveryCodesDialog by remember { mutableStateOf(false) }
    var showPasskeyDialog by remember { mutableStateOf(false) }
    var showPasskeyRegisterDialog by remember { mutableStateOf(false) }
    var passkeyToDelete by remember { mutableStateOf<PlatformPasskey?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = appPageContentPadding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppSecondaryHeader(
                title = "账号管理",
                subtitle = "密码、安全与登录凭证设置",
                onBack = onDismiss,
                refreshing = state.refreshing,
                onRefresh = onRefresh,
            )
        }
        state.sectionError?.let { message ->
            item { FeedbackBanner("安全数据暂不可用：$message", error = true) }
        }

        // 1. 个人资料概览卡片
        item {
            AppPanel {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(76.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                            border = BorderStroke(2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
                            modifier = Modifier.fillMaxSize()
                        ) {}
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                            modifier = Modifier.size(66.dp)
                        ) {
                            Image(
                                painter = painterResource(R.drawable.platform_logo),
                                contentDescription = "头像",
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .padding(10.dp)
                                    .fillMaxSize(),
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        user.username,
                        style = MaterialTheme.typography.headlineSmall.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                        ),
                    )
                    Spacer(Modifier.height(4.dp))
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                        shape = RoundedCornerShape(6.dp),
                    ) {
                        Text(
                            text = roleLabel(user.role),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp,
                            ),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }

        // 2. 安全认证与密钥管理
        item {
            AppPanel {
                Column {
                    AccountSectionHeader("安全认证与密钥")
                    AccountActionRow(
                        icon = Icons.Outlined.LockReset,
                        title = "修改登录密码",
                        subtitle = "定期更新密码以保证中央控制面板安全",
                        onClick = { showChangePasswordDialog = true }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    AccountActionRow(
                        icon = Icons.Outlined.Shield,
                        title = "二次动态验证（TOTP MFA）",
                        subtitle = if (totpEnabled) "已开启 · 动态口令双重防护" else "尚未开启 · 建议绑定 Auth 验证器",
                        statusText = if (totpEnabled) "已开启" else "去开启",
                        statusColor = if (totpEnabled) Color(0xFF166534) else Color(0xFFD97706),
                        onClick = {
                            if (totpEnabled) showTotpManageDialog = true else showTotpSetupDialog = true
                        }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    AccountActionRow(
                        icon = Icons.Outlined.Fingerprint,
                        title = "Passkey 生物识别密钥",
                        subtitle = "$passkeyCount 个已绑定的设备通行密钥",
                        statusText = "管理",
                        onClick = { showPasskeyDialog = true }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    AccountActionRow(
                        icon = Icons.Outlined.VpnKey,
                        title = "紧急恢复码（Backup Codes）",
                        subtitle = recoveryCodesRemaining?.let { "剩余 $it 个可使用的恢复码" } ?: "紧急情况下用于无手机登录",
                        statusText = "管理",
                        onClick = {
                            if (totpEnabled) showTotpManageDialog = true else showTotpSetupDialog = true
                        }
                    )
                }
            }
        }

        // 本地解锁开关
        item {
            AppPanel {
                Column {
                    AccountSectionHeader("本地解锁")
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Fingerprint,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier
                                    .padding(9.dp)
                                    .size(20.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "打开应用时验证身份",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 15.sp,
                                ),
                            )
                            Text(
                                text = if (state.appLockEnabled) {
                                    "已开启 · 每次打开 App 需指纹或 PIN 验证"
                                } else {
                                    "已关闭 · 打开 App 无需验证"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Switch(
                            checked = state.appLockEnabled,
                            onCheckedChange = onSetAppLockEnabled,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = MaterialTheme.colorScheme.primary,
                            ),
                        )
                    }
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.fillMaxWidth().padding(18.dp)) {
                    AccountSectionHeader("会话策略")
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        MetricCell(
                            "最长会话",
                            security?.sessionTtlHours?.let { "$it 小时" } ?: "同步中",
                            Modifier.weight(1f),
                            MaterialTheme.colorScheme.primary,
                        )
                        MetricCell(
                            "空闲超时",
                            security?.sessionIdleMinutes?.let { "$it 分钟" } ?: "同步中",
                            Modifier.weight(1f),
                            MaterialTheme.colorScheme.secondary,
                        )
                    }
                    Text(
                        "由服务端强制执行",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }

    // 弹窗：修改登录密码
    if (showChangePasswordDialog) {
        ChangePasswordDialog(
            state = state,
            totpEnabled = totpEnabled,
            onDismiss = { showChangePasswordDialog = false },
            onSubmit = { old, new, totp ->
                onChangedPassword(old, new, totp)
            },
            onFinished = { showChangePasswordDialog = false },
        )
    }

    // 弹窗：TOTP 绑定向导（密码确认 -> 二维码 -> 恢复码）
    if (showTotpSetupDialog) {
        TotpSetupDialog(
            state = state,
            onDismiss = {
                onClearTotpFlow()
                showTotpSetupDialog = false
            },
            onBegin = { password -> onBeginTotpEnrollment(password, "") },
            onConfirm = { code -> onConfirmTotpEnrollment(code) },
        )
    }

    // 弹窗：已开启动态验证时的管理操作
    if (showTotpManageDialog) {
        TotpManageDialog(
            state = state,
            onDismiss = { showTotpManageDialog = false },
            onRegenerate = { password, totp -> onRegenerateRecoveryCodes(password, totp) },
            onDisable = { password, totp -> onDisableTotp(password, totp) },
            onShowRecoveryCodes = {
                showRecoveryCodesDialog = true
                showTotpManageDialog = false
            },
        )
    }

    // 弹窗：新恢复码展示（仅一次）
    if (showRecoveryCodesDialog) {
        RecoveryCodesDialog(
            codes = state.recoveryCodes,
            onDismiss = {
                onClearTotpFlow()
                showRecoveryCodesDialog = false
            },
        )
    }

    // 弹窗：Passkey 管理
    if (showPasskeyDialog) {
        LaunchedEffect(Unit) { onRefreshPasskeys() }
        PasskeyListDialog(
            state = state,
            onDismiss = { showPasskeyDialog = false },
            onRegister = {
                showPasskeyRegisterDialog = true
            },
            onDelete = { passkey -> passkeyToDelete = passkey },
        )
    }

    // 弹窗：新增 Passkey（密码二次确认 + 系统凭据管理器）
    if (showPasskeyRegisterDialog) {
        PasskeyRegisterDialog(
            state = state,
            totpEnabled = totpEnabled,
            onDismiss = { showPasskeyRegisterDialog = false },
            onRegister = { name, password, totp ->
                onRegisterPasskey(name, password, totp, onRegisterPasskeyRequest)
            },
            onFinished = { showPasskeyRegisterDialog = false },
        )
    }

    // 弹窗：删除 Passkey 二次确认
    passkeyToDelete?.let { passkey ->
        DeletePasskeyDialog(
            state = state,
            passkey = passkey,
            totpEnabled = totpEnabled,
            onDismiss = { passkeyToDelete = null },
            onDelete = { password, totp -> onDeletePasskey(passkey.id, password, totp) },
            onFinished = { passkeyToDelete = null },
        )
    }
}

@Composable
private fun ChangePasswordDialog(
    state: AccountManagementUiState,
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
    var submitted by remember { mutableStateOf(false) }
    val busy = state.busyAction == "password"

    LaunchedEffect(state.busyAction, state.error, state.message) {
        if (submitted && state.busyAction == null && state.error == null) onFinished()
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Lock,
        title = "修改登录密码",
        subtitle = "新密码长度需在 15 到 256 个字符之间，修改后所有设备将退出登录。",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DialogTextField(
                    value = oldPassword,
                    onValueChange = { oldPassword = it; localError = null },
                    label = "当前原密码",
                    isPassword = true,
                    enabled = !busy,
                )
                DialogTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; localError = null },
                    label = "输入新密码",
                    isPassword = true,
                    enabled = !busy,
                )
                DialogTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; localError = null },
                    label = "确认新密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.error)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                AppDialogPrimaryButton(
                    text = "确认提交",
                    onClick = {
                        when {
                            newPassword.length < 15 || newPassword.length > 256 ->
                                localError = "新密码长度需要在 15 到 256 个字符之间。"
                            newPassword != confirmPassword -> localError = "两次输入的新密码不一致。"
                            newPassword == oldPassword -> localError = "新密码不能与当前密码相同。"
                            totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submitted = true
                                onSubmit(oldPassword, newPassword, totp)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun TotpSetupDialog(
    state: AccountManagementUiState,
    onDismiss: () -> Unit,
    onBegin: (password: String) -> Unit,
    onConfirm: (code: String) -> Unit,
) {
    val enrollment = state.totpEnrollment
    val codes = state.recoveryCodes
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
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
            "reauth" -> "开启后登录需要输入动态验证码。请先验证当前密码以继续。"
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
                        DialogTextField(
                            value = password,
                            onValueChange = { password = it; localError = null },
                            label = "当前密码",
                            isPassword = true,
                            enabled = !busy,
                        )
                    }
                    "qr" -> {
                        val qrBitmap = remember(enrollment?.qrDataUrl) {
                            enrollment?.qrDataUrl?.let { decodeQrDataUrl(it) }
                        }
                        if (qrBitmap != null) {
                            Image(
                                bitmap = qrBitmap,
                                contentDescription = "TOTP 二维码",
                                modifier = Modifier
                                    .size(180.dp)
                                    .clip(RoundedCornerShape(20.dp)),
                            )
                        } else {
                            Text(
                                "二维码加载失败，请使用下方密钥手动添加。",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
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
                        DialogTextField(
                            value = code,
                            onValueChange = { code = it.filter(Char::isDigit).take(6); localError = null },
                            label = "输入验证器中的 6 位动态码",
                            keyboardType = KeyboardType.Number,
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
                DialogError(localError ?: state.error)
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
                            if (password.isBlank()) {
                                localError = "请输入当前密码。"
                            } else {
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
private fun TotpManageDialog(
    state: AccountManagementUiState,
    onDismiss: () -> Unit,
    onRegenerate: (password: String, totp: String) -> Unit,
    onDisable: (password: String, totp: String) -> Unit,
    onShowRecoveryCodes: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var pendingAction by remember { mutableStateOf<String?>(null) }
    val busy = state.busyAction == "recovery-codes" || state.busyAction == "totp-disable"

    LaunchedEffect(state.busyAction, state.error, state.recoveryCodes) {
        if (pendingAction == "recovery" && state.busyAction == null && state.error == null && state.recoveryCodes.isNotEmpty()) {
            onShowRecoveryCodes()
        }
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Shield,
        title = "动态验证管理",
        subtitle = "敏感操作需要验证当前密码与 6 位动态验证码。",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                DialogTextField(
                    value = totp,
                    onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                    label = "6 位动态验证码",
                    keyboardType = KeyboardType.Number,
                    enabled = !busy,
                )
                DialogError(localError ?: state.error)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "重新生成恢复码",
                    onClick = {
                        when {
                            password.isBlank() -> localError = "请输入当前密码。"
                            totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                pendingAction = "recovery"
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
                            password.isBlank() -> localError = "请输入当前密码。"
                            totp.length != 6 -> localError = "请输入 6 位动态验证码。"
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
private fun RecoveryCodesDialog(
    codes: List<String>,
    onDismiss: () -> Unit,
) {
    AppDialog(
        onDismissRequest = onDismiss,
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
private fun PasskeyListDialog(
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
                    LoadingBlock("正在读取已绑定密钥")
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
                DialogError(state.error)
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
private fun PasskeyRegisterDialog(
    state: AccountManagementUiState,
    totpEnabled: Boolean,
    onDismiss: () -> Unit,
    onRegister: (name: String, password: String, totp: String) -> Unit,
    onFinished: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var submitted by remember { mutableStateOf(false) }
    val busy = state.busyAction == "passkey-register"

    LaunchedEffect(state.busyAction, state.error, state.message) {
        if (submitted && state.busyAction == null && state.error == null) onFinished()
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Fingerprint,
        title = "绑定新 Passkey",
        subtitle = "将调用系统凭据管理器创建生物识别密钥，请先验证当前密码${if (totpEnabled) "与 6 位动态验证码" else ""}。",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DialogTextField(
                    value = name,
                    onValueChange = { name = it; localError = null },
                    label = "名称（可选）",
                    enabled = !busy,
                )
                DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.error)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                AppDialogPrimaryButton(
                    text = "开始绑定",
                    onClick = {
                        when {
                            password.isBlank() -> localError = "请输入当前密码。"
                            totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submitted = true
                                onRegister(name.trim().ifBlank { "Passkey" }, password, totp)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun DeletePasskeyDialog(
    state: AccountManagementUiState,
    passkey: PlatformPasskey,
    totpEnabled: Boolean,
    onDismiss: () -> Unit,
    onDelete: (password: String, totp: String) -> Unit,
    onFinished: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    var totp by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var submitted by remember { mutableStateOf(false) }
    val busy = state.busyAction == "passkey-delete"

    LaunchedEffect(state.busyAction, state.error, state.message) {
        if (submitted && state.busyAction == null && state.error == null) onFinished()
    }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.DeleteOutline,
        iconTint = MaterialTheme.colorScheme.error,
        iconBackground = MaterialTheme.colorScheme.errorContainer,
        title = "删除 Passkey",
        subtitle = "确认删除「${passkey.name}」？删除后该设备将无法再用于登录。",
        content = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.error)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                AppDialogDangerButton(
                    text = "确认删除",
                    onClick = {
                        when {
                            password.isBlank() -> localError = "请输入当前密码。"
                            totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submitted = true
                                onDelete(password, totp)
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun DialogError(text: String?) {
    if (!text.isNullOrBlank()) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private fun decodeQrDataUrl(dataUrl: String): ImageBitmap? {
    val base64 = dataUrl.substringAfter(',', "")
    if (base64.isBlank()) return null
    return runCatching {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}

@Composable
private fun AccountSectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge.copy(
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        ),
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 6.dp),
    )
}

@Composable
private fun AccountActionRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    statusText: String? = null,
    statusColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Surface(
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
            shape = RoundedCornerShape(12.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(9.dp)
                    .size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                ),
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!statusText.isNullOrBlank()) {
            Text(
                text = statusText,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                color = statusColor,
            )
        }
        Icon(
            imageVector = Icons.Outlined.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.size(18.dp),
        )
    }
}

private fun roleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    "viewer" -> "只读账号"
    else -> role
}
