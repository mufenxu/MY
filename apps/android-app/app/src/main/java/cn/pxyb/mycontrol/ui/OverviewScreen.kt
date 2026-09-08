package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.ServiceInfo
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Mint
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale
import kotlinx.coroutines.launch
import java.util.Date
import java.time.LocalDate

@Composable
fun OverviewScreen(
    state: OverviewUiState,
    contentPadding: PaddingValues,
    onSelectTab: (MainTab) -> Unit,
    onRefresh: () -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenQrLogin: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenReservation: () -> Unit = {},
    onOpenFreeClassrooms: () -> Unit = {},
    onOpenSeatReservation: () -> Unit = {},
    onOpenWaterValve: () -> Unit = {},
    onOpenAccountManagement: () -> Unit = {},
    onUpdateQuickActions: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
    requestWebLoginUrl: suspend (String) -> String,
    requestExternalApplicationLaunch: suspend (String) -> ExternalApplicationLaunch,
) {
    var customizingQuickActions by remember { mutableStateOf(false) }
    var openingServiceId by remember { mutableStateOf<String?>(null) }
    var serviceOpenError by remember { mutableStateOf<String?>(null) }
    var openingExternalApplicationId by remember { mutableStateOf<String?>(null) }
    var externalApplicationOpenError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val overview = state.overview
    val activeIncidents = remember(state.incidents) { state.incidents.filter { it.status != "resolved" } }
    val visibleIncidents = remember(activeIncidents) { activeIncidents.take(3) }
    // 通知服务(notify)与 CT8 自动化(ct8-automation)没有管理后台入口，首页“服务监控”不展示这两项
    val homeServices = remember(overview?.services) {
        overview?.services.orEmpty().filterNot { it.id == "notify" || it.id == "ct8-automation" }
    }
    val sortedServices = remember(homeServices) {
        homeServices.sortedWith(compareBy<ServiceInfo> { servicePriority(it.state) }.thenBy { it.name })
    }
    val recentAudits = remember(overview?.audits) { overview?.audits.orEmpty().take(5) }
    val (healthyCount, monitoredCount, averageLatencyMs) = remember(homeServices) {
        val services = homeServices
        val monitored = services.count { it.state != "unmonitored" }
        val healthy = services.count { it.state == "healthy" }
        val average = services.mapNotNull { it.latencyMs }.takeIf { it.isNotEmpty() }?.average()?.toLong()
        Triple(healthy, monitored, average)
    }
    val courseCount = remember(state.timetable?.courses) {
        state.timetable?.courses.orEmpty().asSequence().map(CampusCourse::courseName).distinct().count()
    }
    val currentDate = LocalDate.now()
    val todayCourseTotal = remember(state.timetable, currentDate) { todayCourseCount(state) }
    val listState = rememberLazyListState()
    val isTablet = useTwoPaneLayout()
    val contentWidth = appContentWidth()
    val quickActionWidth = if (isTablet) {
        (contentWidth - AppPageHorizontalPadding * 2 - 16.dp) / 2 - 12.dp
    } else {
        contentWidth
    }
    val density = LocalDensity.current
    val quickActionColumns = remember(quickActionWidth, density.fontScale) {
        quickActionColumnCount(quickActionWidth, density.fontScale)
    }
    val visibleQuickActions = remember(state.homeQuickActionOrder, state.hiddenHomeQuickActions) {
        state.homeQuickActionOrder.filterNot(state.hiddenHomeQuickActions::contains)
    }
    val quickActionRows = remember(visibleQuickActions, quickActionColumns) {
        visibleQuickActions.chunked(quickActionColumns)
    }

    fun openServiceAdmin(service: ServiceInfo) {
        val adminUrl = service.adminUrl?.takeIf { it.isNotBlank() } ?: return
        if (openingServiceId != null) return
        openingServiceId = service.id
        serviceOpenError = null
        scope.launch {
            runCatching { requestWebLoginUrl(adminUrl) }
                .onSuccess { loginUrl ->
                    openingServiceId = null
                    openPlatformWebLink(context, loginUrl, service.name)
                }
                .onFailure { error ->
                    openingServiceId = null
                    serviceOpenError = error.message?.takeIf { it.isNotBlank() }
                        ?: "自动登录链接生成失败，请稍后重试。"
                }
        }
    }

    fun openExternalApplication(application: ExternalApplication) {
        if (!application.canAccess || openingExternalApplicationId != null) return
        // 直接打开类型不需要平台统一认证：跳过登录票据生成，仅打开网址本身。
        if (application.kind == "direct") {
            openingExternalApplicationId = application.id
            externalApplicationOpenError = null
            val targetUrl = application.launchUrl.ifBlank { null }
            if (targetUrl == null) {
                openingExternalApplicationId = null
                externalApplicationOpenError = "该外部应用未配置访问网址。"
            } else {
                try {
                    if (application.openMode == "browser") {
                        openBrowserLink(context, targetUrl)
                    } else {
                        openPlatformWebLink(
                            context = context,
                            url = targetUrl,
                            title = application.name,
                            trustedDownloadUrl = targetUrl,
                        )
                    }
                } catch (error: Exception) {
                    externalApplicationOpenError = error.message?.takeIf { it.isNotBlank() }
                        ?: "打开外部应用失败，请稍后重试。"
                } finally {
                    openingExternalApplicationId = null
                }
            }
            return
        }
        openingExternalApplicationId = application.id
        externalApplicationOpenError = null
        scope.launch {
            runCatching {
                val launch = requestExternalApplicationLaunch(application.id)
                if (launch.autoLogin != null) {
                    openPlatformWebLink(
                        context = context,
                        url = application.launchUrl.ifBlank { launch.loginUrl },
                        title = application.name,
                        trustedDownloadUrl = application.launchUrl,
                        autoLogin = launch.autoLogin,
                    )
                } else {
                    when (launch.openMode) {
                        "browser" -> openBrowserLink(context, launch.loginUrl)
                        else -> openPlatformWebLink(
                            context = context,
                            url = launch.loginUrl,
                            title = application.name,
                            trustedDownloadUrl = application.launchUrl,
                        )
                    }
                }
            }
                .onSuccess {
                    openingExternalApplicationId = null
                }
                .onFailure { error ->
                    openingExternalApplicationId = null
                    externalApplicationOpenError = error.message?.takeIf { it.isNotBlank() }
                        ?: "外部应用登录地址生成失败，请稍后重试。"
            }
        }
    }
    val stableOpenServiceAdmin: (ServiceInfo) -> Unit = remember { { service -> openServiceAdmin(service) } }
    val stableOpenExternalApplication: (ExternalApplication) -> Unit = remember {
        { application -> openExternalApplication(application) }
    }
    val openTodayWorkspace = remember { { onOpenWorkspace(WorkspaceDestination.Today) } }
    val openNotificationsWorkspace = remember { { onOpenWorkspace(WorkspaceDestination.Notifications) } }
    val startCustomizingQuickActions = remember { { customizingQuickActions = true } }
    val dark = isAppInDarkTheme()
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = {
            listState.firstVisibleItemIndex == 0 &&
                listState.firstVisibleItemScrollOffset == 0
        },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .auroraBackdrop(dark)
                .padding(
                    start = AppPageHorizontalPadding,
                    end = AppPageHorizontalPadding,
                    top = contentPadding.calculateTopPadding() + 4.dp,
                ),
            contentPadding = PaddingValues(bottom = contentPadding.calculateBottomPadding() + 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 1. 通透清爽顶栏
            item(key = "overview-header", contentType = "header") {
                ModernOverviewHeader(
                    onOpenQrLogin = onOpenQrLogin,
                    onOpenSearch = onOpenSearch,
                    unreadCount = state.unreadAlerts,
                    onOpenNotifications = onOpenNotifications,
                )
            }

            state.sectionError?.let { message ->
                item(key = "overview-error", contentType = "banner") {
                    FeedbackBanner("部分数据暂不可用：$message", error = true)
                }
            }
            if (state.offlineMode) {
                item(key = "offline-notice", contentType = "banner") {
                    OfflineSnapshotNotice(state.cachedAtMillis)
                }
            }
            state.assistantSnapshot?.let { assistant ->
                item(key = "assistant-next-action", contentType = "assistant") {
                    AppPanel(
                        onClick = {
                            when (assistant.nextAction.destination) {
                                cn.pxyb.mycontrol.assistant.AssistantDestination.Today -> onOpenWorkspace(WorkspaceDestination.Today)
                                cn.pxyb.mycontrol.assistant.AssistantDestination.Notifications -> onOpenWorkspace(WorkspaceDestination.Notifications)
                                cn.pxyb.mycontrol.assistant.AssistantDestination.Operations -> onOpenOperations()
                                cn.pxyb.mycontrol.assistant.AssistantDestination.Profile -> onSelectTab(MainTab.Profile)
                            }
                        },
                    ) {
                        Row(
                            modifier = Modifier.padding(13.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            IconTile(Icons.Outlined.AutoAwesome, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(36.dp))
                            Column(Modifier.weight(1f)) {
                                Text("下一步", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp)
                                Text(assistant.nextAction.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(assistant.nextAction.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
            if (overview == null) {
                item(key = "overview-loading", contentType = "loading") {
                    OverviewLoadingSkeleton(refreshing = state.refreshing)
                }
            } else {
                if (isTablet) {
                    // 平板 / 展开大屏：自适应 2 列 Bento Grid 仪表盘
                    item(key = "tablet-overview-bento", contentType = "tablet-bento") {
                    val incidentCount = activeIncidents.size
                    val stable = incidentCount == 0 && monitoredCount > 0 && healthyCount == monitoredCount
                    val isDark = isAppInDarkTheme()
                    val campus = state.campusOverview
                    val campusInteractionSource = remember { MutableInteractionSource() }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // 左列 (50% 宽)：核心状态 Hero + 校园日常 + 快捷中心 + 待处理事项
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            // 1. 系统状态 Hero Card
                            val topGradientStart = if (stable) {
                                if (isDark) Color(0xFF064E3B).copy(alpha = 0.30f) else Color(0xFFECFDF5).copy(alpha = 0.85f)
                            } else {
                                if (isDark) Color(0xFF78350F).copy(alpha = 0.30f) else Color(0xFFFFFBEB).copy(alpha = 0.85f)
                            }
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                shadowElevation = 0.dp,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(
                                            Brush.verticalGradient(
                                                colors = listOf(topGradientStart, Color.Transparent),
                                            ),
                                        )
                                        .padding(14.dp),
                                ) {
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        ) {
                                            Box(
                                                modifier = Modifier.size(42.dp),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                val progress = if (monitoredCount == 0) 0f else healthyCount.toFloat() / monitoredCount.toFloat()
                                                CircularProgressIndicator(
                                                    progress = { progress },
                                                    modifier = Modifier.size(42.dp),
                                                    color = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                                    trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                                                    strokeWidth = 3.8.dp,
                                                    strokeCap = StrokeCap.Round,
                                                )
                                                Icon(
                                                    if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                                                    contentDescription = null,
                                                    tint = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                                    modifier = Modifier.size(20.dp),
                                                )
                                            }
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    if (stable) "一切正常，平台稳定运行"
                                                    else if (incidentCount > 0) "有 $incidentCount 项需关注"
                                                    else "部分服务需关注",
                                                    style = MaterialTheme.typography.titleMedium.copy(
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 16.sp,
                                                    ),
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                )
                                                Text(
                                                    "$healthyCount/$monitoredCount 服务监测中 · ${formatPlatformTime(overview.refreshedAt)}",
                                                    style = MaterialTheme.typography.bodySmall.copy(
                                                        fontSize = 11.5.sp,
                                                    ),
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.padding(top = 1.dp),
                                                )
                                            }
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            ModernOverviewMetric(
                                                label = "健康服务",
                                                value = "$healthyCount/$monitoredCount",
                                                accent = Color(0xFF059669),
                                                bgColor = if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5),
                                                modifier = Modifier.weight(1f),
                                            )
                                            ModernOverviewMetric(
                                                label = "平均响应",
                                                value = averageLatencyMs?.let { "$it ms" } ?: "--",
                                                accent = Color(0xFF2563EB),
                                                bgColor = if (isDark) Color(0xFF1E3A8A).copy(alpha = 0.22f) else Color(0xFFEFF6FF),
                                                modifier = Modifier.weight(1f),
                                            )
                                            ModernOverviewMetric(
                                                label = "待处理事项",
                                                value = activeIncidents.size.toString(),
                                                accent = if (activeIncidents.isEmpty()) Color(0xFF059669) else Color(0xFFDC2626),
                                                bgColor = if (activeIncidents.isEmpty()) {
                                                    if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5)
                                                } else {
                                                    if (isDark) Color(0xFF7F1D1D).copy(alpha = 0.22f) else Color(0xFFFEF2F2)
                                                },
                                                modifier = Modifier.weight(1f),
                                            )
                                        }
                                    }
                                }
                            }

                            // 2. 校园智览卡片
                            OverviewSectionTitle("校园工作台", "课表、成绩与校园日常", dotColor = Ocean)
                            Surface(
                                onClick = openTodayWorkspace,
                                interactionSource = campusInteractionSource,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .pressFeedback(campusInteractionSource, pressedScale = 0.985f),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(34.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(
                                                    if (isDark) Ocean.copy(alpha = 0.20f)
                                                    else OceanPale.copy(alpha = 0.65f)
                                                ),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(
                                                Icons.Outlined.CalendarMonth,
                                                contentDescription = null,
                                                tint = Ocean,
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                "校园日常概览",
                                                style = MaterialTheme.typography.titleMedium.copy(
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 15.sp,
                                                ),
                                            )
                                            Text(
                                                state.timetable?.currentCalendarText?.takeIf(String::isNotBlank)
                                                    ?: "课表、成绩和校园生活信息",
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                    fontSize = 11.5.sp,
                                                ),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        Icon(
                                            Icons.Outlined.ChevronRight,
                                            contentDescription = "查看校园智览",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        ModernOverviewMetric(
                                            label = "今日课程",
                                            value = "$todayCourseTotal 节",
                                            accent = Color(0xFF2563EB),
                                            bgColor = if (isDark) Color(0xFF1E3A8A).copy(alpha = 0.22f) else Color(0xFFEFF6FF),
                                            modifier = Modifier.weight(1f),
                                        )
                                        ModernOverviewMetric(
                                            label = "本学期课程",
                                            value = if (courseCount > 0) "$courseCount 门" else "--",
                                            accent = Color(0xFF059669),
                                            bgColor = if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5),
                                            modifier = Modifier.weight(1f),
                                        )
                                        ModernOverviewMetric(
                                            label = "综合绩点",
                                            value = campus?.gpa?.overall ?: "--",
                                            accent = Color(0xFF7C3AED),
                                            bgColor = if (isDark) Color(0xFF581C87).copy(alpha = 0.22f) else Color(0xFFF5F3FF),
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }

                            // 3. 快捷中心
                            OverviewSectionTitle(
                                title = "快捷中心",
                                subtitle = "高频工具与常用入口一键直达",
                                dotColor = Amber,
                                trailing = {
                                    val editInteractionSource = remember { MutableInteractionSource() }
                                    Surface(
                                        onClick = startCustomizingQuickActions,
                                        interactionSource = editInteractionSource,
                                        modifier = Modifier.pressFeedback(editInteractionSource),
                                        shape = RoundedCornerShape(10.dp),
                                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                                        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                                        ) {
                                            Icon(
                                                Icons.Outlined.Edit,
                                                contentDescription = "调整快捷操作",
                                                tint = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.size(12.dp),
                                            )
                                            Text(
                                                "自定义",
                                                style = MaterialTheme.typography.labelMedium.copy(
                                                    fontWeight = FontWeight.SemiBold,
                                                    fontSize = 11.5.sp,
                                                    color = MaterialTheme.colorScheme.primary,
                                                ),
                                            )
                                        }
                                    }
                                },
                            )
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                color = glassCardColor(),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                                shadowElevation = 0.dp,
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    quickActionRows.forEach { rowActions ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceEvenly,
                                        ) {
                                            rowActions.forEach { action ->
                                                val spec = remember(action) { homeQuickActionSpec(
                                                    action = action,
                                                    onSelectTab = onSelectTab,
                                                    onRunDiagnostics = onRunDiagnostics,
                                                    onTriggerBackup = onTriggerBackup,
                                                    onOpenGoogleAccountDesk = onOpenGoogleAccountDesk,
                                                    onOpenOperations = onOpenOperations,
                                                    onOpenWorkspace = onOpenWorkspace,
                                                    onOpenReservation = onOpenReservation,
                                                    onOpenFreeClassrooms = onOpenFreeClassrooms,
                                                    onOpenSeatReservation = onOpenSeatReservation,
                                                    onOpenWaterValve = onOpenWaterValve,
                                                    onOpenSearch = onOpenSearch,
                                                    onOpenQrLogin = onOpenQrLogin,
                                                    onOpenAccountManagement = onOpenAccountManagement,
                                                ) }
                                                QuickAction(
                                                    icon = spec.icon,
                                                    label = spec.label,
                                                    accent = spec.accent,
                                                    accentPale = spec.accentPale,
                                                    modifier = Modifier.weight(1f),
                                                    onClick = spec.onClick,
                                                )
                                            }
                                            repeat(quickActionColumns - rowActions.size) { Spacer(Modifier.weight(1f)) }
                                        }
                                    }
                                }
                            }

                            // 4. 待处理事项
                            if (activeIncidents.isNotEmpty()) {
                                OverviewSectionTitle("需要关注", "${activeIncidents.size} 条待处理通知", dotColor = Coral)
                                visibleIncidents.forEach { incident ->
                                    val incidentCardShape = RoundedCornerShape(16.dp)
                                    val incidentInteractionSource = remember(incident.id) { MutableInteractionSource() }
                                    Surface(
                                        onClick = openNotificationsWorkspace,
                                        interactionSource = incidentInteractionSource,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .pressFeedback(incidentInteractionSource),
                                        shape = incidentCardShape,
                                        color = if (isDark) Color(0xFF7F1D1D).copy(alpha = 0.20f) else Color(0xFFFEF2F2).copy(alpha = 0.6f),
                                        border = BorderStroke(0.5.dp, if (isDark) Color(0xFF991B1B).copy(alpha = 0.4f) else Color(0xFFFECACA)),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            IconTile(Icons.Outlined.ErrorOutline, Coral, CoralPale, modifier = Modifier.size(34.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    incident.title,
                                                    style = MaterialTheme.typography.titleMedium.copy(
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 14.sp,
                                                    ),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                Text(
                                                    "${incident.source} · ${formatPlatformTime(incident.updatedAt ?: incident.openedAt)}",
                                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                            Icon(
                                                Icons.Outlined.ChevronRight,
                                                contentDescription = "查看通知",
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(18.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // 右列 (50% 宽)：外部应用 + 核心服务健康监控
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (state.externalApplications.isNotEmpty() || state.externalApplicationsLoading) {
                                OverviewSectionTitle("外部应用", "独立项目免密快捷直达", dotColor = Color(0xFF7C3AED))
                                externalApplicationOpenError?.let { message ->
                                    FeedbackBanner(message, error = true)
                                }
                                if (state.externalApplications.isEmpty()) {
                                    ExternalApplicationsLoadingPlaceholder()
                                } else {
                                    OverviewTwoColumnGrid(items = state.externalApplications) { application ->
                                        ExternalApplicationRow(
                                            application = application,
                                            opening = openingExternalApplicationId == application.id,
                                            onOpen = stableOpenExternalApplication,
                                        )
                                    }
                                }
                            }

                            OverviewSectionTitle("服务监控", "核心微服务运行指标与状态", dotColor = Mint)
                            serviceOpenError?.let { message ->
                                FeedbackBanner(message, error = true)
                            }
                            if (sortedServices.isEmpty()) {
                                EmptyBlock("暂无服务监测", "等待平台状态同步")
                            } else {
                                OverviewTwoColumnGrid(items = sortedServices) { service ->
                                    ServiceRow(
                                        service = service,
                                        opening = openingServiceId == service.id,
                                        onOpen = stableOpenServiceAdmin,
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                // 手机 / 紧凑屏幕模式：经典单列流
                item(key = "health-hero", contentType = "hero") {
                    val incidentCount = activeIncidents.size
                    val stable = incidentCount == 0 && monitoredCount > 0 && healthyCount == monitoredCount
                    val isDark = isAppInDarkTheme()
                    val topGradientStart = if (stable) {
                        if (isDark) Color(0xFF064E3B).copy(alpha = 0.30f) else Color(0xFFECFDF5).copy(alpha = 0.85f)
                    } else {
                        if (isDark) Color(0xFF78350F).copy(alpha = 0.30f) else Color(0xFFFFFBEB).copy(alpha = 0.85f)
                    }
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        shadowElevation = 0.dp,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    Brush.verticalGradient(
                                        colors = listOf(topGradientStart, Color.Transparent),
                                    ),
                                )
                                .padding(14.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Box(
                                        modifier = Modifier.size(42.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        val progress = if (monitoredCount == 0) 0f else healthyCount.toFloat() / monitoredCount.toFloat()
                                        CircularProgressIndicator(
                                            progress = { progress },
                                            modifier = Modifier.size(42.dp),
                                            color = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                            trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                                            strokeWidth = 3.8.dp,
                                            strokeCap = StrokeCap.Round,
                                        )
                                        Icon(
                                            if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                                            contentDescription = null,
                                            tint = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            if (stable) "一切正常，平台稳定运行"
                                            else if (incidentCount > 0) "有 $incidentCount 项需关注"
                                            else "部分服务需关注",
                                            style = MaterialTheme.typography.titleMedium.copy(
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                        Text(
                                            "$healthyCount/$monitoredCount 服务监测中 · ${formatPlatformTime(overview.refreshedAt)}",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                fontSize = 11.5.sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(top = 1.dp),
                                        )
                                    }
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    ModernOverviewMetric(
                                        label = "健康服务",
                                        value = "$healthyCount/$monitoredCount",
                                        accent = Color(0xFF059669),
                                        bgColor = if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5),
                                        modifier = Modifier.weight(1f),
                                    )
                                    ModernOverviewMetric(
                                        label = "平均响应",
                                        value = averageLatencyMs?.let { "$it ms" } ?: "--",
                                        accent = Color(0xFF2563EB),
                                        bgColor = if (isDark) Color(0xFF1E3A8A).copy(alpha = 0.22f) else Color(0xFFEFF6FF),
                                        modifier = Modifier.weight(1f),
                                    )
                                    ModernOverviewMetric(
                                        label = "待处理事项",
                                        value = activeIncidents.size.toString(),
                                        accent = if (activeIncidents.isEmpty()) Color(0xFF059669) else Color(0xFFDC2626),
                                        bgColor = if (activeIncidents.isEmpty()) {
                                            if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5)
                                        } else {
                                            if (isDark) Color(0xFF7F1D1D).copy(alpha = 0.22f) else Color(0xFFFEF2F2)
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    }
                }

                item(key = "campus-title", contentType = "section") {
                    OverviewSectionTitle("校园工作台", "课表、成绩与校园日常", dotColor = Ocean)
                }
                item(key = "campus-card", contentType = "card") {
                    val campus = state.campusOverview
                    val isDark = isAppInDarkTheme()
                    val campusInteractionSource = remember { MutableInteractionSource() }
                    Surface(
                        onClick = openTodayWorkspace,
                        interactionSource = campusInteractionSource,
                        modifier = Modifier
                            .fillMaxWidth()
                            .pressFeedback(campusInteractionSource, pressedScale = 0.985f),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            if (isDark) Ocean.copy(alpha = 0.20f)
                                            else OceanPale.copy(alpha = 0.65f)
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        Icons.Outlined.CalendarMonth,
                                        contentDescription = null,
                                        tint = Ocean,
                                        modifier = Modifier.size(18.dp),
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        "校园日常概览",
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                        ),
                                    )
                                    Text(
                                        state.timetable?.currentCalendarText?.takeIf(String::isNotBlank)
                                            ?: "课表、成绩和校园生活信息",
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            fontSize = 11.5.sp,
                                        ),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Icon(
                                    Icons.Outlined.ChevronRight,
                                    contentDescription = "查看校园智览",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                    modifier = Modifier.size(18.dp),
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                ModernOverviewMetric(
                                    label = "今日课程",
                                    value = "$todayCourseTotal 节",
                                    accent = Color(0xFF2563EB),
                                    bgColor = if (isDark) Color(0xFF1E3A8A).copy(alpha = 0.22f) else Color(0xFFEFF6FF),
                                    modifier = Modifier.weight(1f),
                                )
                                ModernOverviewMetric(
                                    label = "本学期课程",
                                    value = if (courseCount > 0) "$courseCount 门" else "--",
                                    accent = Color(0xFF059669),
                                    bgColor = if (isDark) Color(0xFF064E3B).copy(alpha = 0.22f) else Color(0xFFECFDF5),
                                    modifier = Modifier.weight(1f),
                                )
                                ModernOverviewMetric(
                                    label = "综合绩点",
                                    value = campus?.gpa?.overall ?: "--",
                                    accent = Color(0xFF7C3AED),
                                    bgColor = if (isDark) Color(0xFF581C87).copy(alpha = 0.22f) else Color(0xFFF5F3FF),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }

                item(key = "quick-actions-title", contentType = "section") {
                    OverviewSectionTitle(
                        title = "快捷中心",
                        subtitle = "高频工具与常用入口一键直达",
                        dotColor = Amber,
                        trailing = {
                            val editInteractionSource = remember { MutableInteractionSource() }
                            Surface(
                                onClick = startCustomizingQuickActions,
                                interactionSource = editInteractionSource,
                                modifier = Modifier.pressFeedback(editInteractionSource),
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    Icon(
                                        Icons.Outlined.Edit,
                                        contentDescription = "调整快捷操作",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(12.dp),
                                    )
                                    Text(
                                        "自定义",
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 11.5.sp,
                                            color = MaterialTheme.colorScheme.primary,
                                        ),
                                    )
                                }
                            }
                        },
                    )
                }

                item(key = "quick-actions-card", contentType = "quick-actions-grid") {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = glassCardColor(),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                        shadowElevation = 0.dp,
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            quickActionRows.forEach { rowActions ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceEvenly,
                                ) {
                                    rowActions.forEach { action ->
                                        val spec = remember(action) { homeQuickActionSpec(
                                            action = action,
                                            onSelectTab = onSelectTab,
                                            onRunDiagnostics = onRunDiagnostics,
                                            onTriggerBackup = onTriggerBackup,
                                            onOpenGoogleAccountDesk = onOpenGoogleAccountDesk,
                                            onOpenOperations = onOpenOperations,
                                            onOpenWorkspace = onOpenWorkspace,
                                            onOpenReservation = onOpenReservation,
                                            onOpenFreeClassrooms = onOpenFreeClassrooms,
                                            onOpenSeatReservation = onOpenSeatReservation,
                                            onOpenWaterValve = onOpenWaterValve,
                                            onOpenSearch = onOpenSearch,
                                            onOpenQrLogin = onOpenQrLogin,
                                            onOpenAccountManagement = onOpenAccountManagement,
                                        ) }
                                        QuickAction(
                                            icon = spec.icon,
                                            label = spec.label,
                                            accent = spec.accent,
                                            accentPale = spec.accentPale,
                                            modifier = Modifier.weight(1f),
                                            onClick = spec.onClick,
                                        )
                                    }
                                    repeat(quickActionColumns - rowActions.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                }

                if (activeIncidents.isNotEmpty()) {
                    item(key = "incident-title", contentType = "section") {
                        OverviewSectionTitle("需要关注", "${activeIncidents.size} 条待处理通知", dotColor = Coral)
                    }
                    items(
                        items = visibleIncidents,
                        key = { "incident-${it.id}" },
                        contentType = { "incident" },
                    ) { incident ->
                        val incidentCardShape = RoundedCornerShape(16.dp)
                        val incidentInteractionSource = remember(incident.id) { MutableInteractionSource() }
                        val isDark = isAppInDarkTheme()
                        Surface(
                            onClick = openNotificationsWorkspace,
                            interactionSource = incidentInteractionSource,
                            modifier = Modifier
                                .fillMaxWidth()
                                .pressFeedback(incidentInteractionSource),
                            shape = incidentCardShape,
                            color = if (isDark) Color(0xFF7F1D1D).copy(alpha = 0.20f) else Color(0xFFFEF2F2).copy(alpha = 0.6f),
                            border = BorderStroke(0.5.dp, if (isDark) Color(0xFF991B1B).copy(alpha = 0.4f) else Color(0xFFFECACA)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                IconTile(Icons.Outlined.ErrorOutline, Coral, CoralPale, modifier = Modifier.size(34.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        incident.title,
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                        ),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        "${incident.source} · ${formatPlatformTime(incident.updatedAt ?: incident.openedAt)}",
                                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Icon(
                                    Icons.Outlined.ChevronRight,
                                    contentDescription = "查看通知",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }

                if (state.externalApplications.isNotEmpty() || state.externalApplicationsLoading) {
                    item(key = "external-apps-title", contentType = "section") {
                        OverviewSectionTitle("外部应用", "独立项目免密快捷直达", dotColor = Color(0xFF7C3AED))
                    }
                    externalApplicationOpenError?.let { message ->
                        item(key = "external-apps-error", contentType = "banner") {
                            FeedbackBanner(message, error = true)
                        }
                    }
                    if (state.externalApplications.isEmpty()) {
                        item(key = "external-apps-loading", contentType = "loading") {
                            ExternalApplicationsLoadingPlaceholder()
                        }
                    } else {
                        item(key = "external-apps-grid", contentType = "grid") {
                            OverviewTwoColumnGrid(items = state.externalApplications) { application ->
                                ExternalApplicationRow(
                                    application = application,
                                    opening = openingExternalApplicationId == application.id,
                                    onOpen = stableOpenExternalApplication,
                                )
                            }
                        }
                    }
                }

                item(key = "services-title", contentType = "section") {
                    OverviewSectionTitle("服务监控", "核心微服务运行指标与状态", dotColor = Mint)
                }
                serviceOpenError?.let { message ->
                    item(key = "services-error", contentType = "banner") {
                        FeedbackBanner(message, error = true)
                    }
                }
                if (sortedServices.isEmpty()) {
                    item(key = "services-empty", contentType = "empty") {
                        EmptyBlock("暂无服务监测", "等待平台状态同步")
                    }
                } else {
                    item(key = "services-grid", contentType = "grid") {
                        OverviewTwoColumnGrid(items = sortedServices) { service ->
                            ServiceRow(
                                service = service,
                                opening = openingServiceId == service.id,
                                onOpen = stableOpenServiceAdmin,
                            )
                        }
                    }
                }

                item(key = "overview-bottom-spacer", contentType = "spacer") {
                    Spacer(Modifier.height(8.dp))
                }
            }
            }
        }
    }

    if (customizingQuickActions) {
        QuickActionsDialog(
            order = state.homeQuickActionOrder,
            hidden = state.hiddenHomeQuickActions,
            onDismiss = { customizingQuickActions = false },
            onSave = { order, hidden ->
                onUpdateQuickActions(order, hidden)
                customizingQuickActions = false
            },
        )
    }
}

// ------------------------------------------------------------------------------------------------
// 极简通透 Overview 组件
// ------------------------------------------------------------------------------------------------

/** 顶部玻璃 Header：与「我的」页一致的毛玻璃顶栏 */
@Composable
private fun ModernOverviewHeader(
    onOpenQrLogin: () -> Unit,
    onOpenSearch: () -> Unit,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
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
                    text = "工作台",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 22.sp,
                        letterSpacing = (-0.2).sp,
                        color = MaterialTheme.colorScheme.onBackground,
                    ),
                )
                Text(
                    text = "系统与校园日常综合控制台",
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
                    icon = Icons.Outlined.Search,
                    contentDescription = "全局搜索",
                    onClick = onOpenSearch,
                    size = 38.dp,
                    iconSize = 19.dp,
                    shape = RoundedCornerShape(12.dp),
                )

                ModernHeaderIconButton(
                    icon = Icons.Outlined.CenterFocusWeak,
                    contentDescription = "扫码登录",
                    onClick = onOpenQrLogin,
                    size = 38.dp,
                    iconSize = 19.dp,
                    shape = RoundedCornerShape(12.dp),
                )
            }
        }
    }
}
/** 分组标题：灵动微岛毛玻璃浮标 (Dynamic Floating Island Pill) */
@Composable
private fun OverviewSectionTitle(
    title: String,
    subtitle: String,
    dotColor: Color = MaterialTheme.colorScheme.primary,
    tag: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    AppSectionHeader(
        title = title,
        subtitle = subtitle,
        accent = dotColor,
        tag = tag,
        trailing = trailing,
    )
}

@Composable
private fun <T> OverviewTwoColumnGrid(
    items: List<T>,
    itemContent: @Composable (T) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items.chunked(2).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                rowItems.forEach { item ->
                    Box(modifier = Modifier.weight(1f)) {
                        itemContent(item)
                    }
                }
                if (rowItems.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun OverviewServiceCardShell(
    title: String,
    icon: ImageVector,
    accent: Color,
    accentPale: Color,
    enabled: Boolean,
    opening: Boolean,
    onClick: (() -> Unit)?,
    content: @Composable ColumnScope.() -> Unit,
) {
    val isDark = isAppInDarkTheme()
    val iconBackground = if (isDark) {
        accent.copy(alpha = 0.18f)
    } else {
        accentPale.copy(alpha = 0.78f)
    }

    AppPanel(
        onClick = if (enabled) onClick else null,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .alpha(if (enabled) 1f else 0.62f),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(iconBackground),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(18.dp),
                    )
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.5.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    content()
                }

                if (opening) {
                    ServiceJumpIndicator()
                } else if (enabled) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
            }
        }
    }
}

/** 极简 Bento 指标组件 */
@Composable
private fun ModernOverviewMetric(
    label: String,
    value: String,
    accent: Color,
    bgColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = bgColor.copy(alpha = 0.55f),
        border = BorderStroke(0.5.dp, accent.copy(alpha = 0.25f)),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.5.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                value,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color = accent,
                    fontSize = 14.5.sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private var scanViewfinder: ImageVector? = null

private val ScanViewfinder: ImageVector
    get() {
        scanViewfinder?.let { return it }
        return ImageVector.Builder(
            name = "ScanViewfinder",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(4f, 4f)
                horizontalLineTo(10f)
                verticalLineTo(6f)
                horizontalLineTo(6f)
                verticalLineTo(10f)
                horizontalLineTo(4f)
                close()

                moveTo(14f, 4f)
                horizontalLineTo(20f)
                verticalLineTo(10f)
                horizontalLineTo(18f)
                verticalLineTo(6f)
                horizontalLineTo(14f)
                close()

                moveTo(4f, 14f)
                horizontalLineTo(6f)
                verticalLineTo(18f)
                horizontalLineTo(10f)
                verticalLineTo(20f)
                horizontalLineTo(4f)
                close()

                moveTo(18f, 14f)
                horizontalLineTo(20f)
                verticalLineTo(20f)
                horizontalLineTo(14f)
                verticalLineTo(18f)
                horizontalLineTo(18f)
                close()

                moveTo(6.5f, 11f)
                horizontalLineTo(17.5f)
                verticalLineTo(13f)
                horizontalLineTo(6.5f)
                close()
            }
        }.build().also { scanViewfinder = it }
    }

private data class HomeQuickActionSpec(
    val icon: ImageVector,
    val label: String,
    val accent: Color,
    val accentPale: Color,
    val onClick: () -> Unit,
)

private data class QuickActionVisual(
    val icon: ImageVector,
    val accent: Color,
)

private fun homeQuickActionVisual(action: HomeQuickAction): QuickActionVisual = when (action) {
    HomeQuickAction.Today -> QuickActionVisual(Icons.Outlined.CalendarMonth, Color(0xFF2563EB))
    HomeQuickAction.Notifications -> QuickActionVisual(Icons.Outlined.Notifications, Color(0xFFE11D48))
    HomeQuickAction.Scenes -> QuickActionVisual(Icons.Outlined.Tune, Color(0xFF7C3AED))
    HomeQuickAction.Reservation -> QuickActionVisual(Icons.Outlined.MeetingRoom, Color(0xFF2563EB))
    HomeQuickAction.FreeClassrooms -> QuickActionVisual(Icons.Outlined.School, Color(0xFF0284C7))
    HomeQuickAction.SeatReservation -> QuickActionVisual(Icons.Outlined.Chair, Color(0xFF16A34A))
    HomeQuickAction.WaterValve -> QuickActionVisual(Icons.Outlined.WaterDrop, Color(0xFF0284C7))
    HomeQuickAction.Devices -> QuickActionVisual(Icons.Outlined.Hub, Color(0xFF0284C7))
    HomeQuickAction.Diagnostics -> QuickActionVisual(Icons.Outlined.Speed, Color(0xFFD97706))
    HomeQuickAction.Backup -> QuickActionVisual(Icons.Outlined.Backup, Color(0xFF0D9488))
    HomeQuickAction.GoogleAccounts -> QuickActionVisual(Icons.Outlined.Email, Color(0xFF4F46E5))
    HomeQuickAction.Operations -> QuickActionVisual(Icons.Outlined.Settings, Color(0xFF64748B))
    HomeQuickAction.Search -> QuickActionVisual(Icons.Outlined.Search, Color(0xFFEA580C))
    HomeQuickAction.QrScanner -> QuickActionVisual(Icons.Outlined.CenterFocusWeak, Color(0xFF0EA5E9))
    HomeQuickAction.Account -> QuickActionVisual(Icons.Outlined.Security, Color(0xFF059669))
}
private fun homeQuickActionSpec(
    action: HomeQuickAction,
    onSelectTab: (MainTab) -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenReservation: () -> Unit,
    onOpenFreeClassrooms: () -> Unit,
    onOpenSeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenQrLogin: () -> Unit,
    onOpenAccountManagement: () -> Unit,
): HomeQuickActionSpec = when (action) {
    HomeQuickAction.Today -> HomeQuickActionSpec(
        icon = Icons.Outlined.CalendarMonth,
        label = "今日工作台",
        accent = Color(0xFF2563EB),
        accentPale = Color(0xFFEFF6FF),
    ) { onOpenWorkspace(WorkspaceDestination.Today) }

    HomeQuickAction.Notifications -> HomeQuickActionSpec(
        icon = Icons.Outlined.Notifications,
        label = "通知中心",
        accent = Color(0xFFE11D48),
        accentPale = Color(0xFFFFF1F2),
    ) { onOpenWorkspace(WorkspaceDestination.Notifications) }

    HomeQuickAction.Scenes -> HomeQuickActionSpec(
        icon = Icons.Outlined.Tune,
        label = "智能场景",
        accent = Color(0xFF7C3AED),
        accentPale = Color(0xFFF5F3FF),
    ) { onOpenWorkspace(WorkspaceDestination.Scenes) }

    HomeQuickAction.Reservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.MeetingRoom,
        label = "研讨间预约",
        accent = Color(0xFF2563EB),
        accentPale = Color(0xFFEFF6FF),
        onClick = onOpenReservation,
    )

    HomeQuickAction.FreeClassrooms -> HomeQuickActionSpec(
        icon = Icons.Outlined.School,
        label = "空闲教室",
        accent = Color(0xFF0284C7),
        accentPale = Color(0xFFF0F9FF),
        onClick = onOpenFreeClassrooms,
    )

    HomeQuickAction.SeatReservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.Chair,
        label = "座位预约",
        accent = Color(0xFF16A34A),
        accentPale = Color(0xFFF0FDF4),
        onClick = onOpenSeatReservation,
    )

    HomeQuickAction.WaterValve -> HomeQuickActionSpec(
        icon = Icons.Outlined.WaterDrop,
        label = "饮水机",
        accent = Color(0xFF0284C7),
        accentPale = Color(0xFFF0F9FF),
        onClick = onOpenWaterValve,
    )

    HomeQuickAction.Devices -> HomeQuickActionSpec(
        icon = Icons.Outlined.Hub,
        label = "设备控制",
        accent = Color(0xFF0284C7),
        accentPale = Color(0xFFF0F9FF),
    ) { onSelectTab(MainTab.Tools) }

    HomeQuickAction.Diagnostics -> HomeQuickActionSpec(
        icon = Icons.Outlined.Speed,
        label = "一键巡检",
        accent = Color(0xFFD97706),
        accentPale = Color(0xFFFFFBEB),
        onClick = onRunDiagnostics,
    )

    HomeQuickAction.Backup -> HomeQuickActionSpec(
        icon = Icons.Outlined.Backup,
        label = "数据备份",
        accent = Color(0xFF0D9488),
        accentPale = Color(0xFFF0FDFA),
        onClick = onTriggerBackup,
    )

    HomeQuickAction.GoogleAccounts -> HomeQuickActionSpec(
        icon = Icons.Outlined.Email,
        label = "邮箱台账",
        accent = Color(0xFF4F46E5),
        accentPale = Color(0xFFEEF2FF),
        onClick = onOpenGoogleAccountDesk,
    )

    HomeQuickAction.Operations -> HomeQuickActionSpec(
        icon = Icons.Outlined.Settings,
        label = "系统状态",
        accent = Color(0xFF64748B),
        accentPale = Color(0xFFF8FAFC),
        onClick = onOpenOperations,
    )

    HomeQuickAction.Search -> HomeQuickActionSpec(
        icon = Icons.Outlined.Search,
        label = "全局搜索",
        accent = Color(0xFFEA580C),
        accentPale = Color(0xFFFFF7ED),
        onClick = onOpenSearch,
    )

    HomeQuickAction.QrScanner -> HomeQuickActionSpec(
        icon = Icons.Outlined.CenterFocusWeak,
        label = "扫码登录",
        accent = Color(0xFF0EA5E9),
        accentPale = Color(0xFFF0F9FF),
        onClick = onOpenQrLogin,
    )

    HomeQuickAction.Account -> HomeQuickActionSpec(
        icon = Icons.Outlined.Security,
        label = "安全中心",
        accent = Color(0xFF059669),
        accentPale = Color(0xFFECFDF5),
        onClick = onOpenAccountManagement,
    )
}

@Composable
private fun QuickActionsDialog(
    order: List<HomeQuickAction>,
    hidden: Set<HomeQuickAction>,
    onDismiss: () -> Unit,
    onSave: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
) {
    var localOrder by remember(order) { mutableStateOf(order) }
    var localHidden by remember(hidden) { mutableStateOf(hidden) }
    val visibleCount = localOrder.count { it !in localHidden }
    val dark = isAppInDarkTheme()
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Edit,
        title = "调整快捷操作",
        subtitle = "已显示 $visibleCount 项 · 开关控制显示，箭头调整顺序",
        modifier = Modifier.heightIn(max = 700.dp),
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "保存配置",
                    onClick = { onSave(localOrder, localHidden) },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            localOrder.forEachIndexed { index, action ->
                val isChecked = action !in localHidden
                val visual = homeQuickActionVisual(action)
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = glassCardColor(),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(13.dp))
                                .background(visual.accent.copy(alpha = if (dark) 0.20f else 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = visual.icon,
                                contentDescription = null,
                                tint = visual.accent,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = homeQuickActionLabel(action),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.5.sp,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = if (isChecked) "已显示" else "已隐藏",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = if (isChecked) MaterialTheme.colorScheme.onSurfaceVariant
                                        else MaterialTheme.colorScheme.outline,
                            )
                        }
                        AppSwitch(
                            checked = isChecked,
                            enabled = isChecked || visibleCount > 1,
                            onCheckedChange = { checked ->
                                localHidden = if (checked) localHidden - action else localHidden + action
                            },
                            tint = visual.accent,
                        )
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            QuickActionArrowButton(
                                up = true,
                                enabled = index > 0,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index - 1, item)
                                    }
                                },
                            )
                            QuickActionArrowButton(
                                up = false,
                                enabled = index < localOrder.lastIndex,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index + 1, item)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickActionArrowButton(
    up: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(
                if (enabled) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                else Color.Transparent
            )
            .pressFeedback(interactionSource, pressedScale = 0.88f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (up) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
            contentDescription = if (up) "上移" else "下移",
            tint = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant
                   else MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(16.dp),
        )
    }
}
private fun homeQuickActionLabel(action: HomeQuickAction): String = when (action) {
    HomeQuickAction.Today -> "今日工作台"
    HomeQuickAction.Notifications -> "通知中心"
    HomeQuickAction.Scenes -> "智能场景"
    HomeQuickAction.Reservation -> "研讨间预约"
    HomeQuickAction.FreeClassrooms -> "空闲教室"
    HomeQuickAction.SeatReservation -> "座位预约"
    HomeQuickAction.WaterValve -> "饮水机"
    HomeQuickAction.Devices -> "设备控制"
    HomeQuickAction.Diagnostics -> "系统自检"
    HomeQuickAction.Backup -> "数据备份"
    HomeQuickAction.GoogleAccounts -> "邮箱台账"
    HomeQuickAction.Operations -> "系统状态"
    HomeQuickAction.Search -> "全局搜索"
    HomeQuickAction.QrScanner -> "扫码登录"
    HomeQuickAction.Account -> "安全中心"
}

private val WeekPattern = Regex("第(\\d+)周")

private fun todayCourseCount(state: OverviewUiState): Int {
    val day = LocalDate.now().dayOfWeek.value
    val week = WeekPattern.find(state.timetable?.currentCalendarText.orEmpty())
        ?.groupValues?.getOrNull(1)?.toIntOrNull()
    return state.timetable?.courses.orEmpty().count { course ->
        course.day == day && (week == null || course.weeks.isEmpty() || week in course.weeks)
    }
}

private fun formatCampusAmount(value: String): String = value
    .takeIf { it.startsWith("¥") || it.startsWith("￥") }
    ?: "¥$value"

@Composable
private fun OfflineSnapshotNotice(cachedAtMillis: Long?) {
    val context = LocalContext.current
    val updatedAt = remember(context, cachedAtMillis) {
        cachedAtMillis?.let { android.text.format.DateFormat.getTimeFormat(context).format(Date(it)) }
    }
    FeedbackBanner(
        title = "部分内容使用缓存，请留意更新时间",
        message = updatedAt?.let { "缓存更新时间 $it" } ?: "联网后将自动恢复同步",
        error = false,
        icon = Icons.Outlined.CloudOff,
        modifier = Modifier.fillMaxWidth(),
    )
}

// 首页预加载骨架：overview 数据到达前，按真实区块同构渲染呼吸脉冲占位
@Composable
private fun OverviewLoadingSkeleton(refreshing: Boolean) {
    val transition = rememberInfiniteTransition(label = "overview-loading")
    val pulse by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 720, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "overview-loading-pulse",
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = if (refreshing) "正在同步平台状态" else "等待平台状态",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
        SkeletonHeroCard(pulse)
        SkeletonCampusCard(pulse)
        SkeletonSectionTitle(pulse)
        SkeletonQuickActionsCard(pulse)
        SkeletonSectionTitle(pulse)
        SkeletonListRowsCard(rows = 2, pulse = pulse)
        SkeletonSectionTitle(pulse)
        SkeletonListRowsCard(rows = 3, pulse = pulse)
    }
}

@Composable
private fun SkeletonGlassCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

@Composable
private fun SkeletonBlock(modifier: Modifier, pulse: Float, corner: Dp = 6.dp) {
    Box(
        modifier
            .clip(RoundedCornerShape(corner))
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f * pulse)),
    )
}

@Composable
private fun SkeletonMetric(pulse: Float, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            SkeletonBlock(Modifier.fillMaxWidth(0.62f).height(9.dp), pulse = pulse)
            SkeletonBlock(Modifier.fillMaxWidth(0.45f).height(16.dp), pulse = pulse)
        }
    }
}

