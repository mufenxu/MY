package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.SecuritySession
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

@Composable
fun ProfileScreen(
    state: AppUiState,
    contentPadding: PaddingValues,
    onRevokeSession: (String) -> Unit,
    onOpenQrLogin: () -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
) {
    var revokeTarget by remember { mutableStateOf<SecuritySession?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    val user = state.user ?: return
    val security = state.security

    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ImmersiveHeader(
                title = "账号与安全",
                refreshing = state.refreshing,
                onRefresh = onRefresh
            )
        }
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 22.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = MaterialTheme.shapes.medium,
                        shadowElevation = 1.dp,
                    ) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(R.drawable.platform_logo),
                            contentDescription = null,
                            modifier = Modifier.padding(6.dp).size(44.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            user.username,
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp
                            ),
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                        Text(
                            "智控中心 · ${roleLabel(user.role)}",
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            "在线",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        item { SectionHeader("安全状态", "平台账号保护") }
        item {
            AppPanel {
                SecurityRow(
                    icon = Icons.Outlined.Security,
                    title = "动态验证",
                    detail = if (security?.totpEnabled == true || user.totpEnabled) "TOTP 已启用" else "尚未启用",
                    status = if (security?.totpEnabled == true || user.totpEnabled) "healthy" else "warning",
                )
                HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                SecurityRow(
                    icon = Icons.Outlined.Fingerprint,
                    title = "Passkey",
                    detail = "${security?.passkeyCount ?: user.passkeyCount} 个平台凭据",
                    status = if ((security?.passkeyCount ?: user.passkeyCount) > 0) "healthy" else "unknown",
                )
                HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                SecurityRow(
                    icon = Icons.Outlined.Key,
                    title = "恢复码",
                    detail = security?.let { "剩余 ${it.recoveryCodesRemaining} 个" } ?: "等待安全数据",
                    status = if ((security?.recoveryCodesRemaining ?: 1) > 0) "healthy" else "warning",
                )
                HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                SecurityRow(
                    icon = Icons.Outlined.Lock,
                    title = "本地会话",
                    detail = "Android Keystore 加密 · 生物识别解锁",
                    status = "healthy",
                )
            }
        }

        item { SectionHeader("网页登录", "短效二维码 · 设备确认") }
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    IconTile(Icons.Outlined.QrCodeScanner, Ocean, OceanPale)
                    Column(modifier = Modifier.weight(1f)) {
                        Text("扫码登录 Web", style = MaterialTheme.typography.titleMedium)
                        Text("核对设备与验证码后安全确认", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    OutlinedButton(onClick = onOpenQrLogin, shape = MaterialTheme.shapes.medium) {
                        Icon(Icons.Outlined.QrCodeScanner, contentDescription = null, modifier = Modifier.size(17.dp))
                        Text("扫码", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
        item { SectionHeader("活动会话", security?.let { "${it.sessions.size} 台设备" } ?: "正在同步") }
        item {
            AppPanel {
                if (security?.sessions.isNullOrEmpty()) {
                    LoadingBlock("正在读取登录设备")
                } else {
                    security!!.sessions.forEachIndexed { index, session ->
                        SessionRow(
                            session = session,
                            busy = state.busyAction == "session",
                            onRevoke = { revokeTarget = session },
                        )
                        if (index < security.sessions.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }

        item { SectionHeader("会话策略", "服务端强制执行") }
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("最长会话", security?.sessionTtlHours?.let { "$it 小时" } ?: "--", Modifier.weight(1f), Ocean)
                    MetricCell("空闲超时", security?.sessionIdleMinutes?.let { "$it 分钟" } ?: "--", Modifier.weight(1f), Amber)
                }
            }
        }

        item { SectionHeader("应用", "MY Control Android") }
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    IconTile(Icons.Outlined.PhoneAndroid, Ocean, OceanPale)
                    Column(modifier = Modifier.weight(1f)) {
                        Text("版本 ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleMedium)
                        Text("cn.pxyb.mycontrol", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    StatusBadge("healthy", "生产环境")
                }
            }
        }

        item {
            OutlinedButton(
                onClick = { confirmLogout = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = state.busyAction == null,
                shape = MaterialTheme.shapes.medium,
            ) {
                if (state.busyAction == "logout") CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                else Icon(Icons.Outlined.Logout, contentDescription = null)
                Text("退出当前账号", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }

    revokeTarget?.let { session ->
        AlertDialog(
            onDismissRequest = { revokeTarget = null },
            shape = MaterialTheme.shapes.medium,
            icon = { Icon(Icons.Outlined.Devices, contentDescription = null) },
            title = { Text("撤销远程会话？") },
            text = { Text("${deviceLabel(session.userAgent)} · ${session.ip}\n该设备需要重新登录。") },
            confirmButton = {
                Button(onClick = { revokeTarget = null; onRevokeSession(session.nonce) }, shape = MaterialTheme.shapes.medium) { Text("确认撤销") }
            },
            dismissButton = { OutlinedButton(onClick = { revokeTarget = null }, shape = MaterialTheme.shapes.medium) { Text("取消") } },
        )
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            shape = MaterialTheme.shapes.medium,
            icon = { Icon(Icons.Outlined.Logout, contentDescription = null) },
            title = { Text("退出 MY Control？") },
            text = { Text("当前设备的中央平台会话将立即撤销。") },
            confirmButton = { Button(onClick = { confirmLogout = false; onLogout() }, shape = MaterialTheme.shapes.medium) { Text("退出登录") } },
            dismissButton = { OutlinedButton(onClick = { confirmLogout = false }, shape = MaterialTheme.shapes.medium) { Text("取消") } },
        )
    }
}

@Composable
private fun SecurityRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String, status: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        IconTile(icon, Forest, MintPale, modifier = Modifier.size(38.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        StatusBadge(status)
    }
}

@Composable
private fun SessionRow(session: SecuritySession, busy: Boolean, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        IconTile(Icons.Outlined.Devices, if (session.current) Forest else Ocean, if (session.current) MintPale else OceanPale, modifier = Modifier.size(38.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(deviceLabel(session.userAgent), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (session.current) StatusBadge("healthy", "当前")
            }
            Text(
                "${session.ip} · ${formatPlatformTime(session.lastSeenAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!session.current) {
            OutlinedButton(onClick = onRevoke, enabled = !busy, shape = MaterialTheme.shapes.medium) { Text("撤销") }
        }
    }
}

private fun roleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    "viewer" -> "只读账号"
    else -> role
}

private fun deviceLabel(userAgent: String): String = when {
    userAgent.contains("MY-Control-Android", ignoreCase = true) -> "MY Control Android"
    userAgent.contains("Android", ignoreCase = true) -> "Android 设备"
    userAgent.contains("iPhone", ignoreCase = true) -> "iPhone"
    userAgent.contains("Chrome", ignoreCase = true) -> "Chrome 浏览器"
    userAgent.contains("Edge", ignoreCase = true) -> "Edge 浏览器"
    else -> userAgent.take(32).ifBlank { "未知设备" }
}
