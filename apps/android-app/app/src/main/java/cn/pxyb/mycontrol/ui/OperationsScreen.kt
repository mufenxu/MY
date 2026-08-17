package cn.pxyb.mycontrol.ui

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Composable
fun OperationsScreen(
    state: OperationsUiState,
    contentPadding: PaddingValues,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onApproveConfiguration: (String, String) -> Unit,
    onRejectConfiguration: (String, String) -> Unit,
    onOpenNotifications: () -> Unit = {},
    onOpenIncident: (String) -> Unit = {},
    onMeasureNetwork: () -> Unit = {},
    onClearCache: () -> Unit = {},
    onForceFullSync: () -> Unit = {},
    onGenerateDiagnosticReport: () -> String = { "" },
    focusTaskId: String?,
    onFocusConsumed: () -> Unit,
    onRefresh: () -> Unit,
) {
    var confirmBackup by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf("action") }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var decisionNote by remember { mutableStateOf("") }
    var pendingDecision by remember { mutableStateOf<String?>(null) }
    var confirmClearCache by remember { mutableStateOf(false) }
    var showDiagnosticDialog by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val canApproveConfig = state.user?.role == "super_admin"
    val activeTasks = state.tasks.count { it.status in setOf("pending", "running", "action_required") }
    val failedTasks = state.tasks.count { it.status == "failed" }
    val actionTasks = state.actionRequiredTasks
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
    val filteredTasks = remember(filter, state.tasks) {
        val sorted = state.tasks.sortedWith(compareBy<PlatformTask> { taskPriority(it.status) }.thenByDescending { it.updatedAt.orEmpty() })
        when (filter) {
            "action" -> sorted.filter { it.status in setOf("action_required", "failed") }
            "running" -> sorted.filter { it.status in setOf("pending", "running") }
            "done" -> sorted.filter { it.status in setOf("succeeded", "cancelled") }
            else -> sorted
        }
    }
    val selected = state.tasks.firstOrNull { it.id == selectedId }

    LaunchedEffect(focusTaskId, state.tasks) {
        if (!focusTaskId.isNullOrBlank() && state.tasks.any { it.id == focusTaskId }) {
            filter = "all"
            selectedId = focusTaskId
            onFocusConsumed()
        }
    }
    LaunchedEffect(selectedId) {
        decisionNote = ""
        pendingDecision = null
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
        item(key = "operations-header", contentType = "header") {
            ImmersiveHeader(
                title = "系统",
                subtitle = "巡检、任务、发布与备份",
            )
        }
        state.sectionError?.let { message ->
            item(key = "section-error") { FeedbackBanner("部分工具数据暂不可用：$message", error = true) }
        }
        item(key = "maintenance-title", contentType = "section") {
            SectionHeader("客户端维护", "网络连通性、本地缓存、全量同步与运行诊断")
        }
        item(key = "maintenance", contentType = "card") {
            AppPanel {
                Column {
                    OperationsMaintenanceRow(
                        icon = Icons.Outlined.Wifi,
                        iconTint = Color(0xFF0284C7),
                        iconBackground = Color(0xFFE0F2FE),
                        title = "远程服务器连通性",
                        subtitle = state.networkHealth.message
                            ?: state.networkHealth.gatewayUrl.ifBlank { "测量 DNS 解析与 API 响应延迟" },
                        busy = state.networkHealth.status == "measuring",
                        onClick = onMeasureNetwork,
                        trailing = networkStatusLabel(state.networkHealth.status),
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    OperationsMaintenanceRow(
                        icon = Icons.Outlined.CleaningServices,
                        iconTint = Color(0xFF059669),
                        iconBackground = Color(0xFFECFDF5),
                        title = "清理临时快照缓存",
                        subtitle = "已占用 ${state.cacheStorageInfo.totalFormatted} · 保留登录状态",
                        onClick = { confirmClearCache = true },
                        trailing = "清理",
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    OperationsMaintenanceRow(
                        icon = Icons.Outlined.CloudSync,
                        iconTint = Color(0xFF0284C7),
                        iconBackground = Color(0xFFE0F2FE),
                        title = "强制全量重新同步",
                        subtitle = "从远程服务器重新拉取全部模块最新数据",
                        onClick = {
                            onForceFullSync()
                            Toast.makeText(context, "正在全量重新同步数据...", Toast.LENGTH_SHORT).show()
                        },
                        trailing = "同步",
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    OperationsMaintenanceRow(
                        icon = Icons.Outlined.Assessment,
                        iconTint = Color(0xFF475569),
                        iconBackground = Color(0xFFF1F5F9),
                        title = "导出客户端运行诊断",
                        subtitle = "生成已脱敏的设备、网络与会话摘要",
                        onClick = { showDiagnosticDialog = onGenerateDiagnosticReport() },
                        trailing = "导出",
                    )
                }
            }
        }
        item(key = "diagnostics-title", contentType = "section") { SectionHeader("所有者巡检", "服务、告警、设备、备份与资源续期的一站式检查") }
        item(key = "diagnostics", contentType = "card") {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MetricCell("健康服务", "$healthyServices/$monitoredServices", Modifier.weight(1f), if (state.overview != null && healthyServices == monitoredServices) Forest else Amber)
                        MetricCell("活动告警", activeIncidents.toString(), Modifier.weight(1f), if (activeIncidents == 0) Forest else Coral)
                        MetricCell("在线设备", "$onlineDevices/$totalDevices", Modifier.weight(1f), if (state.iot != null && onlineDevices == totalDevices) Forest else Amber)
                        MetricCell("即将到期", upcomingResources.size.toString(), Modifier.weight(1f), if (upcomingResources.isEmpty()) Forest else Amber)
                    }
                    AppDialogPrimaryButton(
                        text = if (state.busyAction == "diagnostics") "巡检进行中..." else "立即运行一键巡检",
                        onClick = onRunDiagnostics,
                        enabled = state.busyAction == null,
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
        item(key = "task-metrics", contentType = "card") {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                shadowElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    MetricCell("执行中", activeTasks.toString(), Modifier.weight(1f), Ocean)
                    MetricCell("失败", failedTasks.toString(), Modifier.weight(1f), if (failedTasks > 0) Coral else Forest)
                    MetricCell("待处理", actionTasks.size.toString(), Modifier.weight(1f), if (actionTasks.isEmpty()) Forest else Amber)
                }
            }
        }

        item(key = "resources-title", contentType = "section") { SectionHeader("资源与续期", "域名、证书和个人资源的到期提醒") }
        if (upcomingResources.isEmpty()) {
            item(key = "resources-empty", contentType = "empty") { EmptyBlock("近期没有资源到期", "已登记资源会按照各自提前提醒天数显示在这里。") }
        } else {
            items(upcomingResources.take(6), key = { "resource:${it.first.id}" }, contentType = { "resource" }) { (resource, days) ->
                AppPanel {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        IconTile(Icons.Outlined.ErrorOutline, if (days <= 7) Coral else Amber, if (days <= 7) CoralPale else AmberPale)
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
                            color = if (days <= 7) Coral else Amber,
                        )
                    }
                }
            }
        }

        item(key = "tasks-title", contentType = "section") { SectionHeader("平台任务", "失败任务、配置执行与运行记录") }
        item(key = "task-filter", contentType = "filter") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "action" to "待处理",
                    "running" to "进行中",
                    "done" to "已完成",
                    "all" to "全部",
                ).forEach { (key, label) ->
                    FilterChip(
                        selected = filter == key,
                        onClick = { filter = key },
                        label = { Text(label) },
                    )
                }
            }
        }
        if (filteredTasks.isEmpty()) {
            item(key = "tasks-empty", contentType = "empty") {
                AppPanel {
                    EmptyBlock(
                        if (filter == "action") "暂无待处理任务" else "暂无任务",
                        if (filter == "action") "配置审批、失败任务和需跟进事项会显示在这里" else "新的平台任务将在这里显示",
                    )
                }
            }
        } else {
            items(
                items = filteredTasks,
                key = { it.id },
                contentType = { "task" },
            ) { task ->
                AppPanel {
                    TaskRow(
                        task = task,
                        onClick = { selectedId = task.id },
                    )
                }
            }
        }

        item(key = "releases-title", contentType = "section") { SectionHeader("发布摘要", "只读状态，正式发布请在桌面控制台执行") }
        item(key = "releases", contentType = "card") {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val latestBuild = state.releases?.builds?.firstOrNull()
                    val latestDeployment = state.releases?.deployments?.firstOrNull()
                    SummaryLine("最近构建", latestBuild?.revision?.ifBlank { latestBuild.id } ?: "暂无构建", latestBuild?.conclusion)
                    SummaryLine("最近部署", latestDeployment?.action ?: "暂无部署", latestDeployment?.status)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusBadge(
                            if (state.releases?.actionsEnabled == true) "healthy" else "unknown",
                            if (state.releases?.actionsEnabled == true) "发布已启用" else "只读模式",
                        )
                        StatusBadge(
                            if (state.releases?.runnerConnected == true) "healthy" else "unknown",
                            if (state.releases?.runnerConnected == true) "执行器在线" else "执行器未连接",
                        )
                    }
                }
            }
        }

        item { SectionHeader("备份健康", "可触发备份，恢复操作保留在桌面控制台") }
        item {
            val backup = state.backup
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(
                            Icons.Outlined.Backup,
                            if (backup?.rpoState == "healthy") Forest else Amber,
                            if (backup?.rpoState == "healthy") MintPale else AmberPale,
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
                            text = if (state.busyAction == "backup") "备份提交中..." else "立即备份",
                            onClick = { confirmBackup = true },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

    }
    }

    selected?.let { task ->
        val changeId = task.sourceId ?: task.id.removePrefix("configuration:")
        val canDecide = task.source == "configuration" &&
            task.status == "action_required" &&
            canApproveConfig &&
            changeId.isNotBlank()
        AppDialog(
            onDismissRequest = { selectedId = null },
            icon = if (task.status in setOf("failed", "action_required")) Icons.Outlined.ErrorOutline else Icons.Outlined.TaskAlt,
            iconTint = if (task.status in setOf("failed", "action_required")) MaterialTheme.colorScheme.error else Ocean,
            title = task.title,
            content = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatusBadge(task.status, taskStatusLabel(task.status))
                    Text(
                        listOf(taskSourceLabel(task.source), formatPlatformTime(task.updatedAt))
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (task.detail.isNotBlank()) {
                        Text(task.detail, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (task.source == "incident") {
                        val incidentId = task.sourceId ?: task.id.removePrefix("incident:")
                        AppDialogPrimaryButton(
                            text = "打开关联事件",
                            onClick = {
                                selectedId = null
                                onOpenIncident(incidentId)
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (canDecide) {
                        DialogTextField(
                            value = decisionNote,
                            onValueChange = { decisionNote = it.take(200) },
                            label = "执行备注（可选）",
                            minLines = 2,
                            maxLines = 3,
                        )
                        AppDialogPrimaryButton(
                            text = if (state.busyAction == "config-approve") "执行中..." else "确认变更并生效",
                            onClick = { pendingDecision = "approve" },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppDialogDangerButton(
                            text = if (state.busyAction == "config-reject") "处理中..." else "放弃此次变更",
                            onClick = { pendingDecision = "reject" },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else if (task.source == "configuration" && task.status == "action_required") {
                        Text(
                            "配置生效需要所有者的超级管理员身份。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else if (task.source in setOf("release_build", "release_deployment")) {
                        Text(
                            "发布构建与部署仅支持查看；正式操作请在桌面控制台完成。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
            footer = {
                AppDialogPrimaryButton(
                    text = "完成",
                    onClick = { selectedId = null },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
        )

        when (pendingDecision) {
            "approve" -> AppConfirmDialog(
                title = "确认应用配置变更？",
                detail = "确认后将立即生成新配置版本并应用到运行参数，操作会写入审计记录。\n${task.detail}",
                confirmLabel = "确认并生效",
                onDismiss = { pendingDecision = null },
                onConfirm = {
                    pendingDecision = null
                    selectedId = null
                    onApproveConfiguration(changeId, decisionNote.trim())
                },
                icon = Icons.AutoMirrored.Outlined.FactCheck,
            )
            "reject" -> AppConfirmDialog(
                title = "放弃此次配置变更？",
                detail = "放弃后当前运行配置保持不变，提案将结束。\n${task.detail}",
                confirmLabel = "确认放弃",
                onDismiss = { pendingDecision = null },
                onConfirm = {
                    pendingDecision = null
                    selectedId = null
                    onRejectConfiguration(changeId, decisionNote.trim())
                },
                icon = Icons.Outlined.ErrorOutline,
            )
        }
    }

    if (confirmBackup) {
        AppConfirmDialog(
            title = "立即执行平台备份？",
            detail = "备份任务将由内网数据执行器后台运行，不会对现有数据进行覆盖或删除操作。",
            confirmLabel = "确认备份",
            onDismiss = { confirmBackup = false },
            onConfirm = {
                confirmBackup = false
                onTriggerBackup()
            },
            icon = Icons.Outlined.Backup,
        )
    }

    if (confirmClearCache) {
        AppConfirmDialog(
            title = "清理本地临时缓存？",
            detail = "将清理离线响应快照与临时缓存，释放存储空间。登录凭据与账号配置不受影响。",
            confirmLabel = "立即清理",
            onDismiss = { confirmClearCache = false },
            onConfirm = {
                confirmClearCache = false
                onClearCache()
                Toast.makeText(context, "本地快照缓存已清理", Toast.LENGTH_SHORT).show()
            },
            icon = Icons.Outlined.CleaningServices,
        )
    }

    showDiagnosticDialog?.let { report ->
        AppDialog(
            onDismissRequest = { showDiagnosticDialog = null },
            icon = Icons.Outlined.Assessment,
            iconTint = Color(0xFF475569),
            iconBackground = Color(0xFFF1F5F9),
            title = "客户端运行诊断报告",
            subtitle = "已脱敏运行摘要",
            content = {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = report,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(12.dp),
                        maxLines = 12,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            },
            footer = {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { showDiagnosticDialog = null },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                    ) { Text("关闭") }
                    Button(
                        onClick = {
                            clipboardManager.setText(AnnotatedString(report))
                            Toast.makeText(context, "诊断报告已复制到剪贴板", Toast.LENGTH_SHORT).show()
                            showDiagnosticDialog = null
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text("复制报告", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            },
        )
    }
}

@Composable
private fun OperationsMaintenanceRow(
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
            IconTile(icon, iconTint, iconBackground, modifier = Modifier.size(38.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (busy) {
                androidx.compose.material3.CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = iconTint)
            } else {
                Text(trailing, style = MaterialTheme.typography.labelLarge, color = iconTint, fontWeight = FontWeight.Bold)
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

@Composable
private fun TaskRow(task: PlatformTask, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        val failed = task.status in setOf("failed", "action_required")
        IconTile(
            if (failed) Icons.Outlined.ErrorOutline else Icons.Outlined.TaskAlt,
            if (failed) Coral else Ocean,
            if (failed) CoralPale else OceanPale,
            modifier = Modifier.size(38.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(task.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(taskSourceLabel(task.source), task.requestedBy, formatPlatformTime(task.updatedAt)).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (task.detail.isNotBlank()) {
                Text(
                    task.detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        StatusBadge(task.status, taskStatusLabel(task.status))
    }
}

@Composable
private fun SummaryLine(label: String, value: String, status: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        status?.let { StatusBadge(it, releaseStatusLabel(it)) }
    }
}

private fun taskPriority(status: String): Int = when (status) {
    "failed", "action_required" -> 0
    "running" -> 1
    "pending" -> 2
    else -> 3
}

private fun taskStatusLabel(status: String): String = when (status) {
    "pending" -> "等待"
    "running" -> "执行中"
    "succeeded" -> "完成"
    "failed" -> "失败"
    "action_required" -> "待处理"
    "cancelled" -> "已取消"
    else -> status
}

private fun taskSourceLabel(source: String): String = when (source) {
    "backup" -> "数据备份"
    "release_build" -> "发布构建"
    "release_deployment" -> "发布部署"
    "notification" -> "通知任务"
    "incident" -> "告警事件"
    "configuration" -> "配置审批"
    else -> source
}

private fun releaseStatusLabel(status: String): String = when (status.lowercase()) {
    "success", "succeeded", "completed" -> "成功"
    "failed", "failure" -> "失败"
    "running", "in_progress", "queued" -> "进行中"
    "rolled_back" -> "已回滚"
    else -> status.ifBlank { "未知" }
}
