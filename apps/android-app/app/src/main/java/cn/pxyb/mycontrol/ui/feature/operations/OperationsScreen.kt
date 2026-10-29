package cn.pxyb.mycontrol.ui.feature.operations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.VolumeOff
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.ServiceInfo
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppNotificationButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppGroupedCard
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.statusStyle
import cn.pxyb.mycontrol.ui.components.feedback.AppCircularProgressIndicator
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.ImmersiveHeader
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.openPlatformWebLink
import cn.pxyb.mycontrol.ui.state.blocksAction
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.launch

private enum class OperationsTab(val label: String) {
    Overview("总览"),
    Services("服务"),
    Maintenance("维护"),
}

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
    focusedId: String? = null,
    onFocusConsumed: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedTab by rememberSaveable { mutableStateOf(OperationsTab.Overview) }
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
    var muteTarget by remember { mutableStateOf<IncidentInfo?>(null) }
    var resolveTarget by remember { mutableStateOf<IncidentInfo?>(null) }
    var noteText by remember { mutableStateOf("") }
    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val unresolvedIncidents = state.incidents.filter { it.status != "resolved" }
    val activeIncidents = unresolvedIncidents.size
    val monitoredServices = state.overview?.monitoredCount ?: 0
    val healthyServices = state.overview?.healthyCount ?: 0
    val serviceIssueCount = if (state.overview == null) 0 else (monitoredServices - healthyServices).coerceAtLeast(0)
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
    val networkNeedsAttention = state.networkHealth.status in setOf("warning", "error")
    val backupNeedsAttention = state.backup != null && state.backup?.rpoState != "healthy"
    val attentionCount = activeIncidents + serviceIssueCount + upcomingResources.size +
        (if (networkNeedsAttention) 1 else 0) + (if (backupNeedsAttention) 1 else 0)
    val attentionParts = buildList {
        if (activeIncidents > 0) add("$activeIncidents 个活动问题")
        if (serviceIssueCount > 0) add("$serviceIssueCount 项服务异常")
        if (upcomingResources.isNotEmpty()) add("${upcomingResources.size} 个资源待续期")
        if (networkNeedsAttention) add("网络需检查")
        if (backupNeedsAttention) add("备份需检查")
    }
    val summaryStatus = when {
        attentionCount > 0 -> "warning"
        state.overview != null -> "healthy"
        else -> "unknown"
    }
    val summaryTitle = when {
        attentionCount > 0 -> "$attentionCount 项需要关注"
        state.overview != null -> "一切正常"
        state.refreshing -> "正在获取系统状态"
        else -> "状态待确认"
    }
    val summarySubtitle = when {
        attentionCount > 0 -> attentionParts.joinToString(" · ")
        state.overview != null -> "$monitoredServices 项服务可用，没有需要处理的事项"
        state.refreshing -> "正在更新服务、设备与维护信息"
        else -> "下拉刷新获取最新运行状态"
    }
    val contentLimit = if (useTwoPaneLayout()) 8 else 6
    val listState = rememberLazyListState()

    services.firstOrNull { it.id == focusedId }?.let { service ->
        cn.pxyb.mycontrol.ui.components.dialog.AppDialog(
            title = service.name,
            subtitle = "搜索定位 · ${service.category}",
            onDismissRequest = onFocusConsumed,
            footer = { cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton(text = "关闭", onClick = onFocusConsumed) },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppStatusBadge(service.state)
                Text("响应耗时：${service.latencyMs?.let { "$it ms" } ?: "暂无数据"}", style = MaterialTheme.typography.bodyMedium)
                Text("HTTP 状态：${service.httpStatus ?: "暂无数据"}", style = MaterialTheme.typography.bodyMedium)
                if (!service.adminUrl.isNullOrBlank()) {
                    AppButton(text = "打开服务", onClick = { onFocusConsumed(); openService(service) })
                }
            }
        }
    }

    AppSubPage(
        title = "状态",
        onBack = {},
        showBack = false,
        contentPadding = contentPadding,
        listState = listState,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
        header = {
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
        },
    ) {
        state.sectionError?.let { message ->
            item(key = "section-error", contentType = "banner") {
                AppFeedbackBanner("部分状态数据暂不可用：$message", error = true, onRetry = onRefresh)
            }
        }

        item(key = "summary", contentType = "summary") {
            OperationsSummaryCard(
                title = summaryTitle,
                subtitle = summarySubtitle,
                status = summaryStatus,
            )
        }

        item(key = "tabs", contentType = "tabs") {
            AppSegmentedControl(
                options = OperationsTab.entries,
                selected = selectedTab,
                onSelect = { selectedTab = it },
                label = { it.label },
                count = { tab -> if (tab == OperationsTab.Overview) attentionCount else null },
            )
        }

        when (selectedTab) {
            OperationsTab.Overview -> {
                if (attentionCount > 0) {
                    item(key = "attention-title", contentType = "section") {
                        AppSectionHeader(
                            title = "需要关注",
                            subtitle = "异常与待办已自动置顶",
                            tag = attentionCount.toString(),
                        )
                    }
                    items(
                        items = unresolvedIncidents.take(contentLimit),
                        key = { "attention-incident:${it.id}" },
                        contentType = { "incident" },
                    ) { incident ->
                        OperationsIncidentCard(
                            incident = incident,
                            canOperate = canOperate,
                            onNote = { noteTarget = incident; noteText = "" },
                            onMute = { muteTarget = incident },
                            onResolve = { resolveTarget = incident },
                        )
                    }
                    if (serviceIssueCount > 0) {
                        item(key = "attention-services", contentType = "attention") {
                            AppPanel {
                                AppActionRow(
                                    title = "服务状态异常",
                                    subtitle = "$serviceIssueCount 项服务需要检查运行指标",
                                    icon = Icons.Outlined.Hub,
                                    iconTint = ColorTokens.Red.foreground,
                                    onClick = { selectedTab = OperationsTab.Services },
                                    trailingContent = { AppStatusBadge("unhealthy") },
                                )
                            }
                        }
                    }
                    if (networkNeedsAttention) {
                        item(key = "attention-network", contentType = "attention") {
                            AppPanel {
                                AppActionRow(
                                    title = "网络连接需要检查",
                                    subtitle = state.networkHealth.message ?: "远程服务器连通性异常",
                                    icon = Icons.Outlined.Wifi,
                                    iconTint = ColorTokens.Red.foreground,
                                    onClick = { selectedTab = OperationsTab.Maintenance },
                                    trailingContent = { AppStatusBadge(state.networkHealth.status) },
                                )
                            }
                        }
                    }
                    if (backupNeedsAttention) {
                        item(key = "attention-backup", contentType = "attention") {
                            AppPanel {
                                AppActionRow(
                                    title = "备份健康需要检查",
                                    subtitle = state.backup?.latestName ?: "最近备份状态未确认",
                                    icon = Icons.Outlined.Backup,
                                    iconTint = ColorTokens.Amber.foreground,
                                    onClick = { selectedTab = OperationsTab.Maintenance },
                                    trailingContent = { AppStatusBadge(state.backup?.rpoState ?: "unknown") },
                                )
                            }
                        }
                    }
                    items(
                        items = upcomingResources.take(2),
                        key = { "attention-resource:${it.first.id}" },
                        contentType = { "resource" },
                    ) { (resource, days) ->
                        OperationsResourceCard(resource = resource, days = days)
                    }
                    if (upcomingResources.size > 2) {
                        item(key = "attention-more-resources", contentType = "attention") {
                            AppPanel {
                                AppActionRow(
                                    title = "查看全部到期资源",
                                    subtitle = "共 ${upcomingResources.size} 项，按到期时间排序",
                                    icon = Icons.Outlined.ErrorOutline,
                                    onClick = { selectedTab = OperationsTab.Maintenance },
                                )
                            }
                        }
                    }
                }

                item(key = "overview-title", contentType = "section") {
                    AppSectionHeader(title = "系统概况", subtitle = "关键状态集中查看")
                }
                item(key = "overview", contentType = "card") {
                    AppGroupedCard {
                        AppActionRow(
                            title = "服务监控",
                            subtitle = if (state.overview == null) "暂未获取服务数据" else "$healthyServices 项健康，共 $monitoredServices 项",
                            icon = Icons.Outlined.Hub,
                            onClick = { selectedTab = OperationsTab.Services },
                            trailingContent = {
                                AppStatusBadge(
                                    when {
                                        state.overview == null -> "unknown"
                                        serviceIssueCount == 0 -> "healthy"
                                        else -> "unhealthy"
                                    },
                                )
                            },
                        )
                        AppDivider()
                        AppActionRow(
                            title = "在线设备",
                            subtitle = if (state.iot == null) "暂未获取设备数据" else "$onlineDevices 台在线，共 $totalDevices 台",
                            icon = Icons.Outlined.Hub,
                            trailingContent = {
                                Text(
                                    "$onlineDevices/$totalDevices",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = if (state.iot != null && onlineDevices == totalDevices) ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
                                )
                            },
                        )
                        AppDivider()
                        AppActionRow(
                            title = "网络连接",
                            subtitle = state.networkHealth.message ?: state.networkHealth.gatewayUrl.ifBlank { "查看 DNS 与 API 连通性" },
                            icon = Icons.Outlined.Wifi,
                            onClick = { selectedTab = OperationsTab.Maintenance },
                            trailingContent = {
                                Text(
                                    networkStatusLabel(state.networkHealth.status),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = networkStatusColor(state.networkHealth.status),
                                )
                            },
                        )
                        AppDivider()
                        AppActionRow(
                            title = "备份健康",
                            subtitle = state.backup?.ageHours?.let { "最近备份距今 ${"%.1f".format(it)} 小时" } ?: "等待首次备份结果",
                            icon = Icons.Outlined.Backup,
                            onClick = { selectedTab = OperationsTab.Maintenance },
                            trailingContent = { AppStatusBadge(state.backup?.rpoState ?: "unknown") },
                        )
                    }
                }

                item(key = "diagnostics-title", contentType = "section") {
                    AppSectionHeader(title = "一键巡检", subtitle = "检查系统与微服务状态")
                }
                item(key = "diagnostics", contentType = "card") {
                    AppPanel {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            AppButton(
                                text = if ("diagnostics" in state.busyActions) "巡检进行中..." else "一键巡检",
                                onClick = onRunDiagnostics,
                                icon = Icons.Outlined.CheckCircle,
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
                                    AppStatusBadge(check.status)
                                }
                            }
                        }
                    }
                }
            }

            OperationsTab.Services -> {
                item(key = "services-title", contentType = "section") {
                    AppSectionHeader(title = "服务监控", subtitle = "${services.size} 项服务 · 查看指标与管理入口")
                }
                serviceOpenError?.let { message ->
                    item(key = "service-open-error", contentType = "banner") {
                        AppFeedbackBanner(message, error = true)
                    }
                }
                if (services.isEmpty()) {
                    item(key = "services-empty", contentType = "empty") {
                        if (state.refreshing) {
                            GlassShimmerList(itemCount = 2, itemHeight = 72.dp)
                        } else {
                            AppEmptyState("暂无服务数据", detail = "下拉刷新可重新获取服务状态。")
                        }
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
                                    if (openingServiceId == service.id) {
                                        AppCircularProgressIndicator(Modifier.size(18.dp))
                                    } else {
                                        AppStatusBadge(service.state)
                                    }
                                },
                            )
                        }
                    }
                }
            }

            OperationsTab.Maintenance -> {
                item(key = "projects", contentType = "card") {
                    AppPanel {
                        AppActionRow(
                            title = "项目与发布",
                            subtitle = "GitHub 项目、Android 发布、CT8 任务与容器镜像",
                            icon = Icons.Outlined.Code,
                            onClick = onOpenProjects,
                        )
                    }
                }

                item(key = "checks-title", contentType = "section") {
                    AppSectionHeader(title = "检查与连通性", subtitle = "通知、DNS 与 API 状态")
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
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
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

                item(key = "resources-title", contentType = "section") {
                    AppSectionHeader(title = "资源与续期", subtitle = "域名、证书和个人资源")
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
                        AppEmptyState("近期没有资源到期", detail = "资源接近提醒日期后会显示在这里。")
                    }
                } else {
                    items(
                        items = upcomingResources.take(contentLimit),
                        key = { "resource:${it.first.id}" },
                        contentType = { "resource" },
                    ) { (resource, days) ->
                        OperationsResourceCard(resource = resource, days = days)
                    }
                }

                item(key = "backup-title", contentType = "section") {
                    AppSectionHeader(title = "备份健康", subtitle = "恢复仍在桌面控制台完成")
                }
                item(key = "backup", contentType = "card") {
                    val backup = state.backup
                    AppPanel {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                AppIconTile(
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
                                AppStatusBadge(backup?.rpoState ?: "unknown")
                            }
                            if (canOperate && backup?.canBackup == true) {
                                AppButton(
                                    text = if ("backup" in state.busyActions) "备份提交中..." else "立即备份",
                                    onClick = { confirmBackup = true },
                                    icon = Icons.Outlined.Backup,
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
    muteTarget?.let { incident ->
        AppConfirmDialog(
            title = "将事件静音 1 小时？",
            detail = "事件：${incident.title}\n静音期间将暂停此事件的提醒，异常仍需要处理。",
            confirmLabel = "确认静音",
            icon = Icons.AutoMirrored.Outlined.VolumeOff,
            onDismiss = { muteTarget = null },
            onConfirm = { muteTarget = null; onIncidentMute(incident.id) },
        )
    }
    resolveTarget?.let { incident ->
        AppConfirmDialog(
            title = "将事件标记为已解决？",
            detail = "事件：${incident.title}\n将改变此事件的处理状态及未解决事件统计，请确认故障已经排除。",
            confirmLabel = "确认已解决",
            icon = Icons.Outlined.CheckCircle,
            onDismiss = { resolveTarget = null },
            onConfirm = { resolveTarget = null; onIncidentResolve(incident.id, "已由移动端标记解决") },
        )
    }
    noteTarget?.let { incident ->
        AppDialogForm(
            title = "记录处理进展",
            onDismissRequest = { noteTarget = null },
            onConfirm = {
                onIncidentNote(incident.id, noteText)
                noteTarget = null
            },
            confirmText = "保存记录",
            enabled = noteText.isNotBlank(),
        ) {
            AppTextField(
                value = noteText,
                onValueChange = { noteText = it.take(500) },
                label = "备注",
                placeholder = "例如：已重启服务，等待指标恢复",
                singleLine = false,
                minLines = 3,
                maxLines = 5,
            )
        }
    }
}

@Composable
private fun OperationsSummaryCard(
    title: String,
    subtitle: String,
    status: String,
) {
    val style = statusStyle(status)
    AppPanel {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppIconTile(style.icon, style.foreground, style.background, modifier = Modifier.size(48.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Medium)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            AppStatusBadge(status)
        }
    }
}

@Composable
private fun OperationsIncidentCard(
    incident: IncidentInfo,
    canOperate: Boolean,
    onNote: () -> Unit,
    onMute: () -> Unit,
    onResolve: () -> Unit,
) {
    AppPanel {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppIconTile(Icons.Outlined.ErrorOutline, ColorTokens.Red.foreground, ColorTokens.Red.container, modifier = Modifier.size(36.dp))
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
                AppStatusBadge(incident.status)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onNote, enabled = canOperate) {
                    Icon(Icons.Outlined.EditNote, null, modifier = Modifier.size(17.dp))
                    Text("记录")
                }
                TextButton(onClick = onMute, enabled = canOperate) {
                    Icon(Icons.AutoMirrored.Outlined.VolumeOff, null, modifier = Modifier.size(17.dp))
                    Text("静音 1 小时")
                }
                TextButton(onClick = onResolve, enabled = canOperate) {
                    Icon(Icons.Outlined.CheckCircle, null, modifier = Modifier.size(17.dp))
                    Text("解决")
                }
            }
        }
    }
}

@Composable
private fun OperationsResourceCard(
    resource: ResourceExpiry,
    days: Int,
) {
    AppPanel {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppIconTile(
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
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppIconTile(icon, iconTint, iconBackground, modifier = Modifier.size(36.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                )
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (busy) {
                AppCircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = iconTint,
                )
            } else {
                Text(
                    trailing,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = iconTint,
                )
            }
        }
    }
}

@Composable
private fun networkStatusColor(status: String): Color = when (status) {
    "healthy" -> ColorTokens.Green.foreground
    "warning" -> ColorTokens.Amber.foreground
    "error" -> ColorTokens.Red.foreground
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

private fun networkStatusLabel(status: String): String = when (status) {
    "healthy" -> "畅通"
    "warning" -> "稍慢"
    "error" -> "异常"
    "measuring" -> "测速中"
    else -> "未测速"
}
