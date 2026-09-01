package cn.pxyb.mycontrol.ui

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.Laptop
import androidx.compose.material.icons.outlined.ManageAccounts
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.SecuritySession
import cn.pxyb.mycontrol.update.AppUpdatePhase

@Composable
fun ProfileScreen(
    state: ProfileUiState,
    contentPadding: PaddingValues,
    onRevokeSession: (String) -> Unit,
    onOpenQrLogin: () -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onClearCache: () -> Unit,
    onForceFullSync: () -> Unit,
    onOpenAccountManagement: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    notificationsEnabled: Boolean,
    onRequestNotifications: () -> Unit,
    onCreateDesktopMagicLink: ((String?, String?) -> Unit) -> Unit,
    onUpdateNotificationPreferences: (AlertPreferences) -> Unit,
    onCheckUpdates: () -> Unit,
    onDownloadAndInstallUpdate: () -> Unit,
    onInstallDownloadedUpdate: () -> Unit,
    onOpenReleases: (String?) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
    assistantButtonVisible: Boolean,
    onAssistantButtonVisibleChange: (Boolean) -> Unit,
) {
    var revokeTarget by remember { mutableStateOf<SecuritySession?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var showSessions by remember { mutableStateOf(false) }
    var showNotificationDialog by remember { mutableStateOf(false) }
    var showMagicLinkDialog by remember { mutableStateOf<String?>(null) }
    var showUpdateDialog by remember { mutableStateOf(false) }
    var confirmClearCache by remember { mutableStateOf(false) }
    var showPrivacyPolicy by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
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
    val rawVisibleSessions = security?.sessions?.filterNot { it.sessionKind == "embedded_web" }
    val identifiedNativeFallbackKeys = rawVisibleSessions
        ?.filter { it.sessionKind == "native_app" && !it.deviceId.isNullOrBlank() }
        ?.mapTo(mutableSetOf()) { "${it.subject}|${it.userAgent}|${it.ip}" }
        .orEmpty()
    val visibleSessions = rawVisibleSessions
        ?.filterNot {
            it.sessionKind == "native_app"
                && it.deviceId.isNullOrBlank()
                && "${it.subject}|${it.userAgent}|${it.ip}" in identifiedNativeFallbackKeys
        }
        ?.groupBy { session ->
            when {
                session.sessionKind != "native_app" -> session.nonce
                !session.deviceId.isNullOrBlank() -> "${session.subject}|${session.deviceId}"
                else -> "${session.subject}|${session.userAgent}|${session.ip}"
            }
        }
        ?.values
        ?.map { group -> group.firstOrNull { it.current } ?: group.first() }
    val currentSession = visibleSessions?.firstOrNull { it.current }
    val otherSessionCount = visibleSessions?.count { !it.current }
    val sessionSummary = when {
        security == null -> "正在同步登录设备"
        otherSessionCount == 0 -> "${currentSession?.let { sessionTitle(it) } ?: "当前设备"} · 扫码登录网页端"
        else -> "$otherSessionCount 个其他登录会话 · ${currentSession?.let { sessionTitle(it) } ?: "当前设备"}"
    }

    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded

    val listState = rememberLazyListState()
    val dark = isSystemInDarkTheme()
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
            contentPadding = appPageContentPadding(contentPadding, topSpacing = 4.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 1. 通透极简顶栏
            item {
                ModernProfileHeader(
                    onOpenQrLogin = onOpenQrLogin,
                    unreadCount = state.unreadAlerts,
                    onOpenNotifications = onOpenNotifications,
                    onOpenSettings = onOpenSettings,
                )
            }

            state.sectionError?.let { message ->
                item(key = "section-error") { FeedbackBanner("账号数据暂不可用：$message", error = true) }
            }

            if (isTablet) {
                // 平板 / 大屏双列 Bento 布局
                item(key = "tablet-profile-bento") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // 左列：个人资料 + 账号安全 + 设备与会话
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            ModernProfileCard(
                                username = user.username,
                                role = user.role,
                                versionStr = BuildConfig.VERSION_NAME,
                            )

                            ProfileSectionTitle("账号与安全", "密码、MFA 与登录设备")

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
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

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
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
                                    ProfileDivider()
                                    ProfileActionRow(
                                        icon = Icons.Outlined.Laptop,
                                        iconTint = Color(0xFF2563EB),
                                        iconBackground = Color(0xFFEFF6FF),
                                        title = "电脑端快捷免密登录",
                                        subtitle = "生成单次使用、5 分钟内有效的登录链接",
                                        busy = state.busyAction == "desktop-magic-link",
                                        onClick = {
                                            onCreateDesktopMagicLink { url, error ->
                                                if (url != null) {
                                                    showMagicLinkDialog = url
                                                } else if (error != null) {
                                                    Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
                                                }
                                            }
                                        },
                                    )
                                    if (showSessions) {
                                        ProfileDivider()
                                        when {
                                            security == null -> LoadingBlock("正在同步登录设备")
                                            visibleSessions.isNullOrEmpty() -> Text(
                                                "暂无活动会话",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
                                            )
                                            else -> visibleSessions.forEachIndexed { index, session ->
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

                        // 右列：通知偏好 + 服务台账 + 维护 + 退出
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            ProfileSectionTitle("通知与提醒", "告警推送与免打扰设置")

                            if (!notificationsEnabled) {
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(20.dp),
                                    color = Color(0xFFFFFBEB).copy(alpha = 0.6f),
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

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    ProfileCardHeader(
                                        icon = Icons.Outlined.NotificationsActive,
                                        iconTint = Color(0xFFEA580C),
                                        iconBackground = Color(0xFFFFF7ED),
                                        title = "告警推送与免打扰",
                                        subtitle = if (state.alertPreferences.quietHoursEnabled) {
                                            "免打扰已开启 · ${state.alertPreferences.quietStartHour}:00 - ${state.alertPreferences.quietEndHour}:00"
                                        } else {
                                            "全天候接收 · 过滤级别: ${severityLabel(state.alertPreferences.severityFilter)}"
                                        },
                                        onClick = { showNotificationDialog = true },
                                        trailing = {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            ) {
                                                Surface(
                                                    color = if (state.alertPreferences.quietHoursEnabled) Color(0xFFF3E8FF) else Color(0xFFECFDF5),
                                                    shape = RoundedCornerShape(8.dp),
                                                    border = BorderStroke(0.5.dp, if (state.alertPreferences.quietHoursEnabled) Color(0xFFDDD6FE) else Color(0xFFA7F3D0)),
                                                ) {
                                                    Text(
                                                        text = if (state.alertPreferences.quietHoursEnabled) "夜间免打扰" else "全天提醒",
                                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                                        color = if (state.alertPreferences.quietHoursEnabled) Color(0xFF7C3AED) else Color(0xFF047857),
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                                    )
                                                }
                                                Icon(
                                                    Icons.Outlined.ChevronRight,
                                                    contentDescription = "打开通知偏好",
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                                    modifier = Modifier.size(19.dp),
                                                )
                                            }
                                        },
                                    )
                                }
                            }

                            ProfileSectionTitle("服务与维护", "账号服务、缓存与版本")

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
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

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    ProfileCardHeader(
                                        icon = Icons.Outlined.AutoAwesome,
                                        iconTint = Color(0xFF7C3AED),
                                        iconBackground = Color(0xFFF5F3FF),
                                        title = "AI 小助手",
                                        subtitle = "悬浮助手按钮与快捷入口",
                                        trailing = {
                                            AppSwitch(
                                                checked = assistantButtonVisible,
                                                onCheckedChange = onAssistantButtonVisibleChange,
                                                tint = Color(0xFF7C3AED),
                                            )
                                        },
                                    )
                                    ProfileDivider()
                                    Text(
                                        "在页面显示可自由拖动的 AI 小助手按钮，拖到屏幕边缘会自动收纳成细条，不影响内容浏览",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                    )
                                }
                            }

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    ProfileCardHeader(
                                        icon = Icons.Outlined.CleaningServices,
                                        iconTint = Color(0xFF0D9488),
                                        iconBackground = Color(0xFFF0FDFA),
                                        title = "App 维护",
                                        subtitle = "本地缓存与数据同步",
                                        trailing = {
                                            Text(
                                                state.cacheStorageInfo.totalFormatted,
                                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                                color = Color(0xFF0D9488),
                                            )
                                        },
                                    )
                                    ProfileDivider()
                                    ProfileActionRow(
                                        icon = Icons.Outlined.CloudSync,
                                        iconTint = Color(0xFF2563EB),
                                        iconBackground = Color(0xFFEFF6FF),
                                        title = "强制全量重新同步",
                                        subtitle = "重新拉取全部模块的最新数据",
                                        onClick = {
                                            onForceFullSync()
                                            Toast.makeText(context, "正在全量重新同步数据...", Toast.LENGTH_SHORT).show()
                                        },
                                    )
                                    ProfileDivider()
                                    ProfileActionRow(
                                        icon = Icons.Outlined.CleaningServices,
                                        iconTint = Color(0xFF0D9488),
                                        iconBackground = Color(0xFFF0FDFA),
                                        title = "清理本地缓存",
                                        subtitle = "释放 ${state.cacheStorageInfo.totalFormatted}，保留登录、个人设置与外部系统登录态",
                                        onClick = { confirmClearCache = true },
                                    )
                                }
                            }

                            // 5. 关于应用（平板右列）
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    ProfileActionRow(
                                        icon = Icons.Outlined.SystemUpdate,
                                        iconTint = Color(0xFF2563EB),
                                        iconBackground = Color(0xFFEFF6FF),
                                        title = "关于 MY Control",
                                        subtitle = "当前版本 v${BuildConfig.VERSION_NAME} · 查看版本与更新",
                                        busy = state.busyAction == "check-updates",
                                        onClick = {
                                            onCheckUpdates()
                                            showUpdateDialog = true
                                        },
                                        trailing = {
                                            Text(
                                                "查看",
                                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                                color = Color(0xFF2563EB),
                                            )
                                        },
                                    )
                                    ProfileActionRow(
                                        icon = Icons.Outlined.Security,
                                        iconTint = Color(0xFF6D28D9),
                                        iconBackground = Color(0xFFF5F3FF),
                                        title = "隐私政策",
                                        subtitle = "查看 MY Control 如何收集、存储与保护你的数据",
                                        onClick = { showPrivacyPolicy = true },
                                        trailing = {
                                            Text(
                                                "查看",
                                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                                color = Color(0xFF2563EB),
                                            )
                                        },
                                    )
                                }
                            }

                            // 6. 退出登录按钮（平板右列唯一样式）
                            val tabletLogoutInteraction = remember { MutableInteractionSource() }
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .pressFeedback(tabletLogoutInteraction)
                                    .clickable(
                                        enabled = state.busyAction == null,
                                        onClick = { confirmLogout = true },
                                    ),
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0xFFFEF2F2).copy(alpha = 0.6f),
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
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                            color = Color(0xFFDC2626),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // 手机单列流：与首页一致的卡片节奏与分组标题
                item {
                    ModernProfileCard(
                        username = user.username,
                        role = user.role,
                        versionStr = BuildConfig.VERSION_NAME,
                    )
                }

                item(key = "profile-section-notifications") {
                    ProfileSectionTitle("通知与提醒", "告警推送与免打扰设置")
                }

                if (!notificationsEnabled) {
                    item(key = "notification-permission") {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            color = Color(0xFFFFFBEB).copy(alpha = 0.6f),
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

                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            ProfileCardHeader(
                                icon = Icons.Outlined.NotificationsActive,
                                iconTint = Color(0xFFEA580C),
                                iconBackground = Color(0xFFFFF7ED),
                                title = "告警推送与免打扰",
                                subtitle = if (state.alertPreferences.quietHoursEnabled) {
                                    "免打扰已开启 · ${state.alertPreferences.quietStartHour}:00 - ${state.alertPreferences.quietEndHour}:00"
                                } else {
                                    "全天候接收 · 过滤级别: ${severityLabel(state.alertPreferences.severityFilter)}"
                                },
                                onClick = { showNotificationDialog = true },
                                trailing = {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Surface(
                                            color = if (state.alertPreferences.quietHoursEnabled) Color(0xFFF3E8FF) else Color(0xFFECFDF5),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(0.5.dp, if (state.alertPreferences.quietHoursEnabled) Color(0xFFDDD6FE) else Color(0xFFA7F3D0)),
                                        ) {
                                            Text(
                                                text = if (state.alertPreferences.quietHoursEnabled) "夜间免打扰" else "全天提醒",
                                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                                color = if (state.alertPreferences.quietHoursEnabled) Color(0xFF7C3AED) else Color(0xFF047857),
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                            )
                                        }
                                        Icon(
                                            Icons.Outlined.ChevronRight,
                                            contentDescription = "打开通知偏好",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                            modifier = Modifier.size(19.dp),
                                        )
                                    }
                                },
                            )
                        }
                    }
                }

                item(key = "profile-section-account") {
                    ProfileSectionTitle("账号与安全", "密码、MFA 与登录设备")
                }

                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
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

                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
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

                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
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
                            ProfileDivider()
                            ProfileActionRow(
                                icon = Icons.Outlined.Laptop,
                                iconTint = Color(0xFF2563EB),
                                iconBackground = Color(0xFFEFF6FF),
                                title = "电脑端快捷免密登录",
                                subtitle = "生成单次使用、5 分钟内有效的登录链接",
                                busy = state.busyAction == "desktop-magic-link",
                                onClick = {
                                    onCreateDesktopMagicLink { url, error ->
                                        if (url != null) {
                                            showMagicLinkDialog = url
                                        } else if (error != null) {
                                            Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                },
                            )
                            if (showSessions) {
                                ProfileDivider()
                                when {
                                    security == null -> LoadingBlock("正在同步登录设备")
                                    visibleSessions.isNullOrEmpty() -> Text(
                                        "暂无活动会话",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 18.dp),
                                    )
                                    else -> visibleSessions.forEachIndexed { index, session ->
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

                item(key = "profile-section-misc") {
                    ProfileSectionTitle("通用与维护", "缓存、同步与版本信息")
                }

                item(key = "profile-assistant-button") {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            ProfileCardHeader(
                                icon = Icons.Outlined.AutoAwesome,
                                iconTint = Color(0xFF7C3AED),
                                iconBackground = Color(0xFFF5F3FF),
                                title = "AI 小助手",
                                subtitle = "悬浮助手按钮与快捷入口",
                                trailing = {
                                    AppSwitch(
                                        checked = assistantButtonVisible,
                                        onCheckedChange = onAssistantButtonVisibleChange,
                                        tint = Color(0xFF7C3AED),
                                    )
                                },
                            )
                            ProfileDivider()
                            Text(
                                "在页面显示可自由拖动的 AI 小助手按钮，拖到屏幕边缘会自动收纳成细条，不影响内容浏览",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                            )
                        }
                    }
                }

                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            ProfileCardHeader(
                                icon = Icons.Outlined.CleaningServices,
                                iconTint = Color(0xFF0D9488),
                                iconBackground = Color(0xFFF0FDFA),
                                title = "App 维护",
                                subtitle = "本地缓存与数据同步",
                                trailing = {
                                    Text(
                                        state.cacheStorageInfo.totalFormatted,
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                        color = Color(0xFF0D9488),
                                    )
                                },
                            )
                            ProfileDivider()
                            ProfileActionRow(
                                icon = Icons.Outlined.CloudSync,
                                iconTint = Color(0xFF2563EB),
                                iconBackground = Color(0xFFEFF6FF),
                                title = "强制全量重新同步",
                                subtitle = "重新拉取全部模块的最新数据",
                                onClick = {
                                    onForceFullSync()
                                    Toast.makeText(context, "正在全量重新同步数据...", Toast.LENGTH_SHORT).show()
                                },
                            )
                            ProfileDivider()
                            ProfileActionRow(
                                icon = Icons.Outlined.CleaningServices,
                                iconTint = Color(0xFF0D9488),
                                iconBackground = Color(0xFFF0FDFA),
                                title = "清理本地缓存",
                                subtitle = "释放 ${state.cacheStorageInfo.totalFormatted}，保留登录、个人设置与外部系统登录态",
                                onClick = { confirmClearCache = true },
                            )
                        }
                    }
                }

                // 关于应用（手机单列）
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            ProfileActionRow(
                                icon = Icons.Outlined.SystemUpdate,
                                iconTint = Color(0xFF2563EB),
                                iconBackground = Color(0xFFEFF6FF),
                                title = "关于 MY Control",
                                subtitle = "当前版本 v${BuildConfig.VERSION_NAME} · 查看版本与更新",
                                busy = state.busyAction == "check-updates",
                                onClick = {
                                    onCheckUpdates()
                                    showUpdateDialog = true
                                },
                                trailing = {
                                    Text(
                                        "查看",
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                        color = Color(0xFF2563EB),
                                    )
                                },
                            )
                            ProfileActionRow(
                                icon = Icons.Outlined.Security,
                                iconTint = Color(0xFF6D28D9),
                                iconBackground = Color(0xFFF5F3FF),
                                title = "隐私政策",
                                subtitle = "查看 MY Control 如何收集、存储与保护你的数据",
                                onClick = { showPrivacyPolicy = true },
                                trailing = {
                                    Text(
                                        "查看",
                                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                                        color = Color(0xFF2563EB),
                                    )
                                },
                            )
                        }
                    }
                }

                // 退出当前账号（手机单列）
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
                        shape = RoundedCornerShape(20.dp),
                        color = Color(0xFFFEF2F2).copy(alpha = 0.6f),
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
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = Color(0xFFDC2626),
                                )
                            }
                        }
                    }
                }
            }

            item {
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    // --------------------------------------------------------------------------------------------
    // 弹窗与交互对话框
    // --------------------------------------------------------------------------------------------

    // 1. 桌面端快捷登录弹窗
    showMagicLinkDialog?.let { url ->
        Dialog(
            onDismissRequest = { showMagicLinkDialog = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .padding(16.dp),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconTile(Icons.Outlined.Laptop, Color(0xFF2563EB), Color(0xFFEFF6FF), modifier = Modifier.size(44.dp))
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("电脑端快捷免密登录", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                            Text("单次使用 · 5分钟内有效", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = url,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(12.dp),
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Spacer(Modifier.height(18.dp))

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = { showMagicLinkDialog = null },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text("关闭")
                        }
                        Button(
                            onClick = {
                                clipboardManager.setText(AnnotatedString(url))
                                Toast.makeText(context, "已复制登录链接到剪贴板", Toast.LENGTH_SHORT).show()
                                showMagicLinkDialog = null
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("复制链接")
                        }
                    }
                }
            }
        }
    }

    // 2. 告警推送与免打扰偏好设置弹窗
    if (showNotificationDialog) {
        NotificationPreferencesDialog(
            current = state.alertPreferences,
            onDismiss = { showNotificationDialog = false },
            onSave = { updated ->
                onUpdateNotificationPreferences(updated)
                showNotificationDialog = false
                Toast.makeText(context, "推送与免打扰偏好已保存", Toast.LENGTH_SHORT).show()
            },
        )
    }

    // 3. 关于应用与版本检查
    if (showUpdateDialog) {
        Dialog(
            onDismissRequest = { showUpdateDialog = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .padding(16.dp),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconTile(Icons.Outlined.SystemUpdate, Color(0xFF2563EB), Color(0xFFEFF6FF), modifier = Modifier.size(44.dp))
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("关于 MY Control", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                            Text("当前本地版本: v${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    when (state.appUpdate.phase) {
                        AppUpdatePhase.Idle,
                        AppUpdatePhase.Checking,
                        -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = Color(0xFF2563EB),
                            background = Color(0xFFEFF6FF),
                            title = "正在检查 GitHub Releases",
                            detail = "正在读取最新稳定版信息...",
                            loading = true,
                        )

                        AppUpdatePhase.Current -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.CheckCircle,
                            tint = Color(0xFF047857),
                            background = Color(0xFFECFDF5),
                            title = "当前已是最新稳定版",
                            detail = "本机 v${BuildConfig.VERSION_NAME} · GitHub v${state.appUpdate.info?.versionName ?: BuildConfig.VERSION_NAME}",
                        )

                        AppUpdatePhase.Available -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = Color(0xFF1D4ED8),
                            background = Color(0xFFEFF6FF),
                            title = "发现新版本 v${state.appUpdate.info?.versionName.orEmpty()}",
                            detail = state.appUpdate.info?.notes?.ifBlank { "包含新的功能与稳定性改进" }
                                ?: "包含新的功能与稳定性改进",
                        )

                        AppUpdatePhase.Downloading -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.FileDownload,
                            tint = Color(0xFF2563EB),
                            background = Color(0xFFEFF6FF),
                            title = "正在下载并校验安装包",
                            detail = "${state.appUpdate.progress}% · 完成后将打开系统安装器",
                            progress = state.appUpdate.progress,
                        )

                        AppUpdatePhase.ReadyToInstall -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.CheckCircle,
                            tint = Color(0xFF047857),
                            background = Color(0xFFECFDF5),
                            title = "安装包校验通过",
                            detail = "可以继续交给 Android 系统安装器安装。",
                        )

                        AppUpdatePhase.InstallPermissionRequired -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = Color(0xFFB45309),
                            background = Color(0xFFFFFBEB),
                            title = "需要允许此来源安装应用",
                            detail = "在系统设置中开启权限，返回后点击继续安装。",
                        )

                        AppUpdatePhase.Installing -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = Color(0xFF047857),
                            background = Color(0xFFECFDF5),
                            title = "系统安装器已打开",
                            detail = "请按系统提示完成更新安装。",
                        )

                        AppUpdatePhase.Error -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = Color(0xFFB91C1C),
                            background = Color(0xFFFEF2F2),
                            title = "更新检查或安装未完成",
                            detail = state.appUpdate.error ?: "请稍后重试，或前往 GitHub Releases 手动下载。",
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    when (state.appUpdate.phase) {
                        AppUpdatePhase.Available -> Button(
                            onClick = onDownloadAndInstallUpdate,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Icon(Icons.Outlined.FileDownload, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("下载并安装")
                        }

                        AppUpdatePhase.ReadyToInstall,
                        AppUpdatePhase.InstallPermissionRequired,
                        -> Button(
                            onClick = onInstallDownloadedUpdate,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Icon(Icons.Outlined.SystemUpdate, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (state.appUpdate.phase == AppUpdatePhase.InstallPermissionRequired) "继续安装" else "打开系统安装器")
                        }

                        AppUpdatePhase.Error -> {
                            Button(
                                onClick = onCheckUpdates,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                            ) {
                                Icon(Icons.Outlined.SystemUpdate, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("重新检查")
                            }
                            Spacer(Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = { onOpenReleases(state.appUpdate.info?.releaseUrl) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                            ) {
                                Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("打开 GitHub Releases")
                            }
                        }

                        else -> OutlinedButton(
                            onClick = { showUpdateDialog = false },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Text("关闭")
                        }
                    }
                }
            }
        }
    }

    // 撤销会话与退出登录
    revokeTarget?.let { session ->
        AppConfirmDialog(
            title = "撤销远程会话？",
            detail = "${sessionTitle(session)} · ${session.ip}\n该设备将立即失去权限并需要重新登录。",
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

    if (confirmClearCache) {
        AppConfirmDialog(
            title = "清理本地缓存？",
            detail = "将清理离线快照、WebView 页面缓存与已下载更新包，登录凭据、个人设置和外部系统登录态不受影响。",
            confirmLabel = "确认清理",
            onDismiss = { confirmClearCache = false },
            onConfirm = {
                confirmClearCache = false
                onClearCache()
                Toast.makeText(context, "本地缓存已清理", Toast.LENGTH_SHORT).show()
            },
            icon = Icons.Outlined.CleaningServices,
        )
    }

    if (showPrivacyPolicy) {
        PrivacyPolicyDialog(onDismiss = { showPrivacyPolicy = false })
    }
}

@Composable
private fun AppUpdateStatusPanel(
    icon: ImageVector,
    tint: Color,
    background: Color,
    title: String,
    detail: String,
    loading: Boolean = false,
    progress: Int? = null,
) {
    Surface(
        color = background,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = tint)
                } else {
                    Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        title,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        color = tint,
                    )
                    Text(
                        detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 5,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            progress?.let {
                LinearProgressIndicator(
                    progress = { it.coerceIn(0, 100) / 100f },
                    modifier = Modifier.fillMaxWidth(),
                    color = tint,
                    trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f),
                )
            }
        }
    }
}

