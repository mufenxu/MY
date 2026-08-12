package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material3.IconButton
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
            contentPadding = appPageContentPadding(contentPadding, topSpacing = 4.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 1. 通透极简顶栏
            item {
                ModernProfileHeader(onOpenQrLogin = onOpenQrLogin)
            }

            state.sectionError?.let { message ->
                item { FeedbackBanner("账号数据暂不可用：$message", error = true) }
            }

            // 2. 个人资料卡片 (Profile Card + 版本合并精简)
            item {
                ModernProfileCard(
                    username = user.username,
                    role = user.role,
                    versionStr = BuildConfig.VERSION_NAME,
                )
            }

            // 3. 状态提醒卡片 (如果未开启)
            if (!notificationsEnabled) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(24.dp),
                        color = Color(0xFFFFFBEB),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    ) {
                        ProfileActionRow(
                            icon = Icons.Outlined.Notifications,
                            iconTint = Color(0xFFD97706),
                            iconBackground = Color(0xFFFEF3C7),
                            title = "系统通知权限未开启",
                            subtitle = "建议开启通知，及时接收系统异常与任务状态提醒",
                            onClick = onRequestNotifications,
                            showChevron = false,
                            trailing = {
                                Text(
                                    "开启提醒",
                                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                    color = Color(0xFFD97706),
                                )
                            },
                        )
                    }
                }
            }

            // 4. 账号安全卡片 (Bento Grid 极简三格)
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                    shadowElevation = 1.dp,
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProfileCardHeader(
                            icon = Icons.Outlined.ManageAccounts,
                            iconTint = Color(0xFF2563EB),
                            iconBackground = Color(0xFFEFF6FF),
                            title = "账号安全",
                            subtitle = "密码、MFA、Passkey 与恢复码",
                            trailing = { StatusBadge(protectionStatus, protectionBadgeLabel) },
                        )
                        ProfileDivider()

                        // Bento 三格数据展示
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            LightSecurityCell(
                                label = "动态验证",
                                value = if (totpEnabled) "已启用" else "未启用",
                                isGood = totpEnabled,
                                modifier = Modifier.weight(1f),
                            )
                            LightSecurityCell(
                                label = "Passkey",
                                value = if (passkeyCount > 0) "$passkeyCount 个" else "未绑定",
                                isGood = passkeyCount > 0,
                                modifier = Modifier.weight(1f),
                            )
                            LightSecurityCell(
                                label = "恢复码",
                                value = recoveryCodesRemaining?.let { "$it 个" } ?: "同步中",
                                isGood = (recoveryCodesRemaining ?: 0) > 0,
                                modifier = Modifier.weight(1f),
                            )
                        }

                        ProfileDivider()
                        ProfileActionRow(
                            icon = Icons.Outlined.Security,
                            iconTint = Color(0xFF2563EB),
                            iconBackground = Color(0xFFEFF6FF),
                            title = "账号安全管理",
                            subtitle = "修改密码、绑定 MFA 与管理恢复码",
                            onClick = onOpenAccountManagement,
                        )
                    }
                }
            }

            // 5. 设备与会话管理
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                    shadowElevation = 1.dp,
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProfileCardHeader(
                            icon = Icons.Outlined.Devices,
                            iconTint = Color(0xFF059669),
                            iconBackground = Color(0xFFECFDF5),
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
                                        if (showSessions) "收起" else "管理会话",
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                        color = Color(0xFF059669),
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

            // 6. 服务台账与工具卡片 (精简集成)
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                    shadowElevation = 1.dp,
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        ProfileActionRow(
                            icon = Icons.Outlined.Email,
                            iconTint = Color(0xFF7C3AED),
                            iconBackground = Color(0xFFF5F3FF),
                            title = "Google 邮箱台账",
                            subtitle = "管理主邮箱、别名和 OpenAI 使用状态",
                            onClick = onOpenGoogleAccountDesk,
                        )
                    }
                }
            }

            // 7. 退出当前账号按钮
            item {
                val interactionSource = remember { MutableInteractionSource() }
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .pressFeedback(interactionSource)
                        .clickable(
                            enabled = state.busyAction == null,
                            onClick = { confirmLogout = true },
                        ),
                    shape = RoundedCornerShape(22.dp),
                    color = Color(0xFFFEF2F2),
                    border = BorderStroke(1.dp, Color(0xFFFCA5A5).copy(alpha = 0.6f)),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 14.dp, horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        if (state.busyAction == "logout") {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = Color(0xFFDC2626),
                            )
                        } else {
                            Icon(
                                imageVector = Icons.AutoMirrored.Outlined.Logout,
                                contentDescription = null,
                                tint = Color(0xFFDC2626),
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.size(8.dp))
                            Text(
                                "退出当前账号",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFDC2626),
                                ),
                            )
                        }
                    }
                }
            }

            item {
                Spacer(Modifier.height(16.dp))
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

// ------------------------------------------------------------------------------------------------
// 极简通透现代化 UI 组件
// ------------------------------------------------------------------------------------------------

/** 通透顶栏 */
@Composable
private fun ModernProfileHeader(onOpenQrLogin: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "我的",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onBackground,
            ),
        )

        ModernHeaderIconButton(
            icon = Icons.Outlined.CenterFocusWeak,
            contentDescription = "扫码登录",
            onClick = onOpenQrLogin,
        )
    }
}

/** 个人资料 Card (含版本号合并精简) */
@Composable
private fun ModernProfileCard(
    username: String,
    role: String,
    versionStr: String,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 大号精致头像
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(60.dp)) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                    border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxSize(),
                ) {}
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                    modifier = Modifier.size(50.dp),
                ) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(R.drawable.platform_logo),
                        contentDescription = "用户头像",
                        modifier = Modifier.clip(CircleShape).padding(7.dp).fillMaxSize(),
                    )
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        username,
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Surface(
                        color = Color(0xFFEFF6FF),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(0.5.dp, Color(0xFFBFDBFE)),
                    ) {
                        Text(
                            text = roleLabel(role),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                            ),
                            color = Color(0xFF1D4ED8),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "MY Control · 生产环境 v$versionStr",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            StatusBadge("healthy", "已登录")
        }
    }
}

/** Bento 清新 Security Cell */
@Composable
private fun LightSecurityCell(
    label: String,
    value: String,
    isGood: Boolean,
    modifier: Modifier = Modifier,
) {
    val bgColor = if (isGood) Color(0xFFECFDF5) else Color(0xFFFFFBEB)
    val borderColor = if (isGood) Color(0xFFA7F3D0) else Color(0xFFFDE68A)
    val textColor = if (isGood) Color(0xFF047857) else Color(0xFFB45309)

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = bgColor,
        border = BorderStroke(0.5.dp, borderColor),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color = textColor,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
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
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
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
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
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
private fun ProfileDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
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
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (session.current) StatusBadge("healthy", "当前设备")
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
