package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatFloor
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatVenue
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistRequest
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistTask
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonInlineRows
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonSeatGrid
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.picker.AppTimeRangePicker
import cn.pxyb.mycontrol.util.DateTimeUtils.formatMinutesToTime
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes

@Composable
internal fun LibrarySeatWaitlistPanel(
    state: LibrarySeatUiState,
    selectedVenue: LibrarySeatVenue?,
    selectedFloor: LibrarySeatFloor?,
    selectedDate: String,
    startTime: String,
    endTime: String,
    secondFloor: LibrarySeatFloor?,
    floorSeats: List<LibrarySeatFloorSeat>,
    floorSeatsLoading: Boolean,
    onStartTimeChange: (String) -> Unit,
    onEndTimeChange: (String) -> Unit,
    onVenueSelected: (String) -> Unit,
    onFloorSelected: (String) -> Unit,
    onDateSelected: (String) -> Unit,
    onQueryFloorSeats: (String, String, String, Int, Int) -> Unit,
    onClearFeedback: () -> Unit,
    onCreateWaitlist: (LibrarySeatWaitlistRequest) -> Unit,
    onSetWaitlistEnabled: (String, Boolean) -> Unit,
    onDeleteWaitlist: (String) -> Unit,
) {
    var venueMenuOpen by remember { mutableStateOf(false) }
    var floorMenuOpen by remember { mutableStateOf(false) }
    var minLabelText by rememberSaveable { mutableStateOf("1") }
    var maxLabelText by rememberSaveable { mutableStateOf("45") }
    var selectionMode by rememberSaveable { mutableStateOf("range") }
    var selectedSeatLabelsText by rememberSaveable(selectedVenue?.id, selectedFloor?.id) {
        mutableStateOf("")
    }
    var showSeatDialog by remember { mutableStateOf(false) }
    var hint by remember { mutableStateOf<String?>(null) }

    val startMinute = parseTimeMinutes(startTime)
    val endMinute = parseTimeMinutes(endTime)
    val minLabel = minLabelText.trim().toIntOrNull()
    val maxLabel = maxLabelText.trim().toIntOrNull()
    val selectedSeatLabels = remember(selectedSeatLabelsText) {
        selectedSeatLabelsText.split(",").mapNotNull(String::toIntOrNull).toSet()
    }
    val formValid = selectedVenue != null && selectedFloor != null && selectedDate.isNotBlank()
        && startMinute != null && endMinute != null && endMinute > startMinute
        && if (selectionMode == "specified") {
        selectedSeatLabels.isNotEmpty() && selectedSeatLabels.all { it in 1..45 }
    } else {
        minLabel != null && maxLabel != null && minLabel in 1..999 && maxLabel in 1..999 && minLabel <= maxLabel
    }

    fun openSeatDialog() {
        val venue = selectedVenue
        val floor = secondFloor
        val start = startMinute
        val end = endMinute
        when {
            venue == null || secondFloor == null -> hint = "未找到图书馆二层楼层，无法使用指定 1-45 号座位。"
            selectedDate.isBlank() -> hint = "请先选择预约日期。"
            start == null || end == null || end <= start -> hint = "请选择有效的候补时段。"
            else -> {
                hint = null
                if (selectedFloor?.id != floor.id) onFloorSelected(floor.id)
                showSeatDialog = true
                onQueryFloorSeats(venue.id, floor.id, selectedDate, start, end)
            }
        }
    }

    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSectionHeader(title = "新建候补任务", subtitle = "座位被占时自动监听释放座位并立即预约")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppSelectField(
                    label = "场馆",
                    value = selectedVenue?.id,
                    placeholder = "请选择场馆",
                    modifier = Modifier.weight(1f),
                    expanded = venueMenuOpen,
                    enabled = state.venues.isNotEmpty(),
                    onExpandedChange = { venueMenuOpen = it },
                    options = state.venues.map { venue ->
                        AppSelectOption(venue.id, venue.name, if (venue.floors.isNotEmpty()) "${venue.floors.size} 层" else "暂无楼层")
                    },
                    onValueChange = { selectedValue ->
                        onVenueSelected(selectedValue)
                    },
                )
                AppSelectField(
                    label = "楼层",
                    value = if (selectedVenue == null) null else selectedFloor?.id.orEmpty(),
                    placeholder = "请选择楼层",
                    modifier = Modifier.weight(1f),
                    expanded = floorMenuOpen,
                    enabled = selectedVenue != null && selectedVenue.floors.isNotEmpty(),
                    onExpandedChange = { floorMenuOpen = it },
                    options = selectedVenue?.floors.orEmpty().map { floor ->
                        AppSelectOption(floor.id, floor.name)
                    },
                    onValueChange = { selectedValue ->
                        onFloorSelected(selectedValue)
                    },
                )
            }
            val seatTargetText = if (selectionMode == "specified") {
                val floorName = selectedFloor?.name?.takeIf(String::isNotBlank) ?: "未选楼层"
                val selectedText = if (selectedSeatLabels.isEmpty()) "未选择" else selectedSeatLabels.sorted().joinToString("、")
                "指定座位：$floorName $selectedText"
            } else {
                val floorName = selectedFloor?.name?.takeIf(String::isNotBlank) ?: "未选楼层"
                "候补座位范围：$floorName $minLabelText-$maxLabelText 号座位"
            }
            Text(
                text = seatTargetText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FilterChip(
                    selected = selectionMode == "range",
                    onClick = { selectionMode = "range" },
                    label = { Text("座位范围") },
                )
                FilterChip(
                    selected = selectionMode == "specified",
                    onClick = {
                        selectionMode = "specified"
                        openSeatDialog()
                    },
                    label = { Text("指定 1-45 号座位") },
                )
            }
            AppTimeRangePicker(
                startTime = startTime,
                endTime = endTime,
                onStartTimeChange = onStartTimeChange,
                onEndTimeChange = onEndTimeChange,
                sectionTitle = "候补时段（开放 08:00 - 21:30）",
                minStartTime = "08:00",
                maxStartTime = "21:15",
                minEndTime = "08:15",
                maxEndTime = "21:30",
                minuteStep = 15,
                minDurationMinutes = null,
                maxDurationMinutes = null,
                quickDurationOptions = emptyList(),
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.dates.forEach { date ->
                    FilterChip(
                        selected = selectedDate == date,
                        onClick = { onDateSelected(date) },
                        label = { Text(formatSeatDateLabel(date), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    )
                }
            }
            if (selectionMode == "specified") {
                AppSecondaryButton(
                    text = if (selectedSeatLabels.isEmpty()) "打开 1-45 号座位图选择"
                    else "修改指定座位（已选 ${selectedSeatLabels.size} 个）",
                    onClick = { openSeatDialog() },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedTextField(
                        value = minLabelText,
                        onValueChange = { value ->
                            minLabelText = value.filter(Char::isDigit).take(3)
                            hint = null
                        },
                        label = { Text("最小座位号") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = maxLabelText,
                        onValueChange = { value ->
                            maxLabelText = value.filter(Char::isDigit).take(3)
                            hint = null
                        },
                        label = { Text("最大座位号") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Text(
                text = "检测到范围内释放座位后会自动预约并发送 App 消息与企业微信提醒。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            AppButton(
                text = if (state.waitlistSaving) "正在开启..." else "开启候补监听",
                icon = Icons.Outlined.NotificationsActive,
                onClick = {
                    hint = null
                    val venue = selectedVenue
                    val floor = selectedFloor
                    val start = startMinute
                    val end = endMinute
                    val min = minLabel
                    val max = maxLabel
                    val labels = selectedSeatLabels.sorted()
                    when {
                        venue == null || floor == null -> hint = "请先选择场馆与楼层（默认二层）。"
                        selectedDate.isBlank() -> hint = "请先选择预约日期。"
                        start == null || end == null || end <= start -> hint = "请选择有效的候补时段。"
                        selectionMode == "specified" && (labels.isEmpty() || labels.any { it !in 1..45 }) ->
                            hint = "请在 1-45 号座位图中至少选择一个座位。"
                        selectionMode == "range" && (min == null || max == null || min !in 1..999 || max !in 1..999 || min > max) ->
                            hint = "座位号需为 1 至 999 的整数，且最小号不能大于最大号。"
                        else -> {
                            onClearFeedback()
                            onCreateWaitlist(
                                LibrarySeatWaitlistRequest(
                                    venueId = venue.id,
                                    floorId = floor.id,
                                    venueName = venue.name,
                                    floorName = floor.name,
                                    date = selectedDate,
                                    startMinute = start,
                                    endMinute = end,
                                    minLabel = if (selectionMode == "specified") labels.first() else min ?: 1,
                                    maxLabel = if (selectionMode == "specified") labels.last() else max ?: 45,
                                    seatLabels = if (selectionMode == "specified") labels else emptyList(),
                                ),
                            )
                        }
                    }
                },
                enabled = !state.waitlistSaving && state.venues.isNotEmpty(),
                loading = state.waitlistSaving,
                modifier = Modifier.fillMaxWidth(),
            )
            hint?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            AppSectionHeader(title = "我的候补任务", subtitle = "开启后由服务端持续监听，成功即自动结束")
            when {
                state.waitlistsLoading && state.waitlists.isEmpty() -> AppSkeletonInlineRows(
                    rowCount = 2,
                    leadingSize = 30.dp,
                    lineWidths = listOf(0.32f, 0.58f),
                )
                state.waitlists.isEmpty() -> AppEmptyState(
                    "暂无候补任务",
                    detail = "选好日期、时段与座位范围后点击上方按钮开启监听。",
                )
                else -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        state.waitlists.forEach { task ->
                            WaitlistTaskCard(
                                task = task,
                                busy = state.waitlistSaving,
                                deleting = state.waitlistDeletingId == task.id,
                                onStop = { onSetWaitlistEnabled(task.id, false) },
                                onResume = { onSetWaitlistEnabled(task.id, true) },
                                onDelete = { onDeleteWaitlist(task.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showSeatDialog) {
        AppDialog(
            onDismissRequest = { showSeatDialog = false },
            title = "选择指定座位",
            subtitle = "点击 1-45 号座位可多选，绿色表示当前空闲",
            footer = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "清空",
                        onClick = { selectedSeatLabelsText = "" },
                        modifier = Modifier.weight(1f),
                    )
                    AppDialogPrimaryButton(
                        text = "完成",
                        onClick = { showSeatDialog = false },
                        modifier = Modifier.weight(1f),
                    )
                }
            },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (floorSeatsLoading) {
                    AppSkeletonSeatGrid(columns = 5, rows = 2, cellHeight = 34.dp)
                } else {
                    Text(
                        text = "共 45 个座位 · 当前空闲 ${floorSeats.count { it.seat.isFree && it.seat.label.toIntOrNull() in 1..45 }} 个",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = if (selectedSeatLabels.isEmpty()) "未选择座位"
                        else "已选 ${selectedSeatLabels.size} 个：${selectedSeatLabels.sorted().joinToString("、")}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    SecondFloorSeatMap(
                        floorSeats = floorSeats,
                        selectedLabels = selectedSeatLabels,
                        allowMissingSeats = true,
                        onSeatClick = { floorSeat ->
                            val label = floorSeat.seat.label.toIntOrNull()
                            if (label != null) {
                                val labels = if (label in selectedSeatLabels) {
                                    selectedSeatLabels - label
                                } else {
                                    selectedSeatLabels + label
                                }
                                selectedSeatLabelsText = labels.sorted().joinToString(",")
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun WaitlistTaskCard(
    task: LibrarySeatWaitlistTask,
    busy: Boolean,
    deleting: Boolean,
    onStop: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
) {
    val listening = task.enabled && task.status == "listening"
    val success = task.status == "success"
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
                    text = listOfNotNull(
                        task.floorName.takeIf(String::isNotBlank),
                        if (task.seatLabels.isEmpty()) "${task.minLabel}-${task.maxLabel} 号座位"
                        else "指定 ${task.seatLabels.joinToString("、")} 号座位",
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = task.statusText,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (success) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "${task.date}  ${formatMinutesToTime(task.startMinute)} - ${formatMinutesToTime(task.endMinute)}"
                    .trim(),
                style = MaterialTheme.typography.bodySmall,
            )
            if (success && task.lastSeatLabel.isNotBlank()) {
                Text(
                    text = listOfNotNull(
                        task.lastAreaName.takeIf(String::isNotBlank),
                        "${task.lastSeatLabel} 号座位",
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            task.lastMessage.takeIf(String::isNotBlank)?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (listening) {
                    AppSecondaryButton(
                        text = "停止监听",
                        onClick = onStop,
                        enabled = !busy,
                        height = 36.dp,
                    )
                } else if (!deleting && (task.status == "stopped" || task.status == "failed")) {
                    AppButton(
                        text = "重新开启",
                        onClick = onResume,
                        enabled = !busy,
                        height = 36.dp,
                    )
                }
                Spacer(Modifier.width(8.dp))
                AppDangerButton(
                    text = if (deleting) "删除中..." else "删除",
                    onClick = onDelete,
                    enabled = !busy && !deleting,
                    height = 36.dp,
                )
            }
        }
    }
}
