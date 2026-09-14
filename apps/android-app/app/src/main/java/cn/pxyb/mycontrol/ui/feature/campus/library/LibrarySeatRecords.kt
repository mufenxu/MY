package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatBreachPage
import cn.pxyb.mycontrol.data.LibrarySeatBreachRecord
import cn.pxyb.mycontrol.data.LibrarySeatDoorLog
import cn.pxyb.mycontrol.data.LibrarySeatMakeLife
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonInlineRows
import cn.pxyb.mycontrol.ui.components.layout.AppPanel

private val activeSeatReservationStatuses = setOf("RESERVE", "CHECK_IN", "AWAY", "LEAVE_EARLY")

internal fun isActiveSeatReservation(record: LibrarySeatReservationRecord): Boolean =
    record.status.uppercase() in activeSeatReservationStatuses

private val secondFloorMarkers = listOf("二层", "二楼", "2层", "2楼")

/**
 * 二层 1-45 号座位在座位图中按行优先排列，只有落在这个范围的预约才显示位置图。
 */
private fun secondFloorSeatMapLabel(record: LibrarySeatReservationRecord): Int? {
    val label = record.seatLabel.trim().toIntOrNull() ?: return null
    if (label !in 1..45) return null
    val onSecondFloor = listOf(record.floorName, record.roomName, record.location)
        .any { text -> secondFloorMarkers.any { marker -> text.contains(marker) } }
    return if (onSecondFloor) label else null
}

private enum class SeatRecordTab(val label: String) {
    Today("今日预约"),
    History("历史预约"),
    Breach("违约记录"),
    DoorLog("门禁记录"),
}

