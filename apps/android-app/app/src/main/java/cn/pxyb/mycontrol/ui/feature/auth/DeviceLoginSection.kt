package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppQrCode
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton

@Composable
private fun DeviceLoginSection(
    state: AppEntryUiState,
    onCancelDeviceLogin: () -> Unit,
) {
    if (!state.deviceLoginQrDataUrl.isNullOrBlank()) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "等待已登录设备确认",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    "对方设备将使用 Passkey 验证，确认后本机自动登录",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(14.dp))
                AppQrCode(
                    dataUrl = state.deviceLoginQrDataUrl,
                    contentDescription = "跨设备登录二维码",
                    size = 204.dp,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "二维码 90 秒内有效，仅可用于本次登录",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onCancelDeviceLogin) {
                    Text("取消跨设备登录")
                }
            }
        }
        return
    }

    if (!state.deviceLoginError.isNullOrBlank()) {
        Text(
            state.deviceLoginError,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

}

@Composable
internal fun LoginAlternativeMethods(
    state: AppEntryUiState,
    onPasskeyLogin: () -> Unit,
    onRecoverAccount: () -> Unit,
    onStartDeviceLogin: (String) -> Unit,
    onCancelDeviceLogin: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
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
                onClick = { onStartDeviceLogin("passkey") },
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
        if (!state.deviceLoginQrDataUrl.isNullOrBlank() || !state.deviceLoginError.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            DeviceLoginSection(state = state, onCancelDeviceLogin = onCancelDeviceLogin)
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