@Composable
private fun SkeletonSectionTitle(pulse: Float) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp, vertical = 5.dp)
    ) {
        SkeletonBlock(
            modifier = Modifier.width(168.dp).height(28.dp),
            pulse = pulse,
            corner = 14.dp,
        )
    }
}

@Composable
private fun SkeletonHeroCard(pulse: Float) {
    SkeletonGlassCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SkeletonBlock(Modifier.size(42.dp), pulse = pulse, corner = 21.dp)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                SkeletonBlock(Modifier.fillMaxWidth(0.55f).height(15.dp), pulse = pulse)
                SkeletonBlock(Modifier.fillMaxWidth(0.7f).height(10.dp), pulse = pulse)
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun SkeletonCampusCard(pulse: Float) {
    SkeletonGlassCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SkeletonBlock(Modifier.size(34.dp), pulse = pulse, corner = 10.dp)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                SkeletonBlock(Modifier.fillMaxWidth(0.42f).height(13.dp), pulse = pulse)
                SkeletonBlock(Modifier.fillMaxWidth(0.6f).height(9.dp), pulse = pulse)
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
            SkeletonMetric(pulse = pulse, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun SkeletonQuickActionsCard(pulse: Float) {
    SkeletonGlassCard {
        repeat(2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                repeat(4) {
                    Column(
                        modifier = Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        SkeletonBlock(Modifier.size(46.dp), pulse = pulse, corner = 14.dp)
                        SkeletonBlock(Modifier.width(32.dp).height(8.dp), pulse = pulse)
                    }
                }
            }
        }
    }
}

@Composable
private fun SkeletonListRowsCard(rows: Int, pulse: Float) {
    SkeletonGlassCard {
        repeat(rows) { index ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SkeletonBlock(Modifier.size(36.dp), pulse = pulse, corner = 11.dp)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    SkeletonBlock(
                        Modifier.fillMaxWidth(if (index % 2 == 0) 0.5f else 0.38f).height(12.dp),
                        pulse = pulse,
                    )
                    SkeletonBlock(Modifier.fillMaxWidth(0.62f).height(9.dp), pulse = pulse)
                }
                SkeletonBlock(Modifier.width(42.dp).height(18.dp), pulse = pulse, corner = 9.dp)
            }
        }
    }
}

