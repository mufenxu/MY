package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.SecuritySession
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.Forest

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
    val totpEnabled = security?.totpEnabled == true || user.totpEnabled
    val passkeyCount = security?.passkeyCount ?: user.passkeyCount
    val recoveryCodesRemaining = security?.recoveryCodesRemaining
    val protectionCount = listOf(
        totpEnabled,
        passkeyCount > 0,
        recoveryCodesRemaining == null || recoveryCodesRemaining > 0,
    ).count { it }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ImmersiveHeader(
                title = "我的",
                subtitle = "账号、安全与设备",
                refreshing = state.refreshing,
                onRefresh = onRefresh,
            )
        }

        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(R.drawable.platform_logo),
                            contentDescription = "MY Control",
                            modifier = Modifier.padding(8.dp).size(48.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            user.username,
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp,
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "MY Control · ${roleLabel(user.role)}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 3.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    StatusBadge("healthy", "在线")
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp)) {
                    ProfileGroupLabel("账号保护", if (protectionCount == 3) "状态良好" else "建议完善")
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                protectionCount.toString(),
                                style = MaterialTheme.typography.displaySmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 34.sp,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                " / 3 项已启用",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(bottom = 5.dp),
                            )
                        }
                        StatusBadge(if (protectionCount == 3) "healthy" else "warning")
                    }
                    HorizontalDivider(
                        modifier = Modifier.padding(top = 14.dp, bottom = 12.dp),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Devices,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(22.dp),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text("${security?.sessions?.size ?: 0} 台活动设备", style = MaterialTheme.typography.titleSmall)
                            Text(
                                "可通过二维码安全登录网页端",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        OutlinedButton(onClick = onOpenQrLogin, shape = MaterialTheme.shapes.medium) {
                            Icon(Icons.Outlined.QrCodeScanner, contentDescription = null, modifier = Modifier.size(17.dp))
                            Text("扫码", modifier = Modifier.padding(start = 6.dp))
                        }
                    }
                }
            }
        }

        item {
            AppPanel {
                ProfileGroupLabel("登录与安全", modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
                SecurityRow(
                    icon = Icons.Outlined.Security,
                    title = "动态验证",
                    detail = if (totpEnabled) "TOTP 已启用" else "尚未启用",
                    status = if (totpEnabled) "healthy" else "warning",
                )
                ProfileDivider()
                SecurityRow(
                    icon = Icons.Outlined.Fingerprint,
                    title = "Passkey",
                    detail = "$passkeyCount 个平台凭据",
                    status = if (passkeyCount > 0) "healthy" else "unknown",
                )
                ProfileDivider()
                SecurityRow(
                    icon = Icons.Outlined.Key,
                    title = "恢复码",
                    detail = recoveryCodesRemaining?.let { "剩余 $it 个" } ?: "等待安全数据",
                    status = if ((recoveryCodesRemaining ?: 1) > 0) "healthy" else "warning",
                )
                ProfileDivider()
                SecurityRow(
                    icon = Icons.Outlined.Lock,
                    title = "本地会话",
                    detail = "Android Keystore 加密 · 生物识别解锁",
                    status = "healthy",
                )
            }
        }

        item {
            AppPanel {
                ProfileGroupLabel(
                    title = "活动会话",
                    trailing = security?.let { "${it.sessions.size} 台设备" } ?: "正在同步",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                )
                if (security?.sessions.isNullOrEmpty()) {
                    ProfileDivider()
                    LoadingBlock("正在读取登录设备")
                } else {
                    security!!.sessions.forEachIndexed { index, session ->
                        if (index == 0) ProfileDivider()
                        SessionRow(
                            session = session,
                            busy = state.busyAction == "session",
                            onRevoke = { revokeTarget = session },
                        )
                        if (index < security.sessions.lastIndex) ProfileDivider()
                    }
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp)) {
                    ProfileGroupLabel("会话策略", "服务端强制执行")
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        MetricCell(
                            "最长会话",
                            security?.sessionTtlHours?.let { "$it 小时" } ?: "--",
                            Modifier.weight(1f),
                            Forest,
                        )
                        MetricCell(
                            "空闲超时",
                            security?.sessionIdleMinutes?.let { "$it 分钟" } ?: "--",
                            Modifier.weight(1f),
                            Amber,
                        )
                    }
                }
            }
        }

        item {
            AppPanel {
                ProfileGroupLabel("关于", modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
                ProfileDivider()
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(R.drawable.platform_logo),
                            contentDescription = null,
                            modifier = Modifier.padding(7.dp).size(34.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("MY Control", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "版本 ${BuildConfig.VERSION_NAME} · 生产环境",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        Icons.Outlined.PhoneAndroid,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }

        item {
            OutlinedButton(
                onClick = { confirmLogout = true },
                modifier = Modifier.fillMaxWidth(),
                enabled = state.busyAction == null,
                shape = MaterialTheme.shapes.medium,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.24f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                if (state.busyAction == "logout") {
                    CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null)
                }
                Text("退出当前账号", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }

    revokeTarget?.let { session ->
        AlertDialog(
            onDismissRequest = { revokeTarget = null },
            shape = RoundedCornerShape(24.dp),
            containerColor = Color.White,
            icon = {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEF3C7),
                    border = BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f)),
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Outlined.Devices,
                            contentDescription = null,
                            tint = Color(0xFFB45309),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            },
            title = {
                Text(
                    "撤销远程会话？",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 19.sp
                    )
                )
            },
            text = {
                Text(
                    "${deviceLabel(session.userAgent)} · ${session.ip}\n该设备将立即失去权限并需要重新登录。",
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = { revokeTarget = null; onRevokeSession(session.nonce) },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) { Text("确认撤销", modifier = Modifier.padding(horizontal = 4.dp)) }
            },
            dismissButton = {
                Surface(
                    onClick = { revokeTarget = null },
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ) {
                    Text(
                        "取消",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                }
            },
        )
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            shape = RoundedCornerShape(24.dp),
            containerColor = Color.White,
            icon = {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEE2E2),
                    border = BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.2f)),
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.AutoMirrored.Outlined.Logout,
                            contentDescription = null,
                            tint = Color(0xFFB91C1C),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            },
            title = {
                Text(
                    "退出当前账号？",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 19.sp
                    )
                )
            },
            text = {
                Text(
                    "当前设备的中央控制会话将立即撤销，下一次使用需要重新登录认证。",
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = { confirmLogout = false; onLogout() },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) { Text("退出登录", modifier = Modifier.padding(horizontal = 4.dp)) }
            },
            dismissButton = {
                Surface(
                    onClick = { confirmLogout = false },
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ) {
                    Text(
                        "取消",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                }
            },
        )
    }
}

@Composable
private fun ProfileGroupLabel(
    title: String,
    trailing: String? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!trailing.isNullOrBlank()) {
            Text(
                trailing,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ProfileDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

@Composable
private fun SecurityRow(icon: ImageVector, title: String, detail: String, status: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            color = Color(0xFFEFF6FF),
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(0.5.dp, Color(0xFF2563EB).copy(alpha = 0.15f)),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color(0xFF2563EB),
                modifier = Modifier.padding(9.dp).size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        StatusBadge(status)
    }
}

@Composable
private fun SessionRow(session: SecuritySession, busy: Boolean, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            color = if (session.current) Color(0xFFEFF6FF) else Color(0xFFF1F5F9),
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(0.5.dp, (if (session.current) Color(0xFF2563EB) else Color(0xFF94A3B8)).copy(alpha = 0.18f)),
        ) {
            Icon(
                Icons.Outlined.Devices,
                contentDescription = null,
                tint = if (session.current) Color(0xFF2563EB) else Color(0xFF64748B),
                modifier = Modifier.padding(9.dp).size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    deviceLabel(session.userAgent),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
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
