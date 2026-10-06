package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppQrCode
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppLoadingState
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeviceLoginSection(
    state: AppEntryUiState,
    onRefresh: () -> Unit,
    onCancelDeviceLogin: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onCancelDeviceLogin,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        sheetMaxWidth = 720.dp,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        BoxWithConstraints(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
        ) {
            val expanded = maxWidth >= 552.dp
            val qrSize = if (expanded) 300.dp else minOf(272.dp, maxWidth)
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("跨设备登录", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    AppHeaderIconButton(
                        icon = Icons.Outlined.Close,
                        contentDescription = "关闭跨设备登录",
                        onClick = onCancelDeviceLogin,
                    )
                }
                val qrContent: @Composable () -> Unit = {
                    Box(modifier = Modifier.size(qrSize), contentAlignment = Alignment.Center) {
                        when {
                            !state.deviceLoginQrDataUrl.isNullOrBlank() -> AppQrCode(
                                dataUrl = state.deviceLoginQrDataUrl,
                                contentDescription = "跨设备登录二维码",
                                size = qrSize,
                            )
                            state.deviceLoginBusy -> AppLoadingState("正在生成登录二维码")
                            else -> Text("请刷新二维码", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (expanded) {
                    Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.CenterVertically) {
                        qrContent()
                        DeviceLoginInstructions(state, onRefresh, onCancelDeviceLogin, Modifier.weight(1f), centered = false)
                    }
                } else {
                    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "使用已登录设备扫码，通过 Passkey 验证后，本机自动登录",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(12.dp))
                        qrContent()
                        Spacer(Modifier.height(12.dp))
                        DeviceLoginInstructions(state, onRefresh, onCancelDeviceLogin, centered = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceLoginInstructions(
    state: AppEntryUiState,
    onRefresh: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    centered: Boolean,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!centered) {
            Text("用另一台设备扫码", style = MaterialTheme.typography.titleMedium)
            Text(
                "使用已登录设备扫描左侧二维码，通过 Passkey 验证后，本机自动登录。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!state.deviceLoginError.isNullOrBlank()) {
            AppFeedbackBanner(
                state.deviceLoginError,
                error = true,
                onRetry = onRefresh,
                showCloseButton = false,
                autoDismissDurationMillis = null,
            )
        } else if (!state.deviceLoginQrDataUrl.isNullOrBlank()) {
            Text("等待已登录设备确认", style = MaterialTheme.typography.titleSmall)
            Text(
                "二维码 90 秒内有效，仅限本次登录",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = if (centered) TextAlign.Center else TextAlign.Start,
            )
        }
        AppSecondaryButton(
            text = "刷新二维码",
            onClick = onRefresh,
            enabled = !state.deviceLoginBusy || !state.deviceLoginQrDataUrl.isNullOrBlank(),
            modifier = Modifier.fillMaxWidth(),
        )
        AppSecondaryButton(text = "取消并返回", onClick = onCancel, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun LoginAlternativeMethods(
    state: AppEntryUiState,
    onPasskeyLogin: () -> Unit,
    onRecoverAccount: () -> Unit,
    onStartDeviceLogin: (String) -> Unit,
    onCancelDeviceLogin: () -> Unit,
    onRetryLoginCapabilities: () -> Unit,
) {
    var showDeviceLogin by rememberSaveable {
        mutableStateOf(state.deviceLoginBusy || !state.deviceLoginQrDataUrl.isNullOrBlank())
    }
    val focusManager = LocalFocusManager.current
    val cancelDeviceLogin = {
        showDeviceLogin = false
        onCancelDeviceLogin()
    }
    if (showDeviceLogin) {
        DeviceLoginSection(
            state = state,
            onRefresh = {
                onCancelDeviceLogin()
                onStartDeviceLogin("passkey")
            },
            onCancelDeviceLogin = cancelDeviceLogin,
        )
    }
    Column(modifier = Modifier.fillMaxWidth()) {
        if (state.loginCapabilitiesLoading) {
            Text("正在检查快捷登录方式…", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(12.dp))
        }
        state.loginCapabilitiesError?.let { message ->
            AppFeedbackBanner(message, error = true, onRetry = onRetryLoginCapabilities)
            Spacer(Modifier.height(12.dp))
        }
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
            Text(
                "其他登录方式",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            if (state.androidPasskeySupported) {
                LoginMethodEntry(
                    label = "Passkey",
                    description = "使用 Passkey 快捷登录",
                    icon = Icons.Outlined.Fingerprint,
                    enabled = !state.loginBusy && (!state.botChallengeRequired || state.botChallengeReady),
                    modifier = Modifier.weight(1f),
                    onClick = onPasskeyLogin,
                )
            }
            LoginMethodEntry(
                label = "跨设备",
                description = "Passkey 跨设备登录",
                icon = Icons.Outlined.QrCodeScanner,
                enabled = state.androidPasskeySupported && !state.loginBusy && !state.deviceLoginBusy && state.deviceLoginQrDataUrl.isNullOrBlank(),
                loading = state.deviceLoginBusy,
                modifier = Modifier.weight(1f),
                onClick = {
                    focusManager.clearFocus()
                    showDeviceLogin = true
                    onStartDeviceLogin("passkey")
                },
            )
            LoginMethodEntry(
                label = "账号恢复",
                description = "使用账号恢复凭据",
                icon = Icons.Outlined.Key,
                enabled = !state.loginBusy,
                modifier = Modifier.weight(1f),
                onClick = onRecoverAccount,
            )
        }
    }
}

@Composable
private fun LoginMethodEntry(
    label: String,
    description: String,
    icon: ImageVector,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val contentColor = MaterialTheme.colorScheme.onSurface
        .copy(alpha = if (enabled || loading) 1f else 0.38f)
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AppHeaderIconButton(
            icon = icon,
            contentDescription = description,
            onClick = onClick,
            enabled = enabled,
            loading = loading,
            size = 48.dp,
            iconSize = 24.dp,
            iconTint = contentColor,
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = contentColor,
            textAlign = TextAlign.Center,
        )
    }
}