@Composable
private fun QuickAction(
    icon: ImageVector,
    label: String,
    accent: Color,
    accentPale: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .pressFeedback(interactionSource, pressedScale = 0.90f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(vertical = 4.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        QuickActionGlassTile(
            icon = icon,
            accent = accent,
            accentPale = accentPale,
            modifier = Modifier.size(38.dp),
            iconSize = 20.dp,
            contentDescription = label,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Medium,
                fontSize = 11.5.sp,
                letterSpacing = (-0.1).sp,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class VisualTheme(
    val icon: ImageVector,
    val accent: Color,
    val accentPale: Color,
)

private fun applicationVisualTheme(application: ExternalApplication): VisualTheme {
    val name = application.name.lowercase()
    val id = application.id.lowercase()
    return when {
        "ar" in name || "签到" in name || "sign" in id -> VisualTheme(
            icon = Icons.Outlined.CenterFocusWeak,
            accent = Color(0xFF0EA5E9), // 极光青蓝
            accentPale = Color(0xFFF0F9FF),
        )
        "chat" in name || "api" in name || "ai" in id || "gpt" in name -> VisualTheme(
            icon = Icons.Outlined.AutoAwesome,
            accent = Color(0xFF8B5CF6), // 智感紫罗兰
            accentPale = Color(0xFFF5F3FF),
        )
        "monkey" in name || "code" in name || "调度" in name || "dev" in id -> VisualTheme(
            icon = Icons.Outlined.Terminal,
            accent = Color(0xFF4F46E5), // 极客靛蓝
            accentPale = Color(0xFFEEF2FF),
        )
        else -> VisualTheme(
            icon = Icons.Outlined.Public,
            accent = Color(0xFF059669), // 矩阵绿
            accentPale = Color(0xFFECFDF5),
        )
    }
}

private fun serviceVisualTheme(service: ServiceInfo): VisualTheme {
    val id = service.id.lowercase()
    val name = service.name.lowercase()
    return when {
        "mqtt" in id || "mqtt" in name -> VisualTheme(
            icon = Icons.Outlined.Speed,
            accent = Color(0xFF06B6D4), // 物联青
            accentPale = Color(0xFFECFEFF),
        )
        "campus" in id || "校园" in name -> VisualTheme(
            icon = Icons.Outlined.CalendarMonth,
            accent = Color(0xFF2563EB), // 校园蓝
            accentPale = Color(0xFFEFF6FF),
        )
        "platform" in id || "控制台" in name || "统一" in name -> VisualTheme(
            icon = Icons.Outlined.Security,
            accent = Color(0xFF059669), // 盾牌绿
            accentPale = Color(0xFFECFDF5),
        )
        "exam" in id || "考试" in name -> VisualTheme(
            icon = Icons.Outlined.FactCheck,
            accent = Color(0xFFEA580C), // 能量橙
            accentPale = Color(0xFFFFF7ED),
        )
        "notify" in id || "通知" in name -> VisualTheme(
            icon = Icons.Outlined.Notifications,
            accent = Color(0xFFE11D48), // 活力玫红
            accentPale = Color(0xFFFFF1F2),
        )
        "ct8" in id || "自动化" in name -> VisualTheme(
            icon = Icons.Outlined.CloudSync,
            accent = Color(0xFF64748B), // 钛金灰
            accentPale = Color(0xFFF8FAFC),
        )
        else -> if (service.category == "miniapp") VisualTheme(
            icon = Icons.Outlined.Hub,
            accent = Color(0xFF7C3AED), // 微应用紫
            accentPale = Color(0xFFF5F3FF),
        ) else VisualTheme(
            icon = Icons.Outlined.Hub,
            accent = Color(0xFF3B82F6),
            accentPale = Color(0xFFEFF6FF),
        )
    }
}

@Composable
private fun ServiceRow(
    service: ServiceInfo,
    opening: Boolean,
    onOpen: (ServiceInfo) -> Unit,
) {
    val theme = remember(service.id, service.name) { serviceVisualTheme(service) }
    val hasAdminUrl = !service.adminUrl.isNullOrBlank()

    OverviewServiceCardShell(
        title = service.name,
        icon = theme.icon,
        accent = theme.accent,
        accentPale = theme.accentPale,
        enabled = hasAdminUrl && !opening,
        opening = opening,
        onClick = { onOpen(service) },
    ) {
        val statusText = listOfNotNull(
            service.httpStatus?.let { "HTTP $it" },
            service.latencyMs?.let { "$it ms" },
        ).joinToString(" · ").ifBlank { "等待监测数据" }
        val statusColor = when {
            service.httpStatus == null -> MaterialTheme.colorScheme.onSurfaceVariant
            service.httpStatus in 200..299 -> Color(0xFF059669)
            else -> Color(0xFFDC2626)
        }

        if (service.httpStatus == null) {
            Text(
                text = statusText,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                color = statusColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        } else {
            Surface(
                shape = RoundedCornerShape(5.dp),
                color = statusColor.copy(alpha = 0.12f),
            ) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        color = statusColor,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                )
            }
        }
    }
}

@Composable
private fun ExternalApplicationsLoadingPlaceholder() {
    OverviewTwoColumnGrid(items = List(4) { it }) { index ->
        ExternalApplicationLoadingCard(index = index)
    }
}

@Composable
private fun ExternalApplicationLoadingCard(index: Int) {
    val isDark = isAppInDarkTheme()
    val transition = rememberInfiniteTransition(label = "external-application-loading")
    val pulse by transition.animateFloat(
        initialValue = 0.38f,
        targetValue = 0.88f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900 + index * 110, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "external-application-loading-pulse",
    )
    val skeletonColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f * pulse)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(74.dp)
            .glassShimmer(isDark),
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.38f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(skeletonColor),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(if (index % 2 == 0) 0.72f else 0.58f)
                        .height(11.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(skeletonColor),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(
                        modifier = Modifier
                            .size(width = 30.dp, height = 10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(skeletonColor),
                    )
                    Box(
                        modifier = Modifier
                            .size(width = 46.dp, height = 10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(skeletonColor),
                    )
                }
            }
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(skeletonColor),
            )
        }
    }
}

