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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.ManageAccounts
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Security
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
    val sessionSummary = when {
        security == null -> "正在同步登录设备"
        otherSessionCount == 0 -> "${currentSession?.let { deviceLabel(it.userAgent) } ?: "当前设备"} · 扫码登录网页端"
        else -> "$otherSessionCount 台其他设备 · ${currentSession?.let { deviceLabel(it.userAgent) } ?: "当前设备"}"
    }

    val listState = rememberLazyListState()
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                ImmersiveHeader(
                    title = "我的",
                    subtitle = "账号、安全与设备",
                    actions = {
                        AppHeaderIconButton(
                            icon = Icons.Outlined.CenterFocusWeak,
                            contentDescription = "网页端登录",
                            onClick = onOpenQrLogin,
                            iconTint = MaterialTheme.colorScheme.primary,
                            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                        )
                    },
                )
            }
            state.sectionError?.let { message ->
                item { FeedbackBanner("账号数据暂不可用：$message", error = true) }
            }

            // 个人资料
            item {
                AppPanel {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        ProfileAvatar()
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
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                                    shape = RoundedCornerShape(6.dp),
                                ) {
                                    Text(
                                        text = roleLabel(user.role),
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 11.sp,
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

            // 状态提醒
            if (!notificationsEnabled) {
                item {
                    AppPanel {
                        ProfileActionRow(
                            icon = Icons.Outlined.Notifications,
                            iconTint = MaterialTheme.colorScheme.secondary,
                            iconBackground = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                            title = "状态提醒",
                            subtitle = "接收系统异常与待处理任务提醒",
                            onClick = onRequestNotifications,
                            showChevron = false,
                            trailing = {
                                Text(
                                    "开启",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            },
                        )
                    }
                }
            }

            // 账号安全
            item {
                AppPanel {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProfileCardHeader(
                            icon = Icons.Outlined.ManageAccounts,
                            iconTint = MaterialTheme.colorScheme.primary,
                            iconBackground = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                            title = "账号安全",
                            subtitle = "密码、MFA、Passkey 与恢复码",
                            trailing = { StatusBadge(protectionStatus, protectionBadgeLabel) },
                        )
                        ProfileDivider()
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 6.dp),
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
                        ProfileActionRow(
                            icon = Icons.Outlined.Security,
                            iconTint = MaterialTheme.colorScheme.primary,
                            iconBackground = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                            title = "账号安全管理",
                            subtitle = "修改密码、绑定 MFA 与管理恢复码",
                            onClick = onOpenAccountManagement,
                        )
                    }
                }
            }

            // 设备与会话
            item {
                AppPanel {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProfileCardHeader(
                            icon = Icons.Outlined.Devices,
                            iconTint = MaterialTheme.colorScheme.secondary,
                            iconBackground = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
                            title = "设备与会话",
                            subtitle = sessionSummary,
                            onClick = if (security != null) {
                                { showSessions = !showSessions }
                            } else {
                                null
                            },
                            trailing = {
                                if (security != null) {
                                    Text(
                                        if (showSessions) "收起" else "管理",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            },
                        )
                        if (showSessions) {
                            ProfileDivider()
                            when {
                                security == null -> LoadingBlock("正在同步登录设备")
                                security.sessions.isEmpty() -> Text(
                                    "暂无活动会话",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
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

            // 应用与服务
            item {
                AppPanel {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 14.dp),
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
                                    modifier = Modifier.padding(6.dp).size(34.dp).clip(CircleShape),
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
                        ProfileActionRow(
                            icon = Icons.Outlined.Email,
                            iconTint = MaterialTheme.colorScheme.primary,
                            iconBackground = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
                            title = "Google 邮箱台账",
                            subtitle = "管理主邮箱、别名和 OpenAI 使用状态",
                            onClick = onOpenGoogleAccountDesk,
                        )
                    }
                }
            }

            // 退出登录
            item {
                AppPanel {
                    ProfileActionRow(
                        icon = Icons.AutoMirrored.Outlined.Logout,
                        iconTint = MaterialTheme.colorScheme.error,
                        iconBackground = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                        title = "退出当前账号",
                        titleColor = MaterialTheme.colorScheme.error,
                        onClick = { confirmLogout = true },
                        enabled = state.busyAction == null,
                        busy = state.busyAction == "logout",
                        showChevron = false,
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
private fun ProfileAvatar() {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(64.dp)) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
            border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
            modifier = Modifier.fillMaxSize(),
        ) {}
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
            modifier = Modifier.size(54.dp),
        ) {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.platform_logo),
                contentDescription = "用户头像",
                modifier = Modifier.clip(CircleShape).padding(8.dp).fillMaxSize(),
            )
        }
    }
}

@Composable
private fun ProfileCardHeader(
    icon: ImageVector,
    iconTint: Color,
    iconBackground: Color,
    title: String,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconTile(icon, iconTint, iconBackground, modifier = Modifier.size(40.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        trailing?.invoke()
    }
}

@Composable
private fun ProfileActionRow(
    icon: ImageVector,
    iconTint: Color,
    iconBackground: Color,
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    enabled: Boolean = true,
    busy: Boolean = false,
    showChevron: Boolean = true,
    titleColor: Color = MaterialTheme.colorScheme.onSurface,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(modifier = Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.5.dp,
                    color = iconTint,
                )
            } else {
                IconTile(icon, iconTint, iconBackground, modifier = Modifier.size(40.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = titleColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        if (trailing != null) {
            trailing()
        } else if (showChevron) {
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.size(19.dp),
            )
        }
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
