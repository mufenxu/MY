package cn.pxyb.mycontrol.ui.feature.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LockClock
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppNotificationButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.ModernHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.PullToRefresh
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.glassPanel
import cn.pxyb.mycontrol.ui.components.layout.rememberGlassPalette
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.legal.PrivacyPolicyDialog
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import cn.pxyb.mycontrol.update.AppUpdatePhase

@Composable
fun ProfileScreen(
    state: ProfileUiState,
    contentPadding: PaddingValues,
    onOpenQrLogin: () -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onClearCache: () -> Unit,
    onForceFullSync: () -> Unit,
    onOpenAccountManagement: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenAuthenticator: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onCheckUpdates: () -> Unit,
    onDownloadAndInstallUpdate: () -> Unit,
    onInstallDownloadedUpdate: () -> Unit,
    onOpenReleases: (String?) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
    assistantButtonVisible: Boolean,
    onAssistantButtonVisibleChange: (Boolean) -> Unit,
) {
    var confirmLogout by remember { mutableStateOf(false) }
    var showUpdateDialog by remember { mutableStateOf(false) }
    var confirmClearCache by remember { mutableStateOf(false) }
    var showPrivacyPolicy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val user = state.user ?: return
    val security = state.security
    val protected = (security?.totpEnabled == true || user.totpEnabled) && (security?.passkeyCount ?: user.passkeyCount) > 0 && (security?.recoveryCodesRemaining ?: 0) > 0
    val isTablet = useTwoPaneLayout()
    val listState = rememberLazyListState()
    val dark = isAppInDarkTheme()
    val accountSections: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileSectionTitle("账号与安全", "保护当前平台账号与登录设备")
            AppPanel {
                AppActionRow(
                    title = "账号与安全",
                    subtitle = "密码、MFA、Passkey、应用锁与登录会话",
                    icon = Icons.Outlined.Security,
                    onClick = onOpenAccountManagement,
                    trailingContent = { AppStatusBadge(if (security == null) "unknown" else if (protected) "healthy" else "warning", if (security == null) "同步中" else if (protected) "已保护" else "待完善") },
                )
            }
            ProfileSectionTitle("账号工具", "第三方账号与离线验证码")
            AppPanel {
                AppActionRow("Google 邮箱台账", subtitle = "主邮箱、别名与 OpenAI 使用状态", icon = Icons.Outlined.Email, onClick = onOpenGoogleAccountDesk)
                AppDivider()
                AppActionRow("本地验证器", subtitle = "离线生成第三方网站的 TOTP 动态码", icon = Icons.Outlined.LockClock, onClick = onOpenAuthenticator)
            }
        }
    }
    val preferenceSections: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileSectionTitle("通知与偏好", "提醒方式与应用外观")
            AppPanel {
                AppActionRow(
                    title = "通知设置",
                    subtitle = if (state.alertPreferences.quietHoursEnabled) "安静时段已开启 · 订阅与每日简报" else "业务订阅、免打扰与每日简报",
                    icon = Icons.Outlined.NotificationsActive,
                    onClick = onOpenNotificationSettings,
                )
                AppDivider()
                AppActionRow("应用设置", subtitle = "外观、系统权限与数据同步", icon = Icons.Outlined.Settings, onClick = onOpenSettings)
                AppDivider()
                AppSwitchRow("AI 小助手", assistantButtonVisible, onAssistantButtonVisibleChange, subtitle = "显示悬浮助手入口")
            }
            ProfileSectionTitle("通用与维护", "数据同步、缓存与应用更新")
            AppPanel {
                AppActionRow("重新同步数据", subtitle = "刷新当前页面数据并检测网络连接", icon = Icons.Outlined.Sync, enabled = !state.refreshing, onClick = onForceFullSync)
                AppDivider()
                AppActionRow("清理本地缓存", subtitle = "可释放 ${state.cacheStorageInfo.totalFormatted}，保留登录与个人设置", icon = Icons.Outlined.CleaningServices, enabled = state.busyAction != "clear-cache", onClick = { confirmClearCache = true })
                AppDivider()
                AppActionRow("关于与更新", subtitle = "当前版本 v${BuildConfig.VERSION_NAME} · 检查更新", icon = Icons.Outlined.Info, onClick = { showUpdateDialog = true; onCheckUpdates() })
                AppDivider()
                AppActionRow("隐私政策", subtitle = "了解数据的收集、存储与保护方式", icon = Icons.Outlined.PrivacyTip, onClick = { showPrivacyPolicy = true })
            }
        }
    }
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().auroraBackdrop(dark),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "profile-header") {
                ModernProfileHeader(onOpenQrLogin, state.unreadAlerts, onOpenNotifications, onOpenSettings)
            }
            item(key = "profile-account") {
                ModernProfileCard(user.username, user.role, BuildConfig.VERSION_NAME)
            }
            state.sectionError?.let { message ->
                item(key = "profile-error") { AppFeedbackBanner(message, error = true, onRetry = onRefresh) }
            }
            if (isTablet) {
                item(key = "profile-groups") {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) { accountSections() }
                        Column(Modifier.weight(1f)) { preferenceSections() }
                    }
                }
            } else {
                item(key = "profile-account-groups") { accountSections() }
                item(key = "profile-preference-groups") { preferenceSections() }
            }
            item(key = "profile-logout") {
                AppDangerButton(
                    text = "退出当前账号",
                    icon = Icons.AutoMirrored.Outlined.Logout,
                    loading = state.busyAction == "logout",
                    enabled = state.busyAction == null,
                    onClick = { confirmLogout = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

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
                        AppIconTile(Icons.Outlined.SystemUpdate, ColorTokens.Blue.foreground, ColorTokens.Blue.container, modifier = Modifier.size(44.dp))
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
                            tint = ColorTokens.Blue.foreground,
                            background = ColorTokens.Blue.container,
                            title = "正在检查 GitHub Releases",
                            detail = "正在读取最新稳定版信息...",
                            loading = true,
                        )

                        AppUpdatePhase.Current -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.CheckCircle,
                            tint = ColorTokens.Green.foreground,
                            background = ColorTokens.Green.container,
                            title = "当前已是最新稳定版",
                            detail = "本机 v${BuildConfig.VERSION_NAME} · GitHub v${state.appUpdate.info?.versionName ?: BuildConfig.VERSION_NAME}",
                        )

                        AppUpdatePhase.Available -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = ColorTokens.Blue.foreground,
                            background = ColorTokens.Blue.container,
                            title = "发现新版本 v${state.appUpdate.info?.versionName.orEmpty()}",
                            detail = state.appUpdate.info?.notes?.ifBlank { "包含新的功能与稳定性改进" }
                                ?: "包含新的功能与稳定性改进",
                        )

                        AppUpdatePhase.Downloading -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.FileDownload,
                            tint = ColorTokens.Blue.foreground,
                            background = ColorTokens.Blue.container,
                            title = "正在下载并校验安装包",
                            detail = "${state.appUpdate.progress}% · 完成后将打开系统安装器",
                            progress = state.appUpdate.progress,
                        )

                        AppUpdatePhase.ReadyToInstall -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.CheckCircle,
                            tint = ColorTokens.Green.foreground,
                            background = ColorTokens.Green.container,
                            title = "安装包校验通过",
                            detail = "可以继续交给 Android 系统安装器安装。",
                        )

                        AppUpdatePhase.InstallPermissionRequired -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = ColorTokens.Amber.foreground,
                            background = ColorTokens.Amber.container,
                            title = "需要允许此来源安装应用",
                            detail = "在系统设置中开启权限，返回后点击继续安装。",
                        )

                        AppUpdatePhase.Installing -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = ColorTokens.Green.foreground,
                            background = ColorTokens.Green.container,
                            title = "系统安装器已打开",
                            detail = "请按系统提示完成更新安装。",
                        )

                        AppUpdatePhase.Error -> AppUpdateStatusPanel(
                            icon = Icons.Outlined.SystemUpdate,
                            tint = ColorTokens.Red.foreground,
                            background = ColorTokens.Red.container,
                            title = "更新检查或安装未完成",
                            detail = state.appUpdate.error ?: "请稍后重试，或前往 GitHub Releases 手动下载。",
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    when (state.appUpdate.phase) {
                        AppUpdatePhase.Available -> AppButton(
                            text = "下载并安装",
                            icon = Icons.Outlined.FileDownload,
                            onClick = onDownloadAndInstallUpdate,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        AppUpdatePhase.ReadyToInstall,
                        AppUpdatePhase.InstallPermissionRequired,
                        -> AppButton(
                            text = if (state.appUpdate.phase == AppUpdatePhase.InstallPermissionRequired) "继续安装" else "打开系统安装器",
                            icon = Icons.Outlined.SystemUpdate,
                            onClick = onInstallDownloadedUpdate,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        AppUpdatePhase.Error -> {
                            AppButton(
                                text = "重新检查",
                                icon = Icons.Outlined.SystemUpdate,
                                onClick = onCheckUpdates,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            AppSecondaryButton(
                                text = "打开 GitHub Releases",
                                icon = Icons.AutoMirrored.Outlined.OpenInNew,
                                onClick = { onOpenReleases(state.appUpdate.info?.releaseUrl) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        else -> AppSecondaryButton(
                            text = "关闭",
                            onClick = { showUpdateDialog = false },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
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

/** 顶部玻璃 Header：方案 A【灵动智感胶囊款】家族化顶栏 */
@Composable
private fun ModernProfileHeader(
    onOpenQrLogin: () -> Unit,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val isDark = isAppInDarkTheme()
    val glass = rememberGlassPalette(radius = 22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "我的",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 21.sp,
                            letterSpacing = (-0.3).sp,
                            color = MaterialTheme.colorScheme.onBackground,
                        ),
                    )
                    Surface(
                        shape = CircleShape,
                        color = if (isDark) {
                            ColorTokens.PurpleDark.container.copy(alpha = 0.5f)
                        } else {
                            ColorTokens.Purple.container.copy(alpha = 0.85f)
                        },
                        border = BorderStroke(
                            0.6.dp,
                            if (isDark) ColorTokens.PurpleDark.border else ColorTokens.Purple.border,
                        ),
                    ) {
                        Text(
                            text = "个人中心",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isDark) ColorTokens.PurpleDark.foreground else ColorTokens.Purple.foreground,
                            ),
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(ColorTokens.Green.foreground, CircleShape),
                    )
                    Text(
                        text = "账号、工具与个人偏好",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                AppNotificationButton(
                    unreadCount = unreadCount,
                    onClick = onOpenNotifications,
                    shape = CircleShape,
                )
                ModernHeaderIconButton(
                    icon = Icons.Outlined.Settings,
                    contentDescription = "应用设置",
                    onClick = onOpenSettings,
                    size = 36.dp,
                    iconSize = 18.dp,
                    shape = CircleShape,
                )
                ModernHeaderIconButton(
                    icon = Icons.Outlined.CenterFocusWeak,
                    contentDescription = "扫码登录",
                    onClick = onOpenQrLogin,
                    size = 36.dp,
                    iconSize = 18.dp,
                    shape = CircleShape,
                )
            }
        }
    }
}
/** 分组标题：灵动微岛毛玻璃浮标 (Dynamic Floating Island Pill) */
@Composable
private fun ProfileSectionTitle(
    title: String,
    subtitle: String,
    dotColor: Color = MaterialTheme.colorScheme.primary,
    trailing: (@Composable () -> Unit)? = null,
) {
    AppSectionHeader(
        title = title,
        subtitle = subtitle,
        accent = dotColor,
        trailing = trailing,
    )
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
                            color = ColorTokens.Blue.container.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(0.5.dp, ColorTokens.Blue.border),
                        ) {
                            Text(
                                text = roleLabel(role),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp,
                                ),
                                color = ColorTokens.Blue.foreground,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "MY Control · v$versionStr",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                AppStatusBadge("healthy", "已登录")
            }

        }
    }
}

private fun roleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    "viewer" -> "只读账号"
    else -> role
}
