package cn.pxyb.mycontrol.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AuditInfo
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.ServiceInfo
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale
import kotlinx.coroutines.Job
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
    val sortedServices = remember(overview?.services) {
        overview?.services.orEmpty().sortedWith(compareBy<ServiceInfo> { servicePriority(it.state) }.thenBy { it.name })
    }
    val recentAudits = remember(overview?.audits) { overview?.audits.orEmpty().take(5) }
    val (healthyCount, monitoredCount, averageLatencyMs) = remember(overview?.services) {
        val services = overview?.services.orEmpty()
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
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val quickActionColumns = remember(configuration.screenWidthDp, density.fontScale) {
        quickActionColumnCount(configuration.screenWidthDp.dp, density.fontScale)
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
        openingExternalApplicationId = application.id
        externalApplicationOpenError = null
        scope.launch {
            runCatching {
                val launch = requestExternalApplicationLaunch(application.id)
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
                .padding(
                    start = AppPageHorizontalPadding,
                    end = AppPageHorizontalPadding,
                    top = contentPadding.calculateTopPadding() + 4.dp,
                ),
            contentPadding = PaddingValues(bottom = contentPadding.calculateBottomPadding() + 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 1. 通透清爽顶栏
            item(key = "overview-header", contentType = "header") {
                ModernOverviewHeader(
                    onOpenQrLogin = onOpenQrLogin,
                    onOpenSearch = onOpenSearch,
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
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            IconTile(Icons.Outlined.AutoAwesome, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
                            Column(Modifier.weight(1f)) {
                                Text("下一步", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                Text(assistant.nextAction.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(assistant.nextAction.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            if (overview == null) {
                item(key = "overview-sync", contentType = "sync") {
                    OverviewSyncPanel(refreshing = state.refreshing)
                }
            } else {

            // 2. Bento Style 核心系统状态 Hero Card
            item(key = "health-hero", contentType = "hero") {
                val incidentCount = activeIncidents.size
                val stable = incidentCount == 0 && monitoredCount > 0 && healthyCount == monitoredCount
                Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(26.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 0.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    (if (stable) Color(0xFFECFDF5) else Color(0xFFFFFBEB)).copy(alpha = 0.6f),
                                    Color.Transparent,
                                ),
                            )
                        )
                        .padding(18.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                val progress = if (monitoredCount == 0) 0f else healthyCount.toFloat() / monitoredCount.toFloat()
                                CircularProgressIndicator(
                                    progress = { progress },
                                    modifier = Modifier.size(56.dp),
                                    color = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                    trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                                    strokeWidth = 5.dp,
                                    strokeCap = StrokeCap.Round,
                                )
                                Icon(
                                    if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                                    contentDescription = null,
                                    tint = if (stable) Color(0xFF059669) else Color(0xFFD97706),
                                    modifier = Modifier.size(24.dp),
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (stable) "一切正常，平台稳定运行"
                                    else if (incidentCount > 0) "有 $incidentCount 件事项需要处理"
                                    else "部分服务需要关注",
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 18.sp,
                                    ),
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    "$healthyCount/$monitoredCount 服务监测中 · ${formatPlatformTime(overview.refreshedAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 2.dp),
                                )
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                        // 三列 Bento 指标
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            ModernOverviewMetric(
                                label = "健康服务",
                                value = "$healthyCount/$monitoredCount",
                                accent = Color(0xFF059669),
                                bgColor = Color(0xFFECFDF5),
                                modifier = Modifier.weight(1f),
                            )
                            ModernOverviewMetric(
                                label = "平均响应",
                                value = averageLatencyMs?.let { "$it ms" } ?: "--",
                                accent = Color(0xFF2563EB),
                                bgColor = Color(0xFFEFF6FF),
                                modifier = Modifier.weight(1f),
                            )
                            ModernOverviewMetric(
                                label = "待处理事项",
                                value = activeIncidents.size.toString(),
                                accent = if (activeIncidents.isEmpty()) Color(0xFF059669) else Color(0xFFDC2626),
                                bgColor = if (activeIncidents.isEmpty()) Color(0xFFECFDF5) else Color(0xFFFEF2F2),
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
                }
            }

            // 3. 校园智览卡片
            item(key = "campus-title", contentType = "section") {
                OverviewSectionTitle("校园工作台", "课表、成绩与校园生活")
            }
            item(key = "campus-card", contentType = "card") {
                val campus = state.campusOverview
                val campusCardShape = RoundedCornerShape(24.dp)
                val campusInteractionSource = remember { MutableInteractionSource() }
                Surface(
                    onClick = openTodayWorkspace,
                    interactionSource = campusInteractionSource,
                    modifier = Modifier
                        .fillMaxWidth()
                        .pressFeedback(campusInteractionSource),
                    shape = campusCardShape,
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                    shadowElevation = 0.dp,
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            IconTile(Icons.Outlined.CalendarMonth, Ocean, OceanPale)
                            Column(modifier = Modifier.weight(1f)) {
                                Text("校园日常概览", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                                Text(
                                    state.timetable?.currentCalendarText?.takeIf(String::isNotBlank)
                                        ?: "课表、成绩和校园生活信息",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Icon(Icons.Outlined.ChevronRight, contentDescription = "查看校园智览", tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            ModernOverviewMetric("今日课程", todayCourseTotal.toString(), Color(0xFF2563EB), Color(0xFFEFF6FF), Modifier.weight(1f))
                            ModernOverviewMetric("本学期课程", if (courseCount > 0) "$courseCount 门" else "--", Color(0xFF059669), Color(0xFFECFDF5), Modifier.weight(1f))
                            ModernOverviewMetric("GPA", campus?.gpa?.overall ?: "--", Color(0xFF7C3AED), Color(0xFFF5F3FF), Modifier.weight(1f))
                        }
                    }
                }
            }

            // 4. 快捷操作
            item(key = "quick-actions-title", contentType = "section") {
                OverviewSectionTitle(
                    title = "快捷中心",
                    subtitle = "高频工具与常用入口一键直达",
                    trailing = {
                        val editInteractionSource = remember { MutableInteractionSource() }
                        Surface(
                            onClick = startCustomizingQuickActions,
                            interactionSource = editInteractionSource,
                            modifier = Modifier.pressFeedback(editInteractionSource),
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                            border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.Edit,
                                    contentDescription = "调整快捷操作",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    "自定义",
                                    style = MaterialTheme.typography.labelMedium.copy(
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.primary,
                                    ),
                                )
                            }
                        }
                    },
                )
            }

            items(
                items = quickActionRows,
                key = { rowActions -> "quick-actions-${rowActions.joinToString("-") { it.name }}" },
                contentType = { "quick-action-row" },
            ) { rowActions ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    shadowElevation = 0.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
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

            // 5. 待处理事项
            if (activeIncidents.isNotEmpty()) {
                item(key = "incident-title", contentType = "section") {
                    OverviewSectionTitle("需要关注", "${activeIncidents.size} 条待处理通知")
                }
                items(
                    items = visibleIncidents,
                    key = { "incident-${it.id}" },
                    contentType = { "incident" },
                ) { incident ->
                    val incidentCardShape = RoundedCornerShape(20.dp)
                    val incidentInteractionSource = remember(incident.id) { MutableInteractionSource() }
                    Surface(
                        onClick = openNotificationsWorkspace,
                        interactionSource = incidentInteractionSource,
                        modifier = Modifier
                            .fillMaxWidth()
                            .pressFeedback(incidentInteractionSource),
                        shape = incidentCardShape,
                        color = Color(0xFFFEF2F2),
                        border = BorderStroke(0.5.dp, Color(0xFFFECACA)),
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(11.dp),
                        ) {
                            IconTile(Icons.Outlined.ErrorOutline, Coral, CoralPale)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(incident.title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${incident.source} · ${formatPlatformTime(incident.updatedAt ?: incident.openedAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Icon(Icons.Outlined.ChevronRight, contentDescription = "查看通知", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            if (state.externalApplications.isNotEmpty()) {
                item(key = "external-apps-title", contentType = "section") {
                    OverviewSectionTitle("外部应用", "独立项目免密快捷直达")
                }
                externalApplicationOpenError?.let { message ->
                    item(key = "external-apps-error", contentType = "banner") {
                        FeedbackBanner(message, error = true)
                    }
                }
                items(
                    items = state.externalApplications,
                    key = { "external-application-${it.id}" },
                    contentType = { "external-application" },
                ) { application ->
                    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                        ExternalApplicationRow(
                            application = application,
                            opening = openingExternalApplicationId == application.id,
                            onOpen = stableOpenExternalApplication,
                        )
                    }
                }
            }

            // 6. 服务可用性
            item(key = "services-title", contentType = "section") {
                OverviewSectionTitle("服务监控", "核心微服务运行指标与状态")
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
                items(
                    items = sortedServices,
                    key = { "service-${it.id}" },
                    contentType = { "service" },
                ) { service ->
                    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                        ServiceRow(
                            service = service,
                            opening = openingServiceId == service.id,
                            onOpen = stableOpenServiceAdmin,
                        )
                    }
                }
            }

            item(key = "overview-bottom-spacer", contentType = "spacer") {
                Spacer(Modifier.height(16.dp))
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

/** 顶部通透 Header */
@Composable
private fun ModernOverviewHeader(
    onOpenQrLogin: () -> Unit,
    onOpenSearch: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = "工作台",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onBackground,
            ),
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ModernHeaderIconButton(
                icon = Icons.Outlined.Search,
                contentDescription = "全局搜索",
                onClick = onOpenSearch,
            )

            ModernHeaderIconButton(
                icon = Icons.Outlined.CenterFocusWeak,
                contentDescription = "扫码登录",
                onClick = onOpenQrLogin,
            )
        }
    }
}

/** 分组标题 */
@Composable
private fun OverviewSectionTitle(
    title: String,
    subtitle: String,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        trailing?.invoke()
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
        shape = RoundedCornerShape(16.dp),
        color = bgColor,
        border = BorderStroke(0.5.dp, accent.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                value,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = accent,
                    fontSize = 17.sp,
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

private fun homeQuickActionSpec(
    action: HomeQuickAction,
    onSelectTab: (MainTab) -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
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

    HomeQuickAction.Insights -> HomeQuickActionSpec(
        icon = Icons.Outlined.BarChart,
        label = "趋势周报",
        accent = Color(0xFF059669),
        accentPale = Color(0xFFECFDF5),
    ) { onOpenWorkspace(WorkspaceDestination.Insights) }

    HomeQuickAction.Scenes -> HomeQuickActionSpec(
        icon = Icons.Outlined.Tune,
        label = "智能场景",
        accent = Color(0xFF7C3AED),
        accentPale = Color(0xFFF5F3FF),
    ) { onOpenWorkspace(WorkspaceDestination.Scenes) }

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
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Edit,
        title = "调整快捷操作",
        subtitle = "选择显示项目并调整顺序",
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
            modifier = Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            localOrder.forEachIndexed { index, action ->
                val visibleCount = localOrder.count { it !in localHidden }
                val isChecked = action !in localHidden
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = if (isChecked) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.22f)
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = isChecked,
                            enabled = !isChecked || visibleCount > 1,
                            onCheckedChange = { checked ->
                                localHidden = if (checked) localHidden - action else localHidden + action
                            },
                        )
                        Text(
                            text = homeQuickActionLabel(action),
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                localOrder = localOrder.toMutableList().also {
                                    val item = it.removeAt(index)
                                    it.add(index - 1, item)
                                }
                            },
                            enabled = index > 0,
                        ) {
                            Icon(Icons.Outlined.KeyboardArrowUp, contentDescription = "上移", modifier = Modifier.size(20.dp))
                        }
                        IconButton(
                            onClick = {
                                localOrder = localOrder.toMutableList().also {
                                    val item = it.removeAt(index)
                                    it.add(index + 1, item)
                                }
                            },
                            enabled = index < localOrder.lastIndex,
                        ) {
                            Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = "下移", modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }
    }
}

private fun homeQuickActionLabel(action: HomeQuickAction): String = when (action) {
    HomeQuickAction.Today -> "今日工作台"
    HomeQuickAction.Notifications -> "通知中心"
    HomeQuickAction.Insights -> "趋势周报"
    HomeQuickAction.Scenes -> "智能场景"
    HomeQuickAction.Devices -> "设备控制"
    HomeQuickAction.Diagnostics -> "系统自检"
    HomeQuickAction.Backup -> "数据备份"
    HomeQuickAction.GoogleAccounts -> "邮箱台账"
    HomeQuickAction.Operations -> "系统状态"
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
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Outlined.CloudOff, contentDescription = null, modifier = Modifier.size(20.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("当前离线，仅显示上次同步数据", style = MaterialTheme.typography.labelLarge)
                Text(
                    updatedAt?.let { "缓存更新时间 $it" } ?: "联网后将自动恢复同步",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun OverviewSyncPanel(refreshing: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        shape = AppCardShape,
        shadowElevation = 3.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                Surface(
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.08f),
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Icon(Icons.Outlined.CloudSync, contentDescription = null, modifier = Modifier.padding(10.dp).size(26.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(if (refreshing) "正在同步平台状态" else "等待平台状态", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "聚合服务、通知和任务数据",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.68f),
                    )
                }
            }
            if (refreshing) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.12f),
                )
            }
            HorizontalDivider(modifier = Modifier.padding(top = 18.dp), color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.12f))
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                HeroMetric("服务可用", "--", Modifier.weight(1f))
                HeroMetric("平均响应", "--", Modifier.weight(1f))
                HeroMetric("待关注", "--", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun HeroMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                value,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                ),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = 2.dp)
            )
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
    val shape = RoundedCornerShape(18.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val isDark = isSystemInDarkTheme()

    val containerBg = if (isDark) {
        accent.copy(alpha = 0.10f).compositeOver(MaterialTheme.colorScheme.surface)
    } else {
        accentPale.copy(alpha = 0.45f)
    }

    val borderColor = if (isDark) {
        accent.copy(alpha = 0.22f)
    } else {
        accent.copy(alpha = 0.14f)
    }

    Surface(
        onClick = onClick,
        interactionSource = interactionSource,
        modifier = modifier.pressFeedback(interactionSource, pressedScale = 0.94f),
        shape = shape,
        color = containerBg,
        border = BorderStroke(0.8.dp, borderColor),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 13.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(
                        if (isDark) accent.copy(alpha = 0.22f)
                        else accent.copy(alpha = 0.14f)
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = accent,
                    modifier = Modifier.size(23.dp),
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.5.sp,
                    letterSpacing = (-0.1).sp,
                ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
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
    val shape = RoundedCornerShape(18.dp)
    val interactionSource = remember(service.id) { MutableInteractionSource() }
    val isDark = isSystemInDarkTheme()

    val containerBg = if (isDark) {
        theme.accent.copy(alpha = 0.07f).compositeOver(MaterialTheme.colorScheme.surface)
    } else {
        theme.accentPale.copy(alpha = 0.40f)
    }

    val borderColor = if (isDark) {
        theme.accent.copy(alpha = 0.18f)
    } else {
        theme.accent.copy(alpha = 0.10f)
    }

    Surface(
        onClick = { if (hasAdminUrl && !opening) onOpen(service) },
        enabled = hasAdminUrl && !opening,
        interactionSource = interactionSource,
        modifier = Modifier
            .fillMaxWidth()
            .pressFeedback(interactionSource, pressedScale = 0.98f),
        shape = shape,
        color = containerBg,
        border = BorderStroke(0.8.dp, borderColor),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(
                        if (isDark) theme.accent.copy(alpha = 0.22f)
                        else theme.accent.copy(alpha = 0.14f)
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = theme.icon,
                    contentDescription = service.name,
                    tint = theme.accent,
                    modifier = Modifier.size(23.dp),
                )
            }

            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = service.name,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    service.httpStatus?.let { status ->
                        val statusBg = if (status in 200..299) Color(0xFF059669) else Color(0xFFDC2626)
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = statusBg.copy(alpha = if (isDark) 0.2f else 0.10f),
                        ) {
                            Text(
                                text = "HTTP $status",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 10.5.sp,
                                    color = statusBg,
                                ),
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                            )
                        }
                    }
                    service.latencyMs?.let { latency ->
                        val latencyColor = when {
                            latency < 50 -> Color(0xFF059669)
                            latency < 150 -> Color(0xFF2563EB)
                            else -> Color(0xFFD97706)
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = latencyColor.copy(alpha = if (isDark) 0.2f else 0.10f),
                        ) {
                            Text(
                                text = "$latency ms",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 10.5.sp,
                                    color = latencyColor,
                                ),
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                            )
                        }
                    }
                    if (service.httpStatus == null && service.latencyMs == null) {
                        Text(
                            text = "等待监测数据",
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            if (opening) {
                ServiceJumpIndicator()
            } else {
                StatusBadge(service.state)
                if (hasAdminUrl) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
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
    val shape = RoundedCornerShape(18.dp)
    val interactionSource = remember(application.id) { MutableInteractionSource() }
    val isDark = isSystemInDarkTheme()

    val containerBg = if (isDark) {
        theme.accent.copy(alpha = 0.08f).compositeOver(MaterialTheme.colorScheme.surface)
    } else {
        theme.accentPale.copy(alpha = 0.45f)
    }

    val borderColor = if (isDark) {
        theme.accent.copy(alpha = 0.20f)
    } else {
        theme.accent.copy(alpha = 0.12f)
    }

    Surface(
        onClick = { if (application.canAccess && !opening) onOpen(application) },
        enabled = application.canAccess && !opening,
        interactionSource = interactionSource,
        modifier = Modifier
            .fillMaxWidth()
            .pressFeedback(interactionSource, pressedScale = 0.98f),
        shape = shape,
        color = containerBg,
        border = BorderStroke(0.8.dp, borderColor),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(
                        if (isDark) theme.accent.copy(alpha = 0.22f)
                        else theme.accent.copy(alpha = 0.14f)
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = theme.icon,
                    contentDescription = application.name,
                    tint = theme.accent,
                    modifier = Modifier.size(23.dp),
                )
            }

            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = application.name,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    application.health.latencyMs?.let { latency ->
                        val latencyColor = when {
                            latency < 50 -> Color(0xFF059669)
                            latency < 150 -> Color(0xFF2563EB)
                            else -> Color(0xFFD97706)
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = latencyColor.copy(alpha = if (isDark) 0.2f else 0.10f),
                        ) {
                            Text(
                                text = "$latency ms",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 10.5.sp,
                                    color = latencyColor,
                                ),
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                            )
                        }
                    }
                    Text(
                        text = if (application.canAccess) "最低权限 ${externalRoleLabel(application.requiredRole)}" else "当前账号无权访问",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (opening) {
                ServiceJumpIndicator()
            } else {
                StatusBadge(application.health.state)
                if (application.canAccess) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun externalApplicationDetail(application: ExternalApplication): String = listOfNotNull(
    application.description.takeIf(String::isNotBlank),
    application.health.latencyMs?.let { "$it ms" },
    "最低权限 ${externalRoleLabel(application.requiredRole)}",
    if (application.canAccess) null else "当前账号无权访问",
).joinToString(" · ").ifBlank {
    if (application.health.state == "unmonitored") "未配置健康检查" else "等待健康状态"
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

@Composable
private fun AuditRow(audit: AuditInfo) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        IconTile(
            if (audit.outcome == "failure") Icons.Outlined.ErrorOutline else Icons.Outlined.History,
            if (audit.outcome == "failure") Coral else Ocean,
            if (audit.outcome == "failure") CoralPale else OceanPale,
            modifier = Modifier.size(36.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(audit.action, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${audit.actor} · ${formatPlatformTime(audit.occurredAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StatusBadge(audit.outcome, if (audit.outcome == "failure") "失败" else "完成")
    }
}

private fun servicePriority(state: String): Int = when (state) {
    "offline" -> 0
    "degraded" -> 1
    "healthy" -> 2
    else -> 3
}