// ------------------------------------------------------------------------------------------------
// 极简通透现代化 UI 组件
// ------------------------------------------------------------------------------------------------

/** 通透顶栏：与首页「工作台」一致的标题节奏，毛玻璃面板 */
@Composable
private fun ModernProfileHeader(
    onOpenQrLogin: () -> Unit,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val glass = rememberGlassPalette(radius = 20.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = "我的",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 22.sp,
                        letterSpacing = (-0.2).sp,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                )
                Text(
                    text = "账号、安全与设备中心",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AppNotificationButton(
                    unreadCount = unreadCount,
                    onClick = onOpenNotifications,
                )
                ModernHeaderIconButton(
                    icon = Icons.Outlined.Settings,
                    contentDescription = "应用设置",
                    onClick = onOpenSettings,
                )
                ModernHeaderIconButton(
                    icon = Icons.Outlined.CenterFocusWeak,
                    contentDescription = "扫码登录",
                    onClick = onOpenQrLogin,
                )
            }
        }
    }
}
/** 分组标题：与首页「工作台」一致的节奏 */
@Composable
private fun ProfileSectionTitle(
    title: String,
    subtitle: String,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                ),
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontSize = 11.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        trailing?.invoke()
    }
}

/** 个人资料 Card */
@Composable
private fun ModernProfileCard(
    username: String,
    role: String,
    versionStr: String,
) {
    val glass = rememberGlassPalette(radius = 20.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
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
                            color = Color(0xFFEFF6FF).copy(alpha = 0.6f),
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
        color = bgColor.copy(alpha = 0.55f),
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
private fun NotificationPreferencesDialog(
    current: AlertPreferences,
    onDismiss: () -> Unit,
    onSave: (AlertPreferences) -> Unit,
) {
    var quietEnabled by remember { mutableStateOf(current.quietHoursEnabled) }
    var quietStart by remember { mutableStateOf(current.quietStartHour) }
    var quietEnd by remember { mutableStateOf(current.quietEndHour) }
    var severity by remember { mutableStateOf(current.severityFilter) }
    var incidentAlerts by remember { mutableStateOf(current.incidentAlerts) }
    var iotAlerts by remember { mutableStateOf(current.iotAlerts) }
    var campusAlerts by remember { mutableStateOf(current.campusAlerts) }
    var backupAlerts by remember { mutableStateOf(current.backupAlerts) }
    var dailyBriefEnabled by remember { mutableStateOf(current.dailyBriefEnabled) }
    var morningHour by remember { mutableStateOf(current.morningBriefHour.toString()) }
    var eveningHour by remember { mutableStateOf(current.eveningBriefHour.toString()) }
    var classFocusEnabled by remember { mutableStateOf(current.classFocusEnabled) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .padding(16.dp),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 6.dp,
        ) {
            Column(modifier = Modifier.padding(22.dp).verticalScroll(rememberScrollState())) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconTile(Icons.Outlined.NotificationsActive, Color(0xFFEA580C), Color(0xFFFFF7ED), modifier = Modifier.size(44.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("告警与通知偏好", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                        Text("配置夜间免打扰与业务订阅开关", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Spacer(Modifier.height(16.dp))

                // 1. 夜间免打扰
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Outlined.Bedtime, contentDescription = null, tint = Color(0xFF7C3AED), modifier = Modifier.size(20.dp))
                                Column {
                                    Text("夜间免打扰 (DND)", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                                    Text("时段内静音普通告警 (保留 P0 致命提醒)", style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            AppSwitch(
                                checked = quietEnabled,
                                onCheckedChange = { quietEnabled = it },
                                tint = Color(0xFF7C3AED),
                            )
                        }

                        if (quietEnabled) {
                            Spacer(Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("免打扰时段", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                                Text(
                                    "${quietStart}:00 至 次日 ${quietEnd}:00",
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                    color = Color(0xFF7C3AED),
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PreferenceToggleRow("每日简报", dailyBriefEnabled) { dailyBriefEnabled = it }
                        Text(
                            "每天汇总下一节课、待办和需要关注的事项",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (dailyBriefEnabled) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = morningHour,
                                    onValueChange = { morningHour = it.filter(Char::isDigit).take(2) },
                                    label = { Text("早报小时") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    value = eveningHour,
                                    onValueChange = { eveningHour = it.filter(Char::isDigit).take(2) },
                                    label = { Text("晚报小时") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        PreferenceToggleRow("上课专注模式", classFocusEnabled) { classFocusEnabled = it }
                        Text(
                            "上课期间静音普通提醒，紧急故障仍会通知",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))

                // 2. 严重等级过滤
                Text("告警接收级别", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SeverityChip("all", "全部告警", severity == "all") { severity = "all" }
                    SeverityChip("critical_only", "仅紧急故障 (P0/P1)", severity == "critical_only") { severity = "critical_only" }
                    SeverityChip("none", "全部静音", severity == "none") { severity = "none" }
                }

                Spacer(Modifier.height(14.dp))

                // 3. 细分业务订阅开关
                Text("业务订阅渠道", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PreferenceToggleRow("系统运维与服务故障", incidentAlerts) { incidentAlerts = it }
                    PreferenceToggleRow("IoT 智能硬件与节点状态", iotAlerts) { iotAlerts = it }
                    PreferenceToggleRow("智慧校园课程与日程提醒", campusAlerts) { campusAlerts = it }
                    PreferenceToggleRow("自动备份与环境体检报告", backupAlerts) { backupAlerts = it }
                }

                Spacer(Modifier.height(20.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                        Text("取消")
                    }
                    Button(
                        onClick = {
                            onSave(
                                current.copy(
                                    quietHoursEnabled = quietEnabled,
                                    quietStartHour = quietStart,
                                    quietEndHour = quietEnd,
                                    severityFilter = severity,
                                    incidentAlerts = incidentAlerts,
                                    iotAlerts = iotAlerts,
                                    campusAlerts = campusAlerts,
                                    backupAlerts = backupAlerts,
                                    dailyBriefEnabled = dailyBriefEnabled,
                                    morningBriefHour = morningHour.toIntOrNull()?.coerceIn(0, 23) ?: 7,
                                    eveningBriefHour = eveningHour.toIntOrNull()?.coerceIn(0, 23) ?: 21,
                                    classFocusEnabled = classFocusEnabled,
                                )
                            )
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("保存配置")
                    }
                }
            }
        }
    }
}

@Composable
private fun SeverityChip(id: String, label: String, selected: Boolean, onSelect: () -> Unit) {
    Surface(
        onClick = onSelect,
        shape = RoundedCornerShape(10.dp),
        color = if (selected) Color(0xFFEFF6FF) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        border = BorderStroke(1.dp, if (selected) Color(0xFF2563EB) else Color.Transparent),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal),
            color = if (selected) Color(0xFF1D4ED8) else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun PreferenceToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.sp))
        AppSwitch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
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
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = iconTint,
                )
            } else {
                IconTile(icon, iconTint, iconBackground, modifier = Modifier.size(36.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.5.sp,
                ),
                color = titleColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 1.dp),
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
                modifier = Modifier.size(16.dp),
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
                    sessionTitle(session),
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

private fun severityLabel(filter: String): String = when (filter) {
    "critical_only" -> "仅紧急故障 (P0/P1)"
    "none" -> "全部静音"
    else -> "接收全部告警"
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

private fun sessionTitle(session: SecuritySession): String =
    session.deviceName.trim().ifBlank { deviceLabel(session.userAgent) }
