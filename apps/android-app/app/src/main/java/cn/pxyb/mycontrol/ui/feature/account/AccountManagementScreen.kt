package cn.pxyb.mycontrol.ui.feature.account

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.LockReset
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSecondaryHeader
import cn.pxyb.mycontrol.ui.components.layout.LocalAppNavigationHandlesBack
import cn.pxyb.mycontrol.ui.components.layout.PullToRefresh
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlinx.coroutines.delay

@Composable
fun AccountManagementScreen(
    state: AccountManagementUiState,
    contentPadding: PaddingValues,
    onDismiss: () -> Unit,
    onRefresh: () -> Unit,
    onOpenLoginSessions: () -> Unit,
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
                title = "账号与安全",
                subtitle = "密码、安全与登录凭证设置",
                onBack = onDismiss,
            )
        }
        state.sectionError?.let { message ->
            item(key = "section-error") { AppFeedbackBanner("安全数据暂不可用：$message", error = true) }
        }
        item(key = "login-sessions") {
            AppPanel {
                AppActionRow(
                    title = "登录设备与会话",
                    subtitle = "管理登录设备、撤销会话与电脑端免密登录",
                    icon = Icons.Outlined.Devices,
                    onClick = onOpenLoginSessions,
                )
            }
        }
        if (passkeyCount > 0 && state.androidPasskeySupported) {
            item(key = "passkey-reauthentication") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppSecondaryButton(text = "使用 Passkey 确认身份", icon = Icons.Outlined.Fingerprint,
                        onClick = onReauthenticatePasskey, enabled = state.busyAction == null, modifier = Modifier.fillMaxWidth())
                    if (reauthenticated) Text("身份已确认，五分钟内的账号安全操作无需再次输入密码。")
                    state.actionErrors["passkey-reauth"]?.let { AppFeedbackBanner(it, error = true, onRetry = onReauthenticatePasskey) }
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
                                    subtitle = "更新当前平台账号的登录密码",
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
                            subtitle = "更新当前平台账号的登录密码",
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
