package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Notifications
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AuditInfo
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
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onUpdateQuickActions: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
) {
    var customizingQuickActions by remember { mutableStateOf(false) }
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(appPageContentPadding(contentPadding)),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item(key = "overview-header", contentType = "header") {
            ImmersiveHeader(
                title = "工作台",
                subtitle = "系统状态与常用操作",
                refreshing = state.refreshing,
                onRefresh = onRefresh,
                actions = {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = CircleShape,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        IconButton(onClick = onOpenSearch, modifier = Modifier.size(42.dp)) {
                            Icon(Icons.Outlined.Search, contentDescription = "全局搜索")
                        }
                    }
                },
            )
        }
        state.sectionError?.let { message ->
            item(key = "overview-error", contentType = "status") {
                FeedbackBanner("部分数据暂不可用：$message", error = true)
            }
        }
        if (state.offlineMode) {
            item(key = "overview-offline", contentType = "status") {
                OfflineSnapshotNotice(state.cachedAtMillis)
            }
        }
        if (overview == null) {
            item(key = "overview-sync", contentType = "sync") { OverviewSyncPanel(refreshing = state.refreshing) }
            return@Column
        }
        item(key = "overview-status", contentType = "status") {
            val incidentCount = activeIncidents.size
            val stable = incidentCount == 0 && monitoredCount > 0 && healthyCount == monitoredCount
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                shadowElevation = 1.dp,
                border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 20.dp)
                ) {
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                val progress = if (monitoredCount == 0) 0f else healthyCount.toFloat() / monitoredCount.toFloat()
                                CircularProgressIndicator(
                                    progress = { progress },
                                    modifier = Modifier.size(64.dp),
                                    color = if (stable) Color(0xFF10B981) else Color(0xFFF59E0B),
                                    trackColor = Color(0xFFE2E8F0),
                                    strokeWidth = 6.dp,
                                    strokeCap = StrokeCap.Round,
                                )
                                Icon(
                                    if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                                    contentDescription = null,
                                    tint = if (stable) Color(0xFF10B981) else Color(0xFFF59E0B),
                                    modifier = Modifier.size(28.dp),
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (stable) "一切正常，系统稳定运行"
                                    else if (incidentCount > 0) "有 $incidentCount 件事需要你处理"
                                    else "部分服务需要关注",
                                    style = MaterialTheme.typography.headlineMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 20.sp,
                                        letterSpacing = (-0.3).sp
                                    ),
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    "$healthyCount/$monitoredCount 服务正常监测 · ${formatPlatformTime(overview.refreshedAt)}",
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                        HorizontalDivider(
                            modifier = Modifier.padding(top = 18.dp),
                            color = Color(0xFFF1F5F9),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            HeroMetric("健康服务", "$healthyCount/$monitoredCount", Modifier.weight(1f))
                            HeroMetric("平均响应", averageLatencyMs?.let { "$it ms" } ?: "--", Modifier.weight(1f))
                            HeroMetric("待处理", activeIncidents.size.toString(), Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        item {
            SectionHeader("今天", "课程、待办与提醒集中查看")
        }
        item(key = "overview-today", contentType = "today") {
            AppPanel(modifier = Modifier.clickable { onOpenWorkspace(WorkspaceDestination.Today) }) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconTile(Icons.Outlined.CalendarMonth, Ocean, OceanPale)
                    MetricCell("今日课程", todayCourseCount(state).toString(), Modifier.weight(1f))
                    MetricCell("未完成", state.todoSnapshot.tasks.count { !it.completed }.toString(), Modifier.weight(1f))
                    MetricCell("未读提醒", state.unreadAlerts.toString(), Modifier.weight(1f))
                    Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        item {
            SectionHeader(
                title = "快捷操作",
                subtitle = "常用功能一键直达",
                trailing = {
                    IconButton(onClick = { customizingQuickActions = true }) {
                        Icon(Icons.Outlined.Edit, contentDescription = "调整快捷操作")
                    }
                },
            )
        }
        item(key = "overview-quick-actions", contentType = "quick-actions") {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    val visibleActions = state.homeQuickActionOrder.filterNot(state.hiddenHomeQuickActions::contains)
                    visibleActions.chunked(3).forEach { rowActions ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            rowActions.forEach { action ->
                                val spec = homeQuickActionSpec(
                                    action = action,
                                    onSelectTab = onSelectTab,
                                    onRunDiagnostics = onRunDiagnostics,
                                    onTriggerBackup = onTriggerBackup,
                                    onOpenGoogleAccountDesk = onOpenGoogleAccountDesk,
                                    onOpenOperations = onOpenOperations,
                                    onOpenWorkspace = onOpenWorkspace,
                                )
                                QuickAction(
                                    icon = spec.icon,
                                    label = spec.label,
                                    accent = spec.accent,
                                    accentPale = spec.accentPale,
                                    modifier = Modifier.weight(1f),
                                    onClick = spec.onClick,
                                )
                            }
                            repeat(3 - rowActions.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }

        if (activeIncidents.isNotEmpty()) {
            item(key = "overview-incidents-title", contentType = "section-header") {
                SectionHeader("需要关注", "${activeIncidents.size} 个活动事件")
            }
            items(visibleIncidents, key = { "overview-${it.id}" }, contentType = { "incident" }) { incident ->
                AppPanel(
                    modifier = Modifier.clickable { onSelectTab(MainTab.Events) },
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(11.dp),
                    ) {
                        IconTile(Icons.Outlined.ErrorOutline, Coral, CoralPale)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(incident.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                "${incident.source} · ${formatPlatformTime(incident.updatedAt ?: incident.openedAt)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Icon(Icons.Outlined.ChevronRight, contentDescription = "查看事件", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        item { SectionHeader("服务状态", "平台全部核心服务实时状态") }
        if (sortedServices.isEmpty()) {
            item(key = "overview-services-empty", contentType = "empty") {
                AppPanel { EmptyBlock("暂无服务监测", "等待平台状态同步") }
            }
        } else {
            items(sortedServices, key = { "service-${it.id}" }, contentType = { "service" }) { service ->
                AppPanel { ServiceRow(service) }
            }
        }

        item { SectionHeader("最近活动", "平台审计摘要") }
        if (recentAudits.isEmpty()) {
            item(key = "overview-audits-empty", contentType = "empty") {
                AppPanel { EmptyBlock("暂无活动记录", "平台审计记录将在这里显示") }
            }
        } else {
            items(recentAudits, key = { "audit-${it.id}" }, contentType = { "audit" }) { audit ->
                AppPanel { AuditRow(audit) }
            }
        }
        item(key = "overview-bottom-spacer", contentType = "spacer") { Spacer(Modifier.height(4.dp)) }
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
    HomeQuickAction.Today -> HomeQuickActionSpec(Icons.Outlined.CalendarMonth, "今日工作台", Ocean, OceanPale) {
        onOpenWorkspace(WorkspaceDestination.Today)
    }
    HomeQuickAction.Notifications -> HomeQuickActionSpec(Icons.Outlined.Notifications, "通知中心", Coral, CoralPale) {
        onOpenWorkspace(WorkspaceDestination.Notifications)
    }
    HomeQuickAction.Insights -> HomeQuickActionSpec(Icons.Outlined.BarChart, "趋势周报", Forest, MintPale) {
        onOpenWorkspace(WorkspaceDestination.Insights)
    }
    HomeQuickAction.Scenes -> HomeQuickActionSpec(Icons.Outlined.Tune, "智能场景", Amber, AmberPale) {
        onOpenWorkspace(WorkspaceDestination.Scenes)
    }
    HomeQuickAction.Events -> HomeQuickActionSpec(Icons.Outlined.Notifications, "最新动态", Ocean, OceanPale) {
        onSelectTab(MainTab.Events)
    }
    HomeQuickAction.Devices -> HomeQuickActionSpec(Icons.Outlined.Hub, "设备控制", Forest, MintPale) {
        onSelectTab(MainTab.Tools)
    }
    HomeQuickAction.Diagnostics -> HomeQuickActionSpec(Icons.Outlined.Speed, "系统自检", Amber, AmberPale, onRunDiagnostics)
    HomeQuickAction.Backup -> HomeQuickActionSpec(Icons.Outlined.Backup, "数据备份", Coral, CoralPale, onTriggerBackup)
    HomeQuickAction.GoogleAccounts -> HomeQuickActionSpec(Icons.Outlined.Email, "邮箱台账", Ocean, OceanPale, onOpenGoogleAccountDesk)
    HomeQuickAction.Operations -> HomeQuickActionSpec(Icons.Outlined.Settings, "高级工具", Amber, AmberPale, onOpenOperations)
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
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) { Text("取消") }
                Button(onClick = { onSave(localOrder, localHidden) }) { Text("保存") }
            }
        },
    ) {
        Column(
            modifier = Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            localOrder.forEachIndexed { index, action ->
                val visibleCount = localOrder.count { it !in localHidden }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = action !in localHidden,
                        enabled = action in localHidden || visibleCount > 1,
                        onCheckedChange = { checked ->
                            localHidden = if (checked) localHidden - action else localHidden + action
                        },
                    )
                    Text(homeQuickActionLabel(action), modifier = Modifier.weight(1f))
                    IconButton(
                        onClick = {
                            localOrder = localOrder.toMutableList().also {
                                val item = it.removeAt(index)
                                it.add(index - 1, item)
                            }
                        },
                        enabled = index > 0,
                    ) {
                        Icon(Icons.Outlined.KeyboardArrowUp, contentDescription = "上移")
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
                        Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = "下移")
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
    HomeQuickAction.Events -> "最新动态"
    HomeQuickAction.Devices -> "设备控制"
    HomeQuickAction.Diagnostics -> "系统自检"
    HomeQuickAction.Backup -> "数据备份"
    HomeQuickAction.GoogleAccounts -> "邮箱台账"
    HomeQuickAction.Operations -> "高级工具"
}

private fun todayCourseCount(state: OverviewUiState): Int {
    val day = LocalDate.now().dayOfWeek.value
    val week = Regex("第(\\d+)周").find(state.timetable?.currentCalendarText.orEmpty())
        ?.groupValues?.getOrNull(1)?.toIntOrNull()
    return state.timetable?.courses.orEmpty().count { course ->
        course.day == day && (week == null || course.weeks.isEmpty() || week in course.weeks)
    }
}

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

// The dashboard data is bounded; one scrollable column keeps flings as light as the device page.
@Composable
private fun ColumnScope.item(
    key: Any? = null,
    contentType: Any? = null,
    content: @Composable () -> Unit,
) {
    content()
}

@Composable
private fun <T> ColumnScope.items(
    values: List<T>,
    key: ((T) -> Any)? = null,
    contentType: ((T) -> Any?)? = null,
    content: @Composable (T) -> Unit,
) {
    values.forEach { value -> content(value) }
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
                        "聚合服务、事件和任务数据",
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
                HeroMetric("待处置", "--", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun HeroMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = Color(0xFFFAF9F6),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.03f)),
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
    val shape = RoundedCornerShape(16.dp)
    Surface(
        modifier = modifier
            .clip(shape)
            .clickable(onClick = onClick),
        shape = shape,
        color = Color.White,
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconTile(icon, accent, accentPale, modifier = Modifier.size(38.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ServiceRow(service: ServiceInfo) {
    val style = statusStyle(service.state)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        val icon = if (service.category == "miniapp") Icons.Outlined.Hub else Icons.Outlined.Speed
        IconTile(icon, style.foreground, style.background, modifier = Modifier.size(38.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(service.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(
                    service.httpStatus?.let { "HTTP $it" },
                    service.latencyMs?.let { "$it ms" },
                ).joinToString(" · ").ifBlank { "等待监测数据" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StatusBadge(service.state)
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
