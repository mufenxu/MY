package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DataObject
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
    state: AppUiState,
    contentPadding: PaddingValues,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
) {
    var confirmBackup by remember { mutableStateOf(false) }
    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val activeTasks = state.tasks.count { it.status in setOf("pending", "running", "action_required") }
    val failedTasks = state.tasks.count { it.status == "failed" }

    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("执行中", activeTasks.toString(), Modifier.weight(1f), Ocean)
                    MetricCell("失败", failedTasks.toString(), Modifier.weight(1f), if (failedTasks > 0) Coral else Forest)
                    MetricCell("已完成", state.tasks.count { it.status == "succeeded" }.toString(), Modifier.weight(1f), Forest)
                }
            }
        }

        item { SectionHeader("统一任务", "跨服务执行状态") }
        item {
            AppPanel {
                if (state.tasks.isEmpty()) {
                    EmptyBlock("暂无任务", "新的平台任务将在这里显示")
                } else {
                    state.tasks.sortedBy { taskPriority(it.status) }.take(6).forEachIndexed { index, task ->
                        TaskRow(task)
                        if (index < state.tasks.take(6).lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }

        item { SectionHeader("发布状态", "受控构建与部署记录") }
        item {
            val latestBuild = state.releases?.builds?.firstOrNull()
            val latestDeployment = state.releases?.deployments?.firstOrNull()
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(Icons.Outlined.RocketLaunch, Ocean, OceanPale)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("最近构建", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                latestBuild?.revision?.take(10)?.ifBlank { latestBuild.id.take(10) } ?: "暂无构建记录",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(formatPlatformTime(latestBuild?.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        latestBuild?.let { StatusBadge(it.conclusion, releaseStatusLabel(it.conclusion)) }
                    }
                    HorizontalDivider()
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(Icons.Outlined.CloudSync, Forest, MintPale)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("最近部署", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                latestDeployment?.components?.joinToString("、")?.ifBlank { "平台组件" } ?: "暂无部署记录",
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(formatPlatformTime(latestDeployment?.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        latestDeployment?.let { StatusBadge(it.status, releaseStatusLabel(it.status)) }
                    }
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

        item { SectionHeader("数据备份", "恢复操作保留在桌面控制台") }
        item {
            val backup = state.backup
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(
                            Icons.Outlined.Backup,
                            if (backup?.rpoState == "healthy") Forest else Amber,
                            if (backup?.rpoState == "healthy") MintPale else AmberPale,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(backup?.latestName ?: "尚无可恢复备份", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                backup?.ageHours?.let { "距今 ${"%.1f".format(it)} 小时 · RPO ${backup.rpoHours} 小时" }
                                    ?: "等待备份质量数据",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        StatusBadge(backup?.rpoState ?: "unknown", if (backup?.rpoState == "healthy") "RPO 正常" else "需检查")
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        MetricCell("有效备份", backup?.validBackups?.toString() ?: "--", Modifier.weight(1f))
                        MetricCell(
                            "异地备份",
                            when {
                                backup?.offsiteConfigured != true -> "未配置"
                                backup.offsiteHealthy == true -> "正常"
                                else -> "异常"
                            },
                            Modifier.weight(1f),
                        )
                    }
                    Button(
                        onClick = { confirmBackup = true },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = canOperate && backup?.canBackup == true && state.busyAction == null,
                    ) {
                        if (state.busyAction == "backup") CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.Backup, contentDescription = null, modifier = Modifier.size(19.dp))
                        Text("立即备份", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }

        item { SectionHeader("系统自检", "网关、服务和关键依赖") }
        item {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(Icons.Outlined.FactCheck, Ocean, OceanPale)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("端到端检查", style = MaterialTheme.typography.titleMedium)
                            Text(
                                state.diagnostics?.checkedAt?.let(::formatPlatformTime) ?: "尚未在本次会话运行",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        FilledTonalButton(
                            onClick = onRunDiagnostics,
                            enabled = canOperate && state.busyAction == null,
                        ) {
                            if (state.busyAction == "diagnostics") CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            else Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("运行", modifier = Modifier.padding(start = 5.dp))
                        }
                    }
                    state.diagnostics?.checks?.forEach { check ->
                        HorizontalDivider()
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(
                                if (check.status == "passed") Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline,
                                contentDescription = null,
                                tint = if (check.status == "passed") Forest else Coral,
                                modifier = Modifier.size(19.dp),
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(check.label, style = MaterialTheme.typography.bodyMedium)
                                Text(check.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            StatusBadge(check.status)
                        }
                    }
                }
            }
        }
    }

    if (confirmBackup) {
        AlertDialog(
            onDismissRequest = { confirmBackup = false },
            icon = { Icon(Icons.Outlined.Backup, contentDescription = null) },
            title = { Text("立即执行平台备份？") },
            text = { Text("备份任务将由内网执行器运行，不会执行恢复或删除操作。") },
            confirmButton = {
                Button(onClick = { confirmBackup = false; onTriggerBackup() }) { Text("确认备份") }
            },
            dismissButton = {
                OutlinedButton(onClick = { confirmBackup = false }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun TaskRow(task: PlatformTask) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
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
        }
        StatusBadge(task.status, taskStatusLabel(task.status))
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
