package cn.pxyb.mycontrol.ui

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
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Composable
fun OperationsScreen(
    state: OperationsUiState,
    contentPadding: PaddingValues,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenNotifications: () -> Unit,
    onMeasureNetwork: () -> Unit,
    onRefresh: () -> Unit,
) {
    var confirmBackup by remember { mutableStateOf(false) }
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
            item(key = "status-header", contentType = "header") {
                ImmersiveHeader(
                    title = "状态",
                    subtitle = "系统健康、提醒与必要维护",
                )
            }

            state.sectionError?.let { message ->
                item(key = "section-error", contentType = "banner") {
                    FeedbackBanner("部分状态数据暂不可用：$message", error = true)
                }
            }

            item(key = "overview-title", contentType = "section") {
                SectionHeader("系统概览", "只保留日常需要关注的结论")
            }
            item(key = "overview", contentType = "card") {
                AppPanel {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MetricCell(
                            "健康服务",
                            "$healthyServices/$monitoredServices",
                            Modifier.weight(1f),
                            if (state.overview != null && healthyServices == monitoredServices) Forest else Amber,
                        )
                        MetricCell(
                            "活动问题",
                            activeIncidents.toString(),
                            Modifier.weight(1f),
                            if (activeIncidents == 0) Forest else Coral,
                        )
                        MetricCell(
                            "在线设备",
                            "$onlineDevices/$totalDevices",
                            Modifier.weight(1f),
                            if (state.iot != null && onlineDevices == totalDevices) Forest else Amber,
                        )
                        MetricCell(
                            "即将到期",
                            upcomingResources.size.toString(),
                            Modifier.weight(1f),
                            if (upcomingResources.isEmpty()) Forest else Amber,
                        )
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
                            iconTint = if (state.unreadAlerts == 0) Forest else Coral,
                            iconBackground = if (state.unreadAlerts == 0) MintPale else CoralPale,
                            title = "通知中心",
                            subtitle = if (state.unreadAlerts == 0) "当前没有未读提醒" else "${state.unreadAlerts} 条未读提醒需要查看",
                            onClick = onOpenNotifications,
                            trailing = "查看",
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                        OperationsStatusRow(
                            icon = Icons.Outlined.Wifi,
                            iconTint = Ocean,
                            iconBackground = Color(0xFFE0F2FE),
                            title = "远程服务器连通性",
                            subtitle = state.networkHealth.message
                                ?: state.networkHealth.gatewayUrl.ifBlank { "测量 DNS 解析与 API 响应延迟" },
                            busy = state.networkHealth.status == "measuring",
                            onClick = onMeasureNetwork,
                            trailing = networkStatusLabel(state.networkHealth.status),
                        )
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

            item(key = "resources-title", contentType = "section") {
                SectionHeader("资源与续期", "域名、证书和个人资源的到期提醒")
            }
            if (upcomingResources.isEmpty()) {
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
                                if (days <= 7) Coral else Amber,
                                if (days <= 7) CoralPale else AmberPale,
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
                                color = if (days <= 7) Coral else Amber,
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
                androidx.compose.material3.CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = iconTint,
                )
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
