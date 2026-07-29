package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
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
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest

@Composable
fun EventsScreen(
    state: AppUiState,
    contentPadding: PaddingValues,
    onAcknowledge: (String) -> Unit,
) {
    var filter by remember { mutableStateOf("active") }
    var selected by remember { mutableStateOf<IncidentInfo?>(null) }
    val incidents = when (filter) {
        "critical" -> state.incidents.filter { it.severity == "critical" }
        "acknowledged" -> state.incidents.filter { it.status == "acknowledged" }
        else -> state.incidents
    }
    val canOperate = state.user?.role in setOf("operator", "super_admin")

    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("活动事件", state.incidents.size.toString(), Modifier.weight(1f), if (state.incidents.isEmpty()) Forest else Coral)
                    MetricCell("严重", state.incidents.count { it.severity == "critical" }.toString(), Modifier.weight(1f), Coral)
                    MetricCell("已确认", state.incidents.count { it.status == "acknowledged" }.toString(), Modifier.weight(1f), Amber)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("active" to "全部", "critical" to "严重", "acknowledged" to "已确认").forEach { (value, label) ->
                    FilterChip(
                        selected = filter == value,
                        onClick = { filter = value },
                        label = { Text(label) },
                    )
                }
            }
        }
        if (state.overview == null && state.refreshing) {
            item { LoadingBlock("正在读取事件") }
        } else if (incidents.isEmpty()) {
            item {
                AppPanel { EmptyBlock("当前没有活动事件", "平台运行状态保持稳定") }
            }
        } else {
            items(incidents, key = { it.id }) { incident ->
                IncidentCard(
                    incident = incident,
                    canOperate = canOperate,
                    busy = state.busyAction == "incident",
                    onOpen = { selected = incident },
                    onAcknowledge = { onAcknowledge(incident.id) },
                )
            }
        }
    }

    selected?.let { incident ->
        AlertDialog(
            onDismissRequest = { selected = null },
            icon = { Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = if (incident.severity == "critical") Coral else Amber) },
            title = { Text(incident.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(incident.description.ifBlank { "该事件暂无补充描述。" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    HorizontalDivider()
                    DetailLine("状态", incident.status)
                    DetailLine("级别", incident.severity)
                    DetailLine("来源", incident.source)
                    DetailLine("时间", formatPlatformTime(incident.updatedAt ?: incident.openedAt))
                    incident.assignedTo?.let { DetailLine("负责人", it) }
                }
            },
            confirmButton = {
                if (canOperate && incident.status == "open") {
                    Button(
                        onClick = { onAcknowledge(incident.id); selected = null },
                        enabled = state.busyAction != "incident",
                    ) {
                        Text("确认事件")
                    }
                } else {
                    Button(onClick = { selected = null }) { Text("完成") }
                }
            },
            dismissButton = {
                if (canOperate && incident.status == "open") {
                    OutlinedButton(onClick = { selected = null }) { Text("取消") }
                }
            },
        )
    }
}

@Composable
private fun IncidentCard(
    incident: IncidentInfo,
    canOperate: Boolean,
    busy: Boolean,
    onOpen: () -> Unit,
    onAcknowledge: () -> Unit,
) {
    AppPanel(modifier = Modifier.clickable(onClick = onOpen)) {
        Column(modifier = Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                IconTile(Icons.Outlined.NotificationsActive, Coral, CoralPale)
                Column(modifier = Modifier.weight(1f)) {
                    Text(incident.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        "${incident.source} · ${formatPlatformTime(incident.updatedAt ?: incident.openedAt)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(incident.severity, if (incident.severity == "critical") "严重" else "警告")
            }
            if (incident.description.isNotBlank()) {
                Text(
                    incident.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(
                        if (incident.status == "acknowledged") Icons.Outlined.PersonOutline else Icons.Outlined.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        if (incident.status == "acknowledged") "已确认跟进" else "等待处理",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (canOperate && incident.status == "open") {
                    OutlinedButton(onClick = onAcknowledge, enabled = !busy) {
                        if (busy) CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(17.dp))
                        Text("确认", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}
