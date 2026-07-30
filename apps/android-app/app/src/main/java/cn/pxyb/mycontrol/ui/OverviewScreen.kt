package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.ServiceInfo
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

@Composable
fun OverviewScreen(
    state: AppUiState,
    contentPadding: PaddingValues,
    onSelectTab: (MainTab) -> Unit,
    onRefresh: () -> Unit,
) {
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
    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ImmersiveHeader(
                title = "运行总览",
                refreshing = state.refreshing,
                onRefresh = onRefresh
            )
        }
        if (overview == null) {
            item { OverviewSyncPanel(refreshing = state.refreshing) }
            return@LazyColumn
        }
        item {
            val incidentCount = activeIncidents.size
            val stable = incidentCount == 0 && monitoredCount > 0 && healthyCount == monitoredCount
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shadowElevation = 0.dp,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 22.dp)
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
                                    modifier = Modifier.size(62.dp),
                                    color = if (stable) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.tertiary,
                                    trackColor = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.14f),
                                    strokeWidth = 6.dp,
                                    strokeCap = StrokeCap.Round,
                                )
                                Icon(
                                    if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(26.dp),
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (stable) "全网运行稳定" else "平台存在待关注事件",
                                    style = MaterialTheme.typography.headlineMedium.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 20.sp
                                    ),
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                                Text(
                                    "$healthyCount/$monitoredCount 个监控服务正常 · ${formatPlatformTime(overview.refreshedAt)}",
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.72f),
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                        HorizontalDivider(
                            modifier = Modifier.padding(top = 18.dp),
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.14f),
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            HeroMetric("服务可用", "$healthyCount/$monitoredCount", Modifier.weight(1f))
                            HeroMetric("平均响应", averageLatencyMs?.let { "$it ms" } ?: "--", Modifier.weight(1f))
                            HeroMetric("待处置", activeIncidents.size.toString(), Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        if (activeIncidents.isNotEmpty()) {
            item {
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

        item { SectionHeader("服务状态", "来自平台服务端监测") }
        item {
            AppPanel {
                sortedServices.forEachIndexed { index, service ->
                    ServiceRow(service)
                    if (index < sortedServices.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }

        item { SectionHeader("最近活动", "平台审计摘要") }
        item {
            AppPanel {
                if (overview.audits.isEmpty()) {
                    EmptyBlock("暂无活动记录", "平台审计记录将在这里显示")
                } else {
                    recentAudits.forEachIndexed { index, audit ->
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
                        if (index < recentAudits.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(4.dp)) }
    }
}

@Composable
private fun OverviewSyncPanel(refreshing: Boolean) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        shape = MaterialTheme.shapes.medium,
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
    val contentColor = LocalContentColor.current
    Column(modifier = modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = contentColor.copy(alpha = 0.68f))
        Text(value, style = MaterialTheme.typography.titleLarge, color = contentColor, modifier = Modifier.padding(top = 3.dp))
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

private fun servicePriority(state: String): Int = when (state) {
    "offline" -> 0
    "degraded" -> 1
    "healthy" -> 2
    else -> 3
}
