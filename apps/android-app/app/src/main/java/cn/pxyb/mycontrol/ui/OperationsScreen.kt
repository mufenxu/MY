package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.VolumeOff
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material3.CircularProgressIndicator
import cn.pxyb.mycontrol.data.ServiceInfo
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.IncidentInfo
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Composable
fun OperationsScreen(
    state: OperationsUiState,
    contentPadding: PaddingValues,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenProjects: () -> Unit,
    requestWebLoginUrl: suspend (String) -> String,
    onMeasureNetwork: () -> Unit,
    onIncidentNote: (String, String) -> Unit,
    onIncidentMute: (String) -> Unit,
    onIncidentResolve: (String, String) -> Unit,
    onRefresh: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var showServices by rememberSaveable { mutableStateOf(false) }
    var openingServiceId by remember { mutableStateOf<String?>(null) }
    var serviceOpenError by remember { mutableStateOf<String?>(null) }
    val services = remember(state.overview?.services) {
        state.overview?.services.orEmpty().sortedWith(compareBy<ServiceInfo> { it.state == "healthy" }.thenBy { it.name })
    }
    fun openService(service: ServiceInfo) {
        val adminUrl = service.adminUrl?.takeIf(String::isNotBlank) ?: return
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
                    serviceOpenError = error.message?.takeIf(String::isNotBlank) ?: "打开服务失败，请重试。"
                }
        }
    }
    var confirmBackup by remember { mutableStateOf(false) }
    var noteTarget by remember { mutableStateOf<IncidentInfo?>(null) }
    var noteText by remember { mutableStateOf("") }
    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val activeIncidents = state.incidents.count { it.status != "resolved" }
    val monitoredServices = state.overview?.monitoredCount ?: 0
    val healthyServices = state.overview?.healthyCount ?: 0
    val onlineDevices = state.iot?.devices.orEmpty().count { it.online }
    val totalDevices = state.iot?.devices.orEmpty().size
    val today = LocalDate.now()
    val upcomingResources = remember(state.resourceExpiries, today) {
        state.resourceExpiries.mapNotNull { resource ->
            val date = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@mapNotNull null
            val days = ChronoUnit.DAYS.between(today, date).toInt()
            (resource to days).takeIf { days <= maxOf(60, resource.advanceNoticeDays) }
        }.sortedBy { it.second }
    }
    val listState = rememberLazyListState()
    val dark = isAppInDarkTheme()

    val isTablet = useTwoPaneLayout()

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
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "status-header", contentType = "header") {
                ImmersiveHeader(
                    title = "状态",
                    subtitle = "系统健康、提醒与必要维护",
                    actions = {
                        AppNotificationButton(
                            unreadCount = state.unreadAlerts,
                            onClick = onOpenNotifications,
                        )
                    },
                )
            }

            state.sectionError?.let { message ->
                item(key = "section-error", contentType = "banner") {
                    FeedbackBanner("部分状态数据暂不可用：$message", error = true)
                }
            }

            item(key = "projects") {
                AppPanel {
                    AppActionRow(
                        title = "项目与发布",
                        subtitle = "GitHub 项目、Android 发布、CT8 任务与容器镜像",
                        icon = Icons.Outlined.Code,
                        onClick = onOpenProjects,
                    )
                }
            }
            item(key = "services") {
                AppPanel {
                    AppActionRow(
                        title = "服务监控",
                        subtitle = "${services.size} 项服务 · ${if (showServices) "收起运行指标" else "查看运行指标与服务入口"}",
                        icon = Icons.Outlined.Hub,
                        onClick = { showServices = !showServices },
                    )
                }
            }
            if (showServices) {
                serviceOpenError?.let { message ->
                    item(key = "service-open-error") { FeedbackBanner(message, error = true) }
                }
                if (services.isEmpty()) {
                    item(key = "services-empty") {
                        if (state.refreshing) GlassShimmerList(itemCount = 2, itemHeight = 72.dp)
                        else EmptyBlock("暂无服务数据", "下拉刷新可重新获取服务状态。")
                    }
                } else {
                    items(services, key = { "service-${it.id}" }, contentType = { "service" }) { service ->
                        AppPanel {
                            AppActionRow(
                                title = service.name,
                                subtitle = listOfNotNull(
                                    service.category,
                                    service.httpStatus?.let { "HTTP $it" },
                                    service.latencyMs?.let { "$it ms" },
                                    if (!service.adminUrl.isNullOrBlank()) "点击打开" else null,
                                ).joinToString(" · "),
                                enabled = openingServiceId == null || openingServiceId == service.id,
                                onClick = if (service.adminUrl.isNullOrBlank()) null else { { openService(service) } },
                                trailingContent = {
                                    if (openingServiceId == service.id) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                                    else StatusBadge(service.state)
                                },
                            )
                        }
                    }
                }
            }

            if (isTablet) {
                // 平板 / 大屏：自适应双列运维管理布局
                item(key = "tablet-operations-layout", contentType = "tablet-operations") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // 左列：系统概览指标 + 检查与连通性 + 诊断巡检 + 备份健康
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            SectionHeader("系统概览", "只保留日常需要关注的结论")
                            AppPanel {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 14.dp, vertical = 12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    MetricCell("健康服务", "$healthyServices/$monitoredServices", Modifier.weight(1f), if (state.overview != null && healthyServices == monitoredServices) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                                    MetricCell("活动问题", activeIncidents.toString(), Modifier.weight(1f), if (activeIncidents == 0) ColorTokens.Green.foreground else ColorTokens.Red.foreground)
                                    MetricCell("在线设备", "$onlineDevices/$totalDevices", Modifier.weight(1f), if (state.iot != null && onlineDevices == totalDevices) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                                    MetricCell("即将到期", upcomingResources.size.toString(), Modifier.weight(1f), if (upcomingResources.isEmpty()) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                                }
                            }

                            SectionHeader("检查与连通性", "测量 DNS 解析与 API 响应延迟")
                            AppPanel {
                                Column {
                                    OperationsStatusRow(
                                        icon = Icons.Outlined.NotificationsActive,
                                        iconTint = if (state.unreadAlerts == 0) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                        iconBackground = if (state.unreadAlerts == 0) ColorTokens.Green.container else ColorTokens.Red.container,
                                        title = "通知中心",
                                        subtitle = if (state.unreadAlerts == 0) "当前没有未读提醒" else "${state.unreadAlerts} 条未读提醒需要查看",
                                        onClick = onOpenNotifications,
                                        trailing = "查看",
                                    )
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                                    OperationsStatusRow(
                                        icon = Icons.Outlined.Wifi,
                                        iconTint = ColorTokens.Blue.foreground,
                                        iconBackground = ColorTokens.Sky.container,
                                        title = "远程服务器连通性",
                                        subtitle = state.networkHealth.message
                                            ?: state.networkHealth.gatewayUrl.ifBlank { "测量 DNS 解析与 API 响应延迟" },
                                        busy = state.networkHealth.status == "measuring",
                                        onClick = onMeasureNetwork,
                                        trailing = networkStatusLabel(state.networkHealth.status),
                                    )
                                    if (state.networkHealth.checks.isNotEmpty()) {
                                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                                        Column(
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                            verticalArrangement = Arrangement.spacedBy(7.dp),
                                        ) {
                                            state.networkHealth.checks.forEach { check ->
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                ) {
                                                    Icon(
                                                        imageVector = if (check.ok) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline,
                                                        contentDescription = null,
                                                        tint = if (check.ok) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                                        modifier = Modifier.size(16.dp),
                                                    )
                                                    Text(check.label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                                                    Text(
                                                        check.detail,
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            SectionHeader("一键巡检", "系统健康与微服务状态体检")
                            AppPanel {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    AppDialogPrimaryButton(
                                        text = if ("diagnostics" in state.busyActions) "巡检进行中..." else "立即运行一键巡检",
                                        onClick = onRunDiagnostics,
                                        enabled = !state.busyActions.blocksAction("diagnostics"),
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    state.diagnostics?.checks.orEmpty().take(4).forEach { check ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Text(check.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                            StatusBadge(check.status)
                                        }
                                    }
                                }
                            }

                            SectionHeader("备份健康", "手机端可立即备份，恢复仍在桌面控制台完成")
                            val backup = state.backup
                            AppPanel {
                                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        IconTile(
                                            Icons.Outlined.Backup,
                                            if (backup?.rpoState == "healthy") ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
                                            if (backup?.rpoState == "healthy") ColorTokens.Green.container else ColorTokens.Amber.container,
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(backup?.latestName ?: "尚无可恢复备份", style = MaterialTheme.typography.titleMedium)
                                            Text(
                                                backup?.ageHours?.let { "距今 ${"%.1f".format(it)} 小时 · RPO ${backup.rpoHours} 小时" }
                                                    ?: "等待首次备份结果",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        StatusBadge(backup?.rpoState ?: "unknown")
                                    }
                                    if (canOperate && backup?.canBackup == true) {
                                        AppDialogPrimaryButton(
                                            text = if ("backup" in state.busyActions) "备份提交中..." else "立即备份",
                                            onClick = { confirmBackup = true },
                                            enabled = !state.busyActions.blocksAction("backup"),
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                }
                            }
                        }

                        // 右列：正在处理的问题 + 资源与续期到期提醒
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            SectionHeader("正在处理的问题", "可以直接记录、静音或标记解决")
                            val unresolvedIncidents = state.incidents.filter { it.status != "resolved" }
                            if (state.refreshing && unresolvedIncidents.isEmpty()) {
                                AppSkeletonList(
                                    rowCount = 2,
                                    leadingSize = 36.dp,
                                    lineWidths = listOf(0.4f, 0.66f),
                                )
                            } else if (unresolvedIncidents.isEmpty()) {
                                EmptyBlock("当前没有进行中的问题", "平台所有服务与组件运行稳定。")
                            } else {
                                unresolvedIncidents.take(8).forEach { incident ->
                                    AppPanel {
                                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                                IconTile(Icons.Outlined.ErrorOutline, ColorTokens.Red.foreground, ColorTokens.Red.container, modifier = Modifier.size(36.dp))
                                                Column(Modifier.weight(1f)) {
                                                    Text(incident.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                                    Text(
                                                        incident.description.ifBlank { "${incident.source} · ${incident.severity}" },
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                                StatusBadge(incident.status)
                                            }
                                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                TextButton(onClick = { noteTarget = incident; noteText = "" }, enabled = canOperate) {
                                                    Icon(Icons.Outlined.EditNote, null, modifier = Modifier.size(17.dp))
                                                    Text("记录")
                                                }
                                                TextButton(onClick = { onIncidentMute(incident.id) }, enabled = canOperate) {
                                                    Icon(Icons.Outlined.VolumeOff, null, modifier = Modifier.size(17.dp))
                                                    Text("静音 1 小时")
                                                }
                                                TextButton(onClick = { onIncidentResolve(incident.id, "已由移动端标记解决") }, enabled = canOperate) {
                                                    Icon(Icons.Outlined.CheckCircle, null, modifier = Modifier.size(17.dp))
                                                    Text("解决")
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            SectionHeader("资源与续期", "域名、证书和个人资源的到期提醒")
                            if (state.refreshing && upcomingResources.isEmpty()) {
                                AppSkeletonList(
                                    rowCount = 2,
                                    leadingSize = 36.dp,
                                    lineWidths = listOf(0.4f, 0.66f),
                                )
                            } else if (upcomingResources.isEmpty()) {
                                EmptyBlock("近期没有资源到期", "资源接近提醒日期后会显示在这里。")
                            } else {
                                upcomingResources.take(8).forEach { (resource, days) ->
                                    AppPanel {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(14.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            IconTile(
                                                Icons.Outlined.ErrorOutline,
                                                if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground,
                                                if (days <= 7) ColorTokens.Red.container else ColorTokens.Amber.container,
                                            )
                                            Column(Modifier.weight(1f)) {
                                                Text(resource.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                                Text(resource.type, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            Text(
                                                when {
                                                    days < 0 -> "已过期 ${-days} 天"
                                                    days == 0 -> "今天到期"
                                                    else -> "$days 天后"
                                                },
                                                style = MaterialTheme.typography.labelLarge,
                                                color = if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // 手机单列流
                item(key = "overview-title", contentType = "section") {
                    SectionHeader("系统概览", "只保留日常需要关注的结论")
                }
                item(key = "overview", contentType = "card") {
                    AppPanel {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            MetricCell("健康服务", "$healthyServices/$monitoredServices", Modifier.weight(1f), if (state.overview != null && healthyServices == monitoredServices) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                            MetricCell("活动问题", activeIncidents.toString(), Modifier.weight(1f), if (activeIncidents == 0) ColorTokens.Green.foreground else ColorTokens.Red.foreground)
                            MetricCell("在线设备", "$onlineDevices/$totalDevices", Modifier.weight(1f), if (state.iot != null && onlineDevices == totalDevices) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                            MetricCell("即将到期", upcomingResources.size.toString(), Modifier.weight(1f), if (upcomingResources.isEmpty()) ColorTokens.Green.foreground else ColorTokens.Amber.foreground)
                        }
                    }
                }

                item(key = "checks-title", contentType = "section") {
                    SectionHeader("检查与提醒", "问题处理统一进入通知中心")
                }
                item(key = "checks", contentType = "card") {
                    AppPanel {
                        Column {
                            OperationsStatusRow(
                                icon = Icons.Outlined.NotificationsActive,
                                iconTint = if (state.unreadAlerts == 0) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                iconBackground = if (state.unreadAlerts == 0) ColorTokens.Green.container else ColorTokens.Red.container,
                                title = "通知中心",
                                subtitle = if (state.unreadAlerts == 0) "当前没有未读提醒" else "${state.unreadAlerts} 条未读提醒需要查看",
                                onClick = onOpenNotifications,
                                trailing = "查看",
                            )
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                            OperationsStatusRow(
                                icon = Icons.Outlined.Wifi,
                                iconTint = ColorTokens.Blue.foreground,
                                iconBackground = ColorTokens.Sky.container,
                                title = "远程服务器连通性",
                                subtitle = state.networkHealth.message
                                    ?: state.networkHealth.gatewayUrl.ifBlank { "测量 DNS 解析与 API 响应延迟" },
                                busy = state.networkHealth.status == "measuring",
                                onClick = onMeasureNetwork,
                                trailing = networkStatusLabel(state.networkHealth.status),
                            )
                            if (state.networkHealth.checks.isNotEmpty()) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                                Column(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalArrangement = Arrangement.spacedBy(7.dp),
                                ) {
                                    state.networkHealth.checks.forEach { check ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Icon(
                                                imageVector = if (check.ok) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline,
                                                contentDescription = null,
                                                tint = if (check.ok) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                                modifier = Modifier.size(16.dp),
                                            )
                                            Text(check.label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                                            Text(
                                                check.detail,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (state.incidents.any { it.status != "resolved" }) {
                    item(key = "incident-actions-title", contentType = "section") {
                        SectionHeader("正在处理的问题", "可以直接记录、静音或标记解决")
                    }
                    items(
                        items = state.incidents.filter { it.status != "resolved" }.take(6),
                        key = { "incident-action:${it.id}" },
                        contentType = { "incident-action" },
                    ) { incident ->
                        AppPanel {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                    IconTile(Icons.Outlined.ErrorOutline, ColorTokens.Red.foreground, ColorTokens.Red.container, modifier = Modifier.size(36.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(incident.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            incident.description.ifBlank { "${incident.source} · ${incident.severity}" },
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    StatusBadge(incident.status)
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    TextButton(onClick = { noteTarget = incident; noteText = "" }, enabled = canOperate) {
                                        Icon(Icons.Outlined.EditNote, null, modifier = Modifier.size(17.dp))
                                        Text("记录")
                                    }
                                    TextButton(onClick = { onIncidentMute(incident.id) }, enabled = canOperate) {
                                        Icon(Icons.Outlined.VolumeOff, null, modifier = Modifier.size(17.dp))
                                        Text("静音 1 小时")
                                    }
                                    TextButton(onClick = { onIncidentResolve(incident.id, "已由手机端标记解决") }, enabled = canOperate) {
                                        Icon(Icons.Outlined.CheckCircle, null, modifier = Modifier.size(17.dp))
                                        Text("解决")
                                    }
                                }
                            }
                        }
                    }
                }
                item(key = "diagnostics", contentType = "card") {
                    AppPanel {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            AppDialogPrimaryButton(
                                text = if ("diagnostics" in state.busyActions) "巡检进行中..." else "立即运行一键巡检",
                                onClick = onRunDiagnostics,
                                enabled = !state.busyActions.blocksAction("diagnostics"),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            state.diagnostics?.checks.orEmpty().take(4).forEach { check ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(check.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                    StatusBadge(check.status)
                                }
                            }
                        }
                    }
                }

                item(key = "resources-title", contentType = "section") {
                    SectionHeader("资源与续期", "域名、证书和个人资源的到期提醒")
                }
                if (state.refreshing && upcomingResources.isEmpty()) {
                    item(key = "resources-loading", contentType = "loading") {
                        AppSkeletonList(
                            rowCount = 2,
                            leadingSize = 36.dp,
                            lineWidths = listOf(0.4f, 0.66f),
                        )
                    }
                } else if (upcomingResources.isEmpty()) {
                    item(key = "resources-empty", contentType = "empty") {
                        EmptyBlock("近期没有资源到期", "资源接近提醒日期后会显示在这里。")
                    }
                } else {
                    items(
                        items = upcomingResources.take(6),
                        key = { "resource:${it.first.id}" },
                        contentType = { "resource" },
                    ) { (resource, days) ->
                        AppPanel {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                IconTile(
                                    Icons.Outlined.ErrorOutline,
                                    if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground,
                                    if (days <= 7) ColorTokens.Red.container else ColorTokens.Amber.container,
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(resource.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    Text(resource.type, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(
                                    when {
                                        days < 0 -> "已过期 ${-days} 天"
                                        days == 0 -> "今天到期"
                                        else -> "$days 天后"
                                    },
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground,
                                )
                            }
                        }
                    }
                }

                item(key = "backup-title", contentType = "section") {
                    SectionHeader("备份健康", "手机端可立即备份，恢复仍在桌面控制台完成")
                }
                item(key = "backup", contentType = "card") {
                    val backup = state.backup
                    AppPanel {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                IconTile(
                                    Icons.Outlined.Backup,
                                    if (backup?.rpoState == "healthy") ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
                                    if (backup?.rpoState == "healthy") ColorTokens.Green.container else ColorTokens.Amber.container,
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(backup?.latestName ?: "尚无可恢复备份", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        backup?.ageHours?.let { "距今 ${"%.1f".format(it)} 小时 · RPO ${backup.rpoHours} 小时" }
                                            ?: "等待首次备份结果",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                StatusBadge(backup?.rpoState ?: "unknown")
                            }
                            if (canOperate && backup?.canBackup == true) {
                                AppDialogPrimaryButton(
                                    text = if ("backup" in state.busyActions) "备份提交中..." else "立即备份",
                                    onClick = { confirmBackup = true },
                                    enabled = !state.busyActions.blocksAction("backup"),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            }


        }
    }

    if (confirmBackup) {
        AppConfirmDialog(
            title = "立即执行平台备份？",
            detail = "备份任务将在后台运行，不会覆盖或删除现有数据。",
            confirmLabel = "确认备份",
            onDismiss = { confirmBackup = false },
            onConfirm = {
                confirmBackup = false
                onTriggerBackup()
            },
            icon = Icons.Outlined.Backup,
        )
    }
    noteTarget?.let { incident ->
        AlertDialog(
            onDismissRequest = { noteTarget = null },
            title = { Text("记录处理进展") },
            text = {
                OutlinedTextField(
                    value = noteText,
                    onValueChange = { noteText = it.take(500) },
                    label = { Text("备注") },
                    placeholder = { Text("例如：已重启服务，等待指标恢复") },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onIncidentNote(incident.id, noteText)
                        noteTarget = null
                    },
                    enabled = noteText.isNotBlank(),
                ) { Text("保存记录") }
            },
            dismissButton = { TextButton(onClick = { noteTarget = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun OperationsStatusRow(
    icon: ImageVector,
    iconTint: Color,
    iconBackground: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    trailing: String,
    busy: Boolean = false,
) {
    Surface(
        onClick = onClick,
        enabled = !busy,
        color = Color.Transparent,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            IconTile(icon, iconTint, iconBackground, modifier = Modifier.size(36.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.5.sp,
                    ),
                )
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (busy) {
                androidx.compose.material3.CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = iconTint,
                )
            } else {
                Text(
                    trailing,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp),
                    color = iconTint,
                )
            }
        }
    }
}

private fun networkStatusLabel(status: String): String = when (status) {
    "healthy" -> "畅通"
    "warning" -> "稍慢"
    "error" -> "异常"
    "measuring" -> "测速中"
    else -> "未测速"
}
