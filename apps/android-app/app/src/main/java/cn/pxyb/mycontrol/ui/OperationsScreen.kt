package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

@Composable
fun OperationsScreen(
    state: OperationsUiState,
    contentPadding: PaddingValues,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onApproveConfiguration: (String, String) -> Unit,
    onRejectConfiguration: (String, String) -> Unit,
    onOpenIncident: (String) -> Unit,
    focusTaskId: String?,
    onFocusConsumed: () -> Unit,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(enabled = true, onBack = onBack)
    var confirmBackup by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf("action") }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var decisionNote by remember { mutableStateOf("") }
    var pendingDecision by remember { mutableStateOf<String?>(null) }

    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val canApproveConfig = state.user?.role == "super_admin"
    val activeTasks = state.tasks.count { it.status in setOf("pending", "running", "action_required") }
    val failedTasks = state.tasks.count { it.status == "failed" }
    val actionTasks = state.actionRequiredTasks
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

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = appPageContentPadding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppSecondaryHeader(
                title = "高级工具",
                subtitle = "任务、审批、发布与备份",
                onBack = onBack,
                refreshing = state.refreshing,
                onRefresh = onRefresh,
            )
        }
        state.sectionError?.let { message ->
            item { FeedbackBanner("部分工具数据暂不可用：$message", error = true) }
        }
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("执行中", activeTasks.toString(), Modifier.weight(1f), Ocean)
                    MetricCell("失败", failedTasks.toString(), Modifier.weight(1f), if (failedTasks > 0) Coral else Forest)
                    MetricCell("待处理", actionTasks.size.toString(), Modifier.weight(1f), if (actionTasks.isEmpty()) Forest else Amber)
                }
            }
        }

        item { SectionHeader("平台任务", "任务执行状态与变更审批") }
        item {
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
            item {
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

        item { SectionHeader("发布摘要", "只读状态，正式发布请在桌面控制台执行") }
        item {
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

        item { SectionHeader("系统自检", "快速验证关键链路") }
        item {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppDialogSecondaryButton(
                        text = if (state.busyAction == "diagnostics") "自检进行中..." else "运行系统自检",
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
                        listOf(taskSourceLabel(task.source), task.requestedBy, formatPlatformTime(task.updatedAt))
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
                            label = "审批备注（可选）",
                            minLines = 2,
                            maxLines = 3,
                        )
                        AppDialogPrimaryButton(
                            text = if (state.busyAction == "config-approve") "审批中..." else "批准并生效",
                            onClick = { pendingDecision = "approve" },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppDialogDangerButton(
                            text = if (state.busyAction == "config-reject") "拒绝中..." else "拒绝提案",
                            onClick = { pendingDecision = "reject" },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else if (task.source == "configuration" && task.status == "action_required") {
                        Text(
                            "配置审批需要超级管理员角色。",
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
                title = "批准配置变更？",
                detail = "批准后将立即生成新配置版本并应用到运行参数。\n${task.detail}",
                confirmLabel = "确认批准",
                onDismiss = { pendingDecision = null },
                onConfirm = {
                    pendingDecision = null
                    selectedId = null
                    onApproveConfiguration(changeId, decisionNote.trim())
                },
                icon = Icons.AutoMirrored.Outlined.FactCheck,
            )
            "reject" -> AppConfirmDialog(
                title = "拒绝配置提案？",
                detail = "拒绝后当前运行配置保持不变。\n${task.detail}",
                confirmLabel = "确认拒绝",
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
