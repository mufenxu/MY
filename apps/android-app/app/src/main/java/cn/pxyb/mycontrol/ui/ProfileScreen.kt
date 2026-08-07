package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.ManageAccounts
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.QrCodeScanner
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.SecuritySession

@Composable
fun ProfileScreen(
    state: ProfileUiState,
    contentPadding: PaddingValues,
    onRevokeSession: (String) -> Unit,
    onOpenQrLogin: () -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onOpenAccountManagement: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    notificationsEnabled: Boolean,
    onRequestNotifications: () -> Unit,
) {
    var revokeTarget by remember { mutableStateOf<SecuritySession?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var showSessions by remember { mutableStateOf(false) }
    val user = state.user ?: return
    val security = state.security
    val totpEnabled = security?.totpEnabled == true || user.totpEnabled
    val passkeyCount = security?.passkeyCount ?: user.passkeyCount
    val recoveryCodesRemaining = security?.recoveryCodesRemaining
    val protectionCount = listOf<Boolean?>(
        totpEnabled,
        passkeyCount > 0,
        recoveryCodesRemaining?.let { it > 0 },
    ).count { it == true }
    val protectionStatus = when {
        security == null -> "unknown"
        protectionCount == 3 -> "healthy"
        else -> "warning"
    }
    val protectionBadgeLabel = when {
        security == null -> "同步中"
        protectionCount == 3 -> "正常"
        else -> "待完善"
    }
    val currentSession = security?.sessions?.firstOrNull { it.current }
    val otherSessionCount = security?.sessions?.count { !it.current }

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
                actions = {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = CircleShape,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        androidx.compose.material3.IconButton(
                            onClick = onOpenQrLogin,
                            modifier = Modifier.size(42.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.QrCodeScanner,
                                contentDescription = "网页端登录",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            )
        }
        state.sectionError?.let { message ->
            item { FeedbackBanner("账号数据暂不可用：$message", error = true) }
        }

        item {
            AppPanel {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp, vertical = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // 美化为极具质感的双层圆形头像
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(64.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
                            modifier = Modifier.fillMaxSize()
                        ) {}
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                            modifier = Modifier.size(54.dp)
                        ) {
                            androidx.compose.foundation.Image(
                                painter = painterResource(R.drawable.platform_logo),
                                contentDescription = "用户头像",
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .padding(8.dp)
                                    .fillMaxSize(),
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            user.username,
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 21.sp,
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(6.dp),
                            ) {
                                Text(
                                    text = roleLabel(user.role),
                                    style = MaterialTheme.typography.labelMedium.copy(
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 11.sp
                                    ),
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                            Text(
                                "MY Control",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    StatusBadge("healthy", "已登录")
                }
            }
        }

        if (!notificationsEnabled) {
            item {
                AppPanel {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onRequestNotifications() }
                            .padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(
                                Icons.Outlined.Notifications,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.padding(9.dp).size(22.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            ProfileGroupLabel("状态提醒")
                            Text(
                                "接收系统异常与待处理任务提醒",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                        Text(
                            "开启",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.ManageAccounts,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(9.dp).size(22.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            ProfileGroupLabel("账号安全")
                            Text(
                                "密码、MFA、Passkey 与恢复码",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                        StatusBadge(protectionStatus, protectionBadgeLabel)
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        SecurityMetric(
                            "动态验证",
                            if (totpEnabled) "已启用" else "未启用",
                            Modifier.weight(1f),
                        )
                        SecurityMetric(
                            "Passkey",
                            if (passkeyCount > 0) "$passkeyCount 个" else "未绑定",
                            Modifier.weight(1f),
                        )
                        SecurityMetric(
                            "恢复码",
                            recoveryCodesRemaining?.let { "$it 个" } ?: "同步中",
                            Modifier.weight(1f),
                        )
                    }
                    ProfileDivider()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenAccountManagement() }
                            .padding(horizontal = 18.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "进入账号安全管理",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Icon(
                            Icons.Outlined.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.size(19.dp),
                        )
                    }
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = security != null) { showSessions = !showSessions }
                            .padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(
                                Icons.Outlined.Devices,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.padding(9.dp).size(22.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            ProfileGroupLabel("设备与会话")
                            Text(
                                when {
                                    security == null -> "正在同步登录设备"
                                    otherSessionCount == 0 -> "${currentSession?.let { deviceLabel(it.userAgent) } ?: "当前设备"} · 扫码登录网页端"
                                    else -> "$otherSessionCount 台其他设备 · ${currentSession?.let { deviceLabel(it.userAgent) } ?: "当前设备"}"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                        if (security != null) {
                            Text(
                                if (showSessions) "收起" else "管理",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                    if (showSessions) {
                        ProfileDivider()
                        when {
                            security == null -> LoadingBlock("正在同步登录设备")
                            security.sessions.isEmpty() -> Text(
                                "暂无活动会话",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 18.dp, vertical = 20.dp),
                            )
                            else -> security.sessions.forEachIndexed { index, session ->
                                if (index > 0) ProfileDivider()
                                SessionRow(
                                    session = session,
                                    busy = state.busyAction == "session",
                                    onRevoke = { revokeTarget = session },
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            AppPanel {
                ProfileGroupLabel("应用与账号", modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
                ProfileDivider()
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = CircleShape,
                    ) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(R.drawable.platform_logo),
                            contentDescription = null,
                            modifier = Modifier.padding(7.dp).size(34.dp).clip(CircleShape),
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
                }
                ProfileDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenGoogleAccountDesk() }
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Email,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Google 邮箱台账", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "管理主邮箱、别名和 OpenAI 使用状态",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        Icons.Outlined.ChevronRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.size(19.dp),
                    )
                }
                ProfileDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = state.busyAction == null) { confirmLogout = true }
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (state.busyAction == "logout") {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.error,
                            strokeWidth = 2.5.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Outlined.Logout,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Text(
                        text = "退出当前账号",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }

    revokeTarget?.let { session ->
        AppConfirmDialog(
            title = "撤销远程会话？",
            detail = "${deviceLabel(session.userAgent)} · ${session.ip}\n该设备将立即失去权限并需要重新登录。",
            confirmLabel = "确认撤销",
            onDismiss = { revokeTarget = null },
            onConfirm = { revokeTarget = null; onRevokeSession(session.nonce) },
            icon = Icons.Outlined.Devices,
        )
    }

    if (confirmLogout) {
        AppConfirmDialog(
            title = "退出当前账号？",
            detail = "当前设备的中央控制会话将立即撤销，下一次使用需要重新登录认证。",
            confirmLabel = "退出登录",
            onDismiss = { confirmLogout = false },
            onConfirm = { confirmLogout = false; onLogout() },
            icon = Icons.AutoMirrored.Outlined.Logout,
            danger = true,
        )
    }
}

@Composable
private fun SecurityMetric(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
        Spacer(Modifier.height(5.dp))
        Text(
            value,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
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
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (!trailing.isNullOrBlank()) {
            Text(
                trailing,
                style = MaterialTheme.typography.labelMedium,
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
private fun SessionRow(session: SecuritySession, busy: Boolean, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            color = if (session.current) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Icon(
                Icons.Outlined.Devices,
                contentDescription = null,
                tint = if (session.current) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
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
