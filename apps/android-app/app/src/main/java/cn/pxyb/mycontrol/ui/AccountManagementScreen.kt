package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
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
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.util.QrUtils
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import kotlinx.coroutines.delay

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
    onReauthenticatePasskey: () -> Unit,
    onSetAppLockEnabled: (Boolean) -> Unit,
) {
    // 支持按键与滑动手势返回上一级
    BackHandler(enabled = !LocalAppNavigationHandlesBack.current, onBack = onDismiss)

    val user = state.user ?: return
    val security = state.security
    val totpEnabled = security?.totpEnabled == true || user.totpEnabled
    val passkeyCount = security?.passkeyCount ?: user.passkeyCount
    val recoveryCodesRemaining = security?.recoveryCodesRemaining
    var reauthenticated by remember(state.reauthenticatedUntil) { mutableStateOf(state.reauthenticatedUntil > System.currentTimeMillis()) }
    LaunchedEffect(state.reauthenticatedUntil) {
        if (reauthenticated) {
            delay((state.reauthenticatedUntil - System.currentTimeMillis()).coerceAtLeast(0))
            reauthenticated = false
        }
    }

    var showChangePasswordDialog by remember { mutableStateOf(false) }
    var showTotpSetupDialog by remember { mutableStateOf(false) }
    var showTotpManageDialog by remember { mutableStateOf(false) }
    var showRecoveryCodesDialog by remember { mutableStateOf(false) }
    var showPasskeyDialog by remember { mutableStateOf(false) }
    var showPasskeyRegisterDialog by remember { mutableStateOf(false) }
    var passkeyToDelete by remember { mutableStateOf<PlatformPasskey?>(null) }
    val isTablet = useTwoPaneLayout()

    val listState = rememberLazyListState()
    val dark = isAppInDarkTheme()
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .auroraBackdrop(dark),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
        item {
            AppSecondaryHeader(
                title = "账号管理",
                subtitle = "密码、安全与登录凭证设置",
                onBack = onDismiss,
            )
        }
        state.sectionError?.let { message ->
            item(key = "section-error") { FeedbackBanner("安全数据暂不可用：$message", error = true) }
        }
        if (passkeyCount > 0 && state.androidPasskeySupported) {
            item(key = "passkey-reauthentication") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppSecondaryButton(text = "使用 Passkey 确认身份", icon = Icons.Outlined.Fingerprint,
                        onClick = onReauthenticatePasskey, enabled = state.busyAction == null, modifier = Modifier.fillMaxWidth())
                    if (reauthenticated) Text("身份已确认，五分钟内的账号安全操作无需再次输入密码。")
                    state.actionErrors["passkey-reauth"]?.let { FeedbackBanner(it, error = true, onRetry = onReauthenticatePasskey) }
                }
            }
        }

        if (isTablet) {
            // 平板双列布局：左列（头像资料 + 本地指纹锁），右列（密码、TOTP、Passkey、恢复码安全密钥）
            item(key = "tablet-account-bento") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // 左列
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        AppPanel {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.size(88.dp)
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
                                        modifier = Modifier.size(76.dp)
                                    ) {
                                        Image(
                                            painter = painterResource(R.drawable.platform_logo),
                                            contentDescription = "头像",
                                            modifier = Modifier
                                                .clip(CircleShape)
                                                .padding(12.dp)
                                                .fillMaxSize(),
                                        )
                                    }
                                }
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    user.username,
                                    style = MaterialTheme.typography.headlineSmall.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 22.sp,
                                    ),
                                )
                                Spacer(Modifier.height(6.dp))
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                                    shape = RoundedCornerShape(8.dp),
                                ) {
                                    Text(
                                        text = roleLabel(user.role),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 13.sp,
                                        ),
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }

                        AppPanel {
                            Column {
                                AccountSectionHeader("本地安全")
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
                                    AppSwitch(
                                        checked = state.appLockEnabled,
                                        onCheckedChange = onSetAppLockEnabled,
                                    )
                                }
                            }
                        }
                    }

                    // 右列：安全认证与密钥
                    Column(
                        modifier = Modifier.weight(1.2f),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
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
                                    statusColor = if (totpEnabled) ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
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
                }
            }
        } else {
            // 手机单列流保持原有排列
            item {
                AppPanel {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier.size(72.dp)
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
                                modifier = Modifier.size(62.dp)
                            ) {
                                Image(
                                    painter = painterResource(R.drawable.platform_logo),
                                    contentDescription = "头像",
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .padding(8.dp)
                                        .fillMaxSize(),
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            user.username,
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                            ),
                        )
                        Spacer(Modifier.height(3.dp))
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                text = roleLabel(user.role),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
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
                            statusColor = if (totpEnabled) ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
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
                            AppSwitch(
                                checked = state.appLockEnabled,
                                onCheckedChange = onSetAppLockEnabled,
                            )
                        }
                    }
                }
            }
        }
    }
    }

    // 弹窗：修改登录密码
    if (showChangePasswordDialog) {
        ChangePasswordDialog(
            state = state,
            reauthenticated = reauthenticated,
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
            reauthenticated = reauthenticated,
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
            reauthenticated = reauthenticated,
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
            reauthenticated = reauthenticated,
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
            reauthenticated = reauthenticated,
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
                if (!reauthenticated) DialogTextField(
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
                    if (!reauthenticated) DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.actionErrors["password"].takeIf { submittedAt != null })
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
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["password"] ?: 0
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
                        if (!reauthenticated) DialogTextField(
                            value = password,
                            onValueChange = { password = it; localError = null },
                            label = "当前密码",
                            isPassword = true,
                            enabled = !busy,
                        )
                    }
                    "qr" -> {
                        val qrBitmap = remember(enrollment?.qrDataUrl) {
                            QrUtils.decodeDataUrlToBitmap(enrollment?.qrDataUrl)
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
private fun TotpManageDialog(
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
                if (!reauthenticated) DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (!reauthenticated) DialogTextField(
                    value = totp,
                    onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                    label = "6 位动态验证码",
                    keyboardType = KeyboardType.Number,
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
private fun PasskeyRegisterDialog(
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

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Fingerprint,
        title = "绑定新 Passkey",
        subtitle = if (reauthenticated) "身份已确认，将使用系统凭据管理器创建 Passkey。" else "将调用系统凭据管理器创建生物识别密钥，请先验证当前密码${if (totpEnabled) "与 6 位动态验证码" else ""}。",
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
                if (!reauthenticated) DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    if (!reauthenticated) DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.actionErrors["passkey-register"].takeIf { submittedAt != null })
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
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["passkey-register"] ?: 0
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
                if (!reauthenticated) DialogTextField(
                    value = password,
                    onValueChange = { password = it; localError = null },
                    label = "当前密码",
                    isPassword = true,
                    enabled = !busy,
                )
                if (totpEnabled) {
                    if (!reauthenticated) DialogTextField(
                        value = totp,
                        onValueChange = { totp = it.filter(Char::isDigit).take(6); localError = null },
                        label = "6 位动态验证码",
                        keyboardType = KeyboardType.Number,
                        enabled = !busy,
                    )
                }
                DialogError(localError ?: state.actionErrors["passkey-delete"].takeIf { submittedAt != null })
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
                            !reauthenticated && password.isBlank() -> localError = "请输入当前密码。"
                            !reauthenticated && totpEnabled && totp.length != 6 -> localError = "请输入 6 位动态验证码。"
                            else -> {
                                submittedAt = state.actionCompletions["passkey-delete"] ?: 0
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

@Composable
internal fun LoginTotpEnrollment(enrollment: TotpEnrollment) {
    val qr = remember(enrollment.qrDataUrl) { QrUtils.decodeDataUrlToBitmap(enrollment.qrDataUrl) }
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("将此密钥添加到身份验证器，再输入下方的六位动态验证码。")
        if (qr != null) Image(bitmap = qr, contentDescription = "动态验证绑定二维码", modifier = Modifier.size(180.dp).align(Alignment.CenterHorizontally))
        SelectionContainer { Text(enrollment.secret, fontFamily = FontFamily.Monospace) }
    }
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
    AppDialog(
        title = "恢复平台账号",
        subtitle = "输入管理员签发的恢复凭据。恢复后将退出所有设备，并清除原有 Passkey 和动态验证设置。",
        onDismissRequest = { if (!state.loginBusy) onDismiss() },
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(value = recoveryToken, onValueChange = { value ->
                    val fragment = runCatching { android.net.Uri.parse(value.trim()).encodedFragment }.getOrNull()
                    recoveryToken = if (fragment != null) android.net.Uri.Builder().scheme("https").authority("recovery").encodedQuery(fragment).build().getQueryParameter("recover") ?: value else value
                }, label = "一次性恢复凭据或恢复链接", isPassword = true, enabled = !state.loginBusy)
                AppTextField(value = newPassword, onValueChange = { newPassword = it.take(256) }, label = "新密码（15–256 位）", isPassword = true, enabled = !state.loginBusy)
                AppTextField(value = confirmation, onValueChange = { confirmation = it.take(256) }, label = "再次输入新密码", isPassword = true, enabled = !state.loginBusy)
                if (submitted) state.error?.let { FeedbackBanner(it, error = true) }
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton(text = "取消", onClick = onDismiss, enabled = !state.loginBusy, modifier = Modifier.weight(1f))
                AppDialogPrimaryButton(text = "恢复账号", onClick = { submitted = true; onRecover(recoveryToken, newPassword) },
                    enabled = !state.loginBusy && recoveryToken.isNotBlank() && newPassword.length in 15..256 && newPassword == confirmation,
                    busy = state.loginBusy, modifier = Modifier.weight(1f))
            }
        },
    )
}

@Composable
private fun AccountSectionHeader(title: String) {
    AppSectionHeader(
        title = title,
        modifier = Modifier.padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 6.dp),
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
    AppActionRow(
        title = title,
        subtitle = subtitle,
        icon = icon,
        onClick = onClick,
        trailingContent = {
            if (!statusText.isNullOrBlank()) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 11.5.sp,
                    ),
                    color = statusColor,
                )
            } else {
                Icon(
                    imageVector = Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }
        },
    )
}


private fun roleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    "viewer" -> "只读账号"
    else -> role
}