@Composable
internal fun MySeatReservationsPanel(
    reservations: List<LibrarySeatReservationRecord>,
    loading: Boolean,
    history: LibrarySeatReservationHistory,
    historyLoading: Boolean,
    currentUse: LibrarySeatReservationRecord?,
    currentUseLoading: Boolean,
    breaches: LibrarySeatBreachPage,
    breachesLoading: Boolean,
    doorLogs: List<LibrarySeatDoorLog>,
    doorLogsLoading: Boolean,
    makeLife: List<LibrarySeatMakeLife>,
    makeLifeLoading: Boolean,
    makeLifeReservationId: String,
    usageAction: LibrarySeatUsageAction?,
    onLoadReservations: () -> Unit,
    onLoadHistory: () -> Unit,
    onLoadBreaches: () -> Unit,
    onLoadDoorLogs: () -> Unit,
    onLoadMakeLife: (String) -> Unit,
    onCheckIn: () -> Unit,
    onLeaveSeat: () -> Unit,
    onStopSeat: () -> Unit,
    onCancelReservation: (String) -> Unit,
    onGoToBookSeat: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(SeatRecordTab.Today) }
    var expandedReservationId by rememberSaveable { mutableStateOf("") }
    var seatMapLabel by rememberSaveable { mutableStateOf(0) }
    var seatMapPlace by rememberSaveable { mutableStateOf("") }
    val showSeatMap: (Int, String) -> Unit = { label, place ->
        seatMapLabel = label
        seatMapPlace = place
    }
    val recordCard: @Composable (LibrarySeatReservationRecord) -> Unit = { record ->
        SeatReservationRecordCard(
            record = record,
            expanded = expandedReservationId == record.id,
            makeLife = if (expandedReservationId == record.id) makeLife else emptyList(),
            makeLifeLoading = makeLifeLoading && makeLifeReservationId == record.id,
            onToggleMakeLife = {
                if (expandedReservationId == record.id) {
                    expandedReservationId = ""
                } else {
                    expandedReservationId = record.id
                    onLoadMakeLife(record.id)
                }
            },
            onShowSeatMap = showSeatMap,
        )
    }
    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSectionHeader(
                title = "我的座位",
                subtitle = "官方系统同步 · 使用中的座位、违约与门禁记录",
            )
            CurrentSeatUsageCard(
                record = currentUse,
                loading = currentUseLoading,
                usageAction = usageAction,
                onCheckIn = onCheckIn,
                onLeaveSeat = onLeaveSeat,
                onStopSeat = onStopSeat,
                onCancelReservation = onCancelReservation,
                onShowSeatMap = showSeatMap,
            )
            AppSegmentedControl(
                options = SeatRecordTab.entries.toList(),
                selected = selectedTab,
                onSelect = { tab ->
                    selectedTab = tab
                    when (tab) {
                        SeatRecordTab.Today -> onLoadReservations()
                        SeatRecordTab.History -> onLoadHistory()
                        SeatRecordTab.Breach -> onLoadBreaches()
                        SeatRecordTab.DoorLog -> onLoadDoorLogs()
                    }
                },
                label = { it.label },
            )
            when (selectedTab) {
                SeatRecordTab.Today -> SeatReservationList(
                    records = reservations.sortedWith(
                        compareByDescending<LibrarySeatReservationRecord> { isActiveSeatReservation(it) }
                            .thenBy { it.date }
                            .thenBy { it.startTime },
                    ),
                    loading = loading,
                    emptyTitle = "今日暂无预约记录",
                    emptyDetail = "预约成功后会自动显示在这里",
                    recordCard = recordCard,
                )
                SeatRecordTab.History -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (!historyLoading && history.total > history.records.size) {
                        Text(
                            text = "共 ${history.total} 条历史记录，仅显示最近 ${history.records.size} 条",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    SeatReservationList(
                        records = history.records,
                        loading = historyLoading,
                        emptyTitle = "暂无历史预约记录",
                        emptyDetail = "历史预约成功的座位会显示在这里",
                        recordCard = recordCard,
                    )
                }
                SeatRecordTab.Breach -> SeatBreachList(page = breaches, loading = breachesLoading)
                SeatRecordTab.DoorLog -> SeatDoorLogList(logs = doorLogs, loading = doorLogsLoading)
            }
            AppSecondaryButton(
                text = "返回查询座位",
                icon = Icons.Outlined.Search,
                onClick = onGoToBookSeat,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    if (seatMapLabel > 0) {
        SecondFloorSeatMapDialog(
            seatLabel = seatMapLabel,
            place = seatMapPlace,
            onDismiss = { seatMapLabel = 0 },
        )
    }
}

@Composable
private fun SeatReservationRecordCard(
    record: LibrarySeatReservationRecord,
    expanded: Boolean,
    makeLife: List<LibrarySeatMakeLife>,
    makeLifeLoading: Boolean,
    onToggleMakeLife: () -> Unit,
    onShowSeatMap: (Int, String) -> Unit,
) {
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
            val seatMapLabel = secondFloorSeatMapLabel(record)
            if (seatMapLabel == null) {
                AppSecondaryButton(
                    text = if (expanded) "收起变更记录" else "变更记录",
                    onClick = onToggleMakeLife,
                    compact = true,
                    height = 36.dp,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AppSecondaryButton(
                        text = "查看座位位置",
                        icon = Icons.Outlined.Chair,
                        onClick = { onShowSeatMap(seatMapLabel, location) },
                        compact = true,
                        height = 36.dp,
                        modifier = Modifier.weight(1f),
                    )
                    AppSecondaryButton(
                        text = if (expanded) "收起变更记录" else "变更记录",
                        onClick = onToggleMakeLife,
                        compact = true,
                        height = 36.dp,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            if (expanded) {
                when {
                    makeLifeLoading -> AppSkeletonInlineRows(
                        rowCount = 2,
                        leadingSize = 24.dp,
                        lineWidths = listOf(0.4f, 0.3f),
                    )
                    makeLife.isEmpty() -> Text(
                        text = "暂无变更记录",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    else -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        makeLife.forEach { stage ->
                            val stageText = listOf(stage.createdDate, stage.stageName)
                                .filter(String::isNotBlank)
                                .joinToString(" · ")
                            Text(
                                text = if (stage.sourceName.isNotBlank()) "$stageText（${stage.sourceName}）" else stageText,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SeatReservationList(
    records: List<LibrarySeatReservationRecord>,
    loading: Boolean,
    emptyTitle: String,
    emptyDetail: String,
    recordCard: @Composable (LibrarySeatReservationRecord) -> Unit,
) {
    when {
        loading -> AppSkeletonInlineRows(
            rowCount = 3,
            leadingSize = 30.dp,
            lineWidths = listOf(0.32f, 0.58f),
        )
        records.isEmpty() -> AppEmptyState(emptyTitle, detail = emptyDetail)
        else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            records.forEach { record -> recordCard(record) }
        }
    }
}

@Composable
private fun CurrentSeatUsageCard(
    record: LibrarySeatReservationRecord?,
    loading: Boolean,
    usageAction: LibrarySeatUsageAction?,
    onCheckIn: () -> Unit,
    onLeaveSeat: () -> Unit,
    onStopSeat: () -> Unit,
    onCancelReservation: (String) -> Unit,
    onShowSeatMap: (Int, String) -> Unit,
) {
    var pendingSeatAction by remember { mutableStateOf<String?>(null) }
    if (!loading && record == null) return
    val busy = usageAction != null
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.32f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "使用中的座位",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.weight(1f),
                )
                if (record != null) {
                    Text(
                        text = record.statusText,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            if (record == null) {
                AppSkeletonInlineRows(
                    rowCount = 2,
                    leadingSize = 30.dp,
                    lineWidths = listOf(0.3f, 0.55f),
                )
                return@Column
            }
            Text(
                text = if (record.seatLabel.isNotBlank()) "${record.seatLabel}号座位" else "座位预约",
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            )
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
            val schedule = listOf(record.date, timeRangeLabel(record.startTime, record.endTime))
                .filter(String::isNotBlank)
                .joinToString("  ")
            if (schedule.isNotBlank()) {
                Text(text = schedule, style = MaterialTheme.typography.bodySmall)
            }
            if (record.awayRange.isNotBlank()) {
                Text(
                    text = "暂离时段 ${record.awayRange}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (record.receipt.isNotBlank()) {
                Text(
                    text = "凭证号 ${record.receipt}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val seatMapLabel = secondFloorSeatMapLabel(record)
            if (seatMapLabel != null) {
                AppSecondaryButton(
                    text = "查看座位位置",
                    icon = Icons.Outlined.Chair,
                    onClick = { onShowSeatMap(seatMapLabel, location) },
                    compact = true,
                    height = 36.dp,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (record.status.uppercase()) {
                    "RESERVE" -> {
                        AppButton(
                            text = "签到",
                            onClick = onCheckIn,
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.CheckIn,
                            height = 40.dp,
                        )
                        AppDangerButton(
                            text = "取消预约",
                            onClick = { pendingSeatAction = "cancel" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.Cancel,
                            height = 40.dp,
                        )
                    }
                    "CHECK_IN" -> {
                        AppSecondaryButton(
                            text = "暂离",
                            onClick = onLeaveSeat,
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.Leave,
                            height = 40.dp,
                        )
                        AppDangerButton(
                            text = "结束使用",
                            onClick = { pendingSeatAction = "stop" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.Stop,
                            height = 40.dp,
                        )
                    }
                    "AWAY" -> {
                        AppButton(
                            text = "返回座位",
                            onClick = onCheckIn,
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.CheckIn,
                            height = 40.dp,
                        )
                        AppDangerButton(
                            text = "结束使用",
                            onClick = { pendingSeatAction = "stop" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = usageAction == LibrarySeatUsageAction.Stop,
                            height = 40.dp,
                        )
                    }
                }
            }
        }
    }
    record?.let { current ->
        val seatText = listOf(
            if (current.seatLabel.isNotBlank()) "${current.seatLabel}号座位" else "座位",
            listOf(current.date, timeRangeLabel(current.startTime, current.endTime))
                .filter(String::isNotBlank)
                .joinToString(" "),
        ).filter(String::isNotBlank).joinToString(" · ")
        when (pendingSeatAction) {
            "cancel" -> AppConfirmDialog(
                title = "取消预约",
                detail = "$seatText\n取消后座位立即释放，需要重新预约。",
                confirmLabel = "确认取消",
                icon = Icons.Outlined.EventBusy,
                danger = true,
                busy = usageAction == LibrarySeatUsageAction.Cancel,
                onDismiss = { pendingSeatAction = null },
                onConfirm = {
                    pendingSeatAction = null
                    onCancelReservation(current.id)
                },
            )
            "stop" -> AppConfirmDialog(
                title = "结束使用",
                detail = "$seatText\n结束后座位立即释放，其他同学可以预约。",
                confirmLabel = "结束使用",
                icon = Icons.Outlined.Stop,
                danger = true,
                busy = usageAction == LibrarySeatUsageAction.Stop,
                onDismiss = { pendingSeatAction = null },
                onConfirm = {
                    pendingSeatAction = null
                    onStopSeat()
                },
            )
        }
    }
}

@Composable
private fun SecondFloorSeatMapDialog(
    seatLabel: Int,
    place: String,
    onDismiss: () -> Unit,
) {
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Chair,
        title = "二层 1-45 号座位图",
        subtitle = listOf(place.takeIf(String::isNotBlank), "${seatLabel} 号座位")
            .filterNotNull()
            .joinToString(" · "),
        footer = {
            AppDialogPrimaryButton(
                text = "知道了",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "蓝色描边方块是你的 ${seatLabel} 号座位，其余为同区域座位位置。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SecondFloorSeatMap(
                floorSeats = emptyList(),
                selectedLabels = setOf(seatLabel),
                allowMissingSeats = true,
                readOnly = true,
                onSeatClick = {},
            )
            Text(
                text = "座位号从左到右、从上到下依次递增，隔板标记可帮你判断属于哪一排。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SeatBreachList(page: LibrarySeatBreachPage, loading: Boolean) {
    when {
        loading -> AppSkeletonInlineRows(
            rowCount = 3,
            leadingSize = 30.dp,
            lineWidths = listOf(0.32f, 0.58f),
        )
        page.records.isEmpty() -> AppEmptyState(
            "暂无违约记录",
            detail = "按时签到、按时签退就不会产生违约记录",
        )
        else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (page.total > page.records.size) {
                Text(
                    text = "共 ${page.total} 条违约记录，仅显示最近 ${page.records.size} 条",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            page.records.forEach { record -> SeatBreachRecordCard(record) }
        }
    }
}

@Composable
private fun SeatBreachRecordCard(record: LibrarySeatBreachRecord) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.28f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f)),
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
                    color = MaterialTheme.colorScheme.error,
                )
            }
            if (record.location.isNotBlank()) {
                Text(
                    text = record.location,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val timeRange = record.actualTime.takeIf(String::isNotBlank)
                ?: timeRangeLabel(record.startTime, record.endTime)
            val schedule = listOf(record.date, timeRange)
                .filter(String::isNotBlank)
                .joinToString("  ")
            if (schedule.isNotBlank()) {
                Text(text = schedule, style = MaterialTheme.typography.bodySmall)
            }
            if (record.awayRange.isNotBlank()) {
                Text(
                    text = "暂离时段 ${record.awayRange}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SeatDoorLogList(logs: List<LibrarySeatDoorLog>, loading: Boolean) {
    when {
        loading -> AppSkeletonInlineRows(
            rowCount = 3,
            leadingSize = 30.dp,
            lineWidths = listOf(0.42f, 0.3f),
        )
        logs.isEmpty() -> AppEmptyState(
            "今日暂无门禁记录",
            detail = "入馆或离馆刷卡后会自动同步到这里",
        )
        else -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            logs.forEach { log -> SeatDoorLogRow(log) }
        }
    }
}

@Composable
private fun SeatDoorLogRow(log: LibrarySeatDoorLog) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = log.doorName.ifBlank { "图书馆门禁" },
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (log.dateTime.isNotBlank()) {
                    Text(
                        text = log.dateTime,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = log.directionText,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                color = if (log.direction == 0) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}