@Composable
private fun ExternalApplicationRow(
    application: ExternalApplication,
    opening: Boolean,
    onOpen: (ExternalApplication) -> Unit,
) {
    val theme = remember(application.id, application.name) { applicationVisualTheme(application) }

    OverviewServiceCardShell(
        title = application.name,
        icon = theme.icon,
        accent = theme.accent,
        accentPale = theme.accentPale,
        enabled = application.canAccess && !opening,
        opening = opening,
        onClick = { onOpen(application) },
    ) {
        Text(
            text = listOfNotNull(
                application.health.latencyMs?.let { "$it ms" },
                when {
                    !application.canAccess -> "当前账号无权访问"
                    application.kind == "direct" -> "直接打开"
                    else -> "最低权限 ${externalRoleLabel(application.requiredRole)}"
                },
            ).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun externalRoleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    else -> "普通用户"
}

private fun openBrowserLink(context: android.content.Context, url: String) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    } catch (error: Exception) {
        throw IllegalStateException("系统未找到可用浏览器。", error)
    }
}

@Composable
private fun ServiceJumpIndicator() {
    val transition = rememberInfiniteTransition(label = "service-jump")
    val arrowOffset by transition.animateFloat(
        initialValue = -4f,
        targetValue = 4f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 620, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "service-jump-arrow",
    )
    Row(
        modifier = Modifier.width(86.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
    ) {
        Text(
            "正在进入",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
            maxLines = 1,
        )
        Icon(
            Icons.Outlined.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .padding(start = 2.dp)
                .size(18.dp)
                .graphicsLayer { translationX = arrowOffset },
        )
    }
}

private fun servicePriority(state: String): Int = when (state) {
    "offline" -> 0
    "degraded" -> 1
    "healthy" -> 2
    else -> 3
}
