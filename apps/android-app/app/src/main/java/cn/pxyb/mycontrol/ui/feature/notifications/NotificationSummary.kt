package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.ui.components.display.AppMetricCard
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun NotificationSummaryPanel(
    stats: NotificationStats,
    onFilterSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppMetricCard(
            label = "未读",
            value = stats.unread.toString(),
            unit = "条",
            icon = Icons.Outlined.NotificationsActive,
            iconTint = ColorTokens.Blue.foreground,
            iconBackground = ColorTokens.Blue.container,
            modifier = Modifier.weight(1f),
            onClick = { onFilterSelect(NotificationFilter.Unread.id) },
        )
        AppMetricCard(
            label = "今日",
            value = stats.today.toString(),
            unit = "条",
            icon = Icons.Outlined.Schedule,
            iconTint = ColorTokens.Teal.foreground,
            iconBackground = ColorTokens.Teal.container,
            modifier = Modifier.weight(1f),
        )
        AppMetricCard(
            label = "高优先",
            value = stats.urgent.toString(),
            unit = "条",
            icon = Icons.Outlined.Warning,
            iconTint = ColorTokens.Amber.foreground,
            iconBackground = ColorTokens.Amber.container,
            modifier = Modifier.weight(1f),
            onClick = { onFilterSelect(NotificationFilter.Alert.id) },
        )
    }
}

@Composable
internal fun NotificationFilterRow(
    alerts: List<AppAlertRecord>,
    selectedId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val now = System.currentTimeMillis()
    val counts = notificationFilterCounts(alerts, now)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NotificationFilter.entries.forEach { filter ->
            val count = counts[filter] ?: 0
            AppFilterChip(
                label = if (count > 0) "${filter.label} $count" else filter.label,
                selected = filter.id == selectedId,
                onClick = { onSelect(filter.id) },
            )
        }
    }
}

@Composable
internal fun NotificationDayHeader(label: String, count: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 4.dp, top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp, fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        )
        Text(
            text = "$count 条",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            maxLines = 1,
        )
    }
}
