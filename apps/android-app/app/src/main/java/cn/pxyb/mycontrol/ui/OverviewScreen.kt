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
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
) {
    val overview = state.overview
    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (overview == null) {
            item { LoadingBlock("正在同步平台状态") }
            return@LazyColumn
        }
        item {
            val incidentCount = state.incidents.size
            val stable = incidentCount == 0 && overview.monitoredCount > 0 && overview.healthyCount == overview.monitoredCount
            AppPanel {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(15.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        val progress = if (overview.monitoredCount == 0) 0f
                        else overview.healthyCount.toFloat() / overview.monitoredCount.toFloat()
                        CircularProgressIndicator(
                            progress = progress,
                            modifier = Modifier.size(58.dp),
                            color = if (stable) Forest else Coral,
                            trackColor = if (stable) MintPale else CoralPale,
                            strokeWidth = 6.dp,
                            strokeCap = StrokeCap.Round,
                        )
                        Icon(
                            if (stable) Icons.Outlined.CloudDone else Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = if (stable) Forest else Coral,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            if (stable) "全网运行稳定" else "平台存在待关注事件",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            "${overview.healthyCount}/${overview.monitoredCount} 个受监控服务正常 · ${formatPlatformTime(overview.refreshedAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    StatusBadge(if (stable) "healthy" else "degraded")
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    MetricCell("服务可用", "${overview.healthyCount}/${overview.monitoredCount}", Modifier.weight(1f), Forest)
                    MetricCell("平均响应", overview.averageLatencyMs?.let { "$it ms" } ?: "--", Modifier.weight(1f), Ocean)
                    MetricCell("待处置", state.incidents.size.toString(), Modifier.weight(1f), if (state.incidents.isEmpty()) Forest else Coral)
                }
            }
        }

        if (state.incidents.isNotEmpty()) {
            item {
                SectionHeader("需要关注", "${state.incidents.size} 个活动事件")
            }
            items(state.incidents.take(3), key = { "overview-${it.id}" }) { incident ->
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
                overview.services.sortedWith(compareBy<ServiceInfo> { servicePriority(it.state) }.thenBy { it.name }).forEachIndexed { index, service ->
                    ServiceRow(service)
                    if (index < overview.services.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outline)
                }
            }
        }

        item { SectionHeader("最近活动", "平台审计摘要") }
        item {
            AppPanel {
                if (overview.audits.isEmpty()) {
                    EmptyBlock("暂无活动记录", "平台审计记录将在这里显示")
                } else {
                    overview.audits.take(5).forEachIndexed { index, audit ->
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
                        if (index < overview.audits.take(5).lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(4.dp)) }
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
