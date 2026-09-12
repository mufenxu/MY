package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonInlineRows
import cn.pxyb.mycontrol.ui.components.layout.AppPanel

private val activeSeatReservationStatuses = setOf("RESERVE", "CHECK_IN", "AWAY", "LEAVE_EARLY")

internal fun isActiveSeatReservation(record: LibrarySeatReservationRecord): Boolean =
    record.status.uppercase() in activeSeatReservationStatuses

@Composable
internal fun MySeatReservationsPanel(
    reservations: List<LibrarySeatReservationRecord>,
    loading: Boolean,
    history: LibrarySeatReservationHistory,
    historyLoading: Boolean,
    onLoadReservations: () -> Unit,
    onLoadHistory: () -> Unit,
    onGoToBookSeat: () -> Unit,
) {
    var showHistory by rememberSaveable { mutableStateOf(false) }
    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSectionHeader(
                title = "我的预约记录",
                subtitle = "官方系统同步 · 显示预约成功的座位",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FilterChip(
                    selected = !showHistory,
                    onClick = {
                        if (showHistory) {
                            showHistory = false
                            onLoadReservations()
                        }
                    },
                    label = { Text("今日预约") },
                )
                FilterChip(
                    selected = showHistory,
                    onClick = {
                        if (!showHistory) {
                            showHistory = true
                            onLoadHistory()
                        }
                    },
                    label = { Text("历史预约") },
                )
            }
            val records = if (showHistory) {
                history.records
            } else {
                reservations.sortedWith(
                    compareByDescending<LibrarySeatReservationRecord> { isActiveSeatReservation(it) }
                        .thenBy { it.date }
                        .thenBy { it.startTime },
                )
            }
            val recordsLoading = if (showHistory) historyLoading else loading
            when {
                recordsLoading -> AppSkeletonInlineRows(
                    rowCount = 3,
                    leadingSize = 30.dp,
                    lineWidths = listOf(0.32f, 0.58f),
                )
                records.isEmpty() -> AppEmptyState(
                    if (showHistory) "暂无历史预约记录" else "今日暂无预约记录",
                    detail = if (showHistory) "历史预约成功的座位会显示在这里" else "预约成功后会自动显示在这里",
                )
                else -> {
                    if (showHistory && history.total > records.size) {
                        Text(
                            text = "共 ${history.total} 条历史记录，仅显示最近 ${records.size} 条",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        records.forEach { record ->
                            SeatReservationRecordCard(record)
                        }
                    }
                }
            }
            AppSecondaryButton(
                text = "返回查询座位",
                icon = Icons.Outlined.Search,
                onClick = onGoToBookSeat,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun SeatReservationRecordCard(record: LibrarySeatReservationRecord) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (record.seatLabel.isNotBlank()) "${record.seatLabel}号座位" else "座位预约",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = record.statusText,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (isActiveSeatReservation(record)) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
            val location = record.location.takeIf(String::isNotBlank)
                ?: listOfNotNull(record.buildName, record.floorName, record.roomName)
                    .filter(String::isNotBlank)
                    .joinToString("|")
            if (location.isNotBlank()) {
                Text(
                    text = location,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val timeRange = listOf(record.startTime, record.endTime)
                .filter(String::isNotBlank)
                .joinToString("~")
            val schedule = listOf(record.date, timeRange)
                .filter(String::isNotBlank)
                .joinToString("  ")
            if (schedule.isNotBlank()) {
                Text(
                    text = schedule,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (record.receipt.isNotBlank()) {
                Text(
                    text = "凭证号 ${record.receipt}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            record.message.takeIf(String::isNotBlank)?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
