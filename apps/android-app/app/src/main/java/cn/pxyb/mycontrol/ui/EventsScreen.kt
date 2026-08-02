package cn.pxyb.mycontrol.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    onAssign: (String, String) -> Unit,
    onAddNote: (String, String) -> Unit,
    onMute: (String, Int) -> Unit,
    onResolve: (String, String) -> Unit,
    onRefresh: () -> Unit,
) {
    var filter by remember { mutableStateOf("active") }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    var assignee by remember { mutableStateOf("") }
    val activeIncidents = state.activeIncidents
    val incidents = remember(filter, activeIncidents, state.incidents) {
        when (filter) {
            "critical" -> activeIncidents.filter { it.severity == "critical" }
            "acknowledged" -> activeIncidents.filter { it.status == "acknowledged" }
            "resolved" -> state.incidents.filter { it.status == "resolved" }
            else -> activeIncidents
        }
    }
    val selected = state.incidents.firstOrNull { it.id == selectedId }
    val canOperate = state.user?.role in setOf("operator", "super_admin")

    LaunchedEffect(selectedId) {
        note = ""
        assignee = selected?.assignedTo.orEmpty()
    }
    LaunchedEffect(state.message) {
        if (state.message == "处理备注已记录。") note = ""
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            ImmersiveHeader(
                title = "事件中心",
                refreshing = state.refreshing,
                onRefresh = onRefresh
            )
        }
        item {
            AppPanel {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("活动事件", activeIncidents.size.toString(), Modifier.weight(1f), if (activeIncidents.isEmpty()) Forest else Coral)
                    MetricCell("严重", activeIncidents.count { it.severity == "critical" }.toString(), Modifier.weight(1f), Coral)
                    MetricCell("已恢复", state.incidents.count { it.status == "resolved" }.toString(), Modifier.weight(1f), Forest)
                }
            }
        }
        item {
            val counts = remember(activeIncidents, state.incidents) {
                mapOf(
                    "active" to activeIncidents.size,
                    "critical" to activeIncidents.count { it.severity == "critical" },
                    "acknowledged" to activeIncidents.count { it.status == "acknowledged" },
                    "resolved" to state.incidents.count { it.status == "resolved" }
                )
            }
            EventFilter(selected = filter, onSelect = { filter = it }, counts = counts)
        }
        if (state.overview == null && state.refreshing) {
            item { LoadingBlock("正在读取事件") }
        } else if (incidents.isEmpty()) {
            item {
                AppPanel {
                    EmptyBlock(
                        if (filter == "resolved") "暂无已恢复事件" else "当前没有待处理事件",
                        if (filter == "resolved") "已关闭事件将在这里显示" else "平台运行状态保持稳定",
                    )
                }
            }
        } else {
            items(incidents, key = { it.id }, contentType = { "incident" }) { incident ->
                IncidentCard(
                    incident = incident,
                    canOperate = canOperate,
                    busy = state.busyAction == "incident",
                    onOpen = { selectedId = incident.id },
                    onAcknowledge = { onAcknowledge(incident.id) },
                )
            }
        }
    }

    selected?.let { incident ->
        val isCritical = incident.severity == "critical"
        AppDialog(
            onDismissRequest = { selectedId = null },
            icon = Icons.Outlined.ErrorOutline,
            iconTint = if (isCritical) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            iconBackground = if (isCritical) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
            title = incident.title,
            subtitle = incident.description.ifBlank { "该事件暂无补充描述。" },
            content = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 380.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                    DetailLine("状态", incidentStatusLabel(incident.status))
                    DetailLine("级别", if (isCritical) "严重" else "警告")
                    DetailLine("来源", incident.serviceId ?: incident.source)
                    DetailLine("首次发生", formatPlatformTime(incident.firstSeenAt ?: incident.openedAt))
                    DetailLine("最近观测", formatPlatformTime(incident.lastSeenAt ?: incident.updatedAt))
                    incident.assignedTo?.let { DetailLine("负责人", it) }

                    if (incident.timeline.isNotEmpty()) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                        Text("处理记录", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                        incident.timeline.takeLast(8).asReversed().forEach { entry ->
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(entry.message, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "${entry.actor} · ${formatPlatformTime(entry.at)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }

                    if (canOperate && incident.status != "resolved") {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                        DialogTextField(
                            value = assignee,
                            onValueChange = { assignee = it.take(100) },
                            label = "负责人",
                        )
                        AppDialogPrimaryButton(
                            text = "更新负责人",
                            onClick = { onAssign(incident.id, assignee.trim()) },
                            enabled = assignee.isNotBlank() && state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        DialogTextField(
                            value = note,
                            onValueChange = { note = it.take(500) },
                            label = "处理备注",
                            minLines = 2,
                            maxLines = 4,
                        )
                        AppDialogPrimaryButton(
                            text = "记录备注",
                            onClick = { onAddNote(incident.id, note.trim()) },
                            enabled = note.isNotBlank() && state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        if (incident.status == "open") {
                            AppDialogPrimaryButton(
                                text = "确认并开始跟进",
                                onClick = { onAcknowledge(incident.id) },
                                enabled = state.busyAction == null,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        AppDialogSecondaryButton(
                            text = "静默 1 小时",
                            onClick = { onMute(incident.id, 60) },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppDialogDangerButton(
                            text = "关闭事件",
                            onClick = { onResolve(incident.id, note.trim()) },
                            enabled = state.busyAction == null,
                            modifier = Modifier.fillMaxWidth(),
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
    }
}

@Composable
private fun EventFilter(
    selected: String,
    onSelect: (String) -> Unit,
    counts: Map<String, Int> = emptyMap(),
) {
    val options = remember {
        listOf(
            "active" to "待处理",
            "critical" to "严重",
            "acknowledged" to "已确认",
            "resolved" to "已恢复"
        )
    }
    val selectedIndex = options.indexOfFirst { it.first == selected }.coerceAtLeast(0)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .background(Color(0xFFF1F5F9), RoundedCornerShape(16.dp))
            .padding(3.dp)
    ) {
        BoxWithConstraints(
            modifier = Modifier.fillMaxWidth()
        ) {
            val totalWidth = maxWidth
            val segmentWidth = totalWidth / options.size

            // 极速横向平滑滑块动画
            val indicatorOffset by animateDpAsState(
                targetValue = segmentWidth * selectedIndex,
                animationSpec = spring(
                    stiffness = Spring.StiffnessHigh,
                    dampingRatio = Spring.DampingRatioNoBouncy
                ),
                label = "filter_indicator_offset"
            )

            // 纯白明亮滑块（零阴影、零暗色遮罩）
            Box(
                modifier = Modifier
                    .offset(x = indicatorOffset)
                    .size(width = segmentWidth, height = 38.dp)
                    .background(Color.White, RoundedCornerShape(13.dp))
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                options.forEachIndexed { index, (value, label) ->
                    val active = selectedIndex == index
                    val textColor = when {
                        active && value == "critical" -> Color(0xFFDC2626)
                        active -> MaterialTheme.colorScheme.primary
                        else -> Color(0xFF64748B)
                    }

                    // 使用 indication = null 彻底禁用 Compose 点击时变暗的水波纹
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = { onSelect(value) }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelLarge.copy(
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 13.sp
                                ),
                                color = textColor
                            )
                            val count = counts[value]
                            if (count != null && count > 0) {
                                Box(
                                    modifier = Modifier
                                        .padding(start = 4.dp)
                                        .background(
                                            color = if (active) {
                                                if (value == "critical") Color(0xFFFEE2E2) else Color(0xFFEFF6FF)
                                            } else Color(0xFFE2E8F0),
                                            shape = CircleShape
                                        )
                                        .padding(horizontal = 6.dp, vertical = 1.dp)
                                ) {
                                    Text(
                                        text = count.toString(),
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 10.sp
                                        ),
                                        color = if (active) {
                                            if (value == "critical") Color(0xFFDC2626) else MaterialTheme.colorScheme.primary
                                        } else Color(0xFF64748B)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
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
                    IconTile(
                        Icons.Outlined.NotificationsActive,
                        if (incident.severity == "critical") Coral else Amber,
                        if (incident.severity == "critical") CoralPale else CoralPale.copy(alpha = 0.5f)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            incident.title,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
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
                            incidentStatusLabel(incident.status),
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (canOperate && incident.status == "open") {
                        Button(
                            onClick = onAcknowledge,
                            enabled = !busy,
                            shape = MaterialTheme.shapes.medium,
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            if (busy) CircularProgressIndicator(Modifier.size(15.dp), strokeWidth = 2.dp, color = Color.White)
                            else Icon(Icons.Outlined.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text("确认", modifier = Modifier.padding(start = 5.dp), fontSize = 13.sp)
                        }
                    }
                }
        }
    }
}

private fun incidentStatusLabel(status: String): String = when (status) {
    "acknowledged" -> "已确认跟进"
    "resolved" -> "已恢复"
    "open" -> "等待处理"
    else -> status
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}
