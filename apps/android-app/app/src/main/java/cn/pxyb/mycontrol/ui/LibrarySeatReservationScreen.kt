package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LibrarySeatReservationScreen(
    state: LibrarySeatUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadOverview: (Boolean) -> Unit,
    onQueryAreas: (String, String, Int, Int, String?, Int, Boolean, Boolean) -> Unit,
    onLoadSeats: (String, String, Int, Int, Int) -> Unit,
    onSubmitReservation: (LibrarySeatReservationRequest, () -> Unit) -> Unit,
    onOpenOfficialReservation: () -> Unit,
    onClearFeedback: () -> Unit,
) {
    var selectedVenueId by rememberSaveable { mutableStateOf("") }
    var selectedDate by rememberSaveable { mutableStateOf("") }
    var selectedFloorId by rememberSaveable { mutableStateOf("") }
    var startTime by rememberSaveable { mutableStateOf("08:00") }
    var endTime by rememberSaveable { mutableStateOf("10:00") }
    var wantPower by rememberSaveable { mutableStateOf(false) }
    var wantWindow by rememberSaveable { mutableStateOf(false) }
    var selectedAreaId by rememberSaveable { mutableStateOf("") }
    var selectedSeatId by rememberSaveable { mutableStateOf("") }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var venueMenuOpen by remember { mutableStateOf(false) }
    var floorMenuOpen by remember { mutableStateOf(false) }
    var queryHint by remember { mutableStateOf<String?>(null) }
    var initialQueryDone by rememberSaveable { mutableStateOf(false) }

    val selectedVenue = state.venues.firstOrNull { it.id == selectedVenueId } ?: state.venues.firstOrNull()
    val selectedFloor = selectedVenue?.floors?.firstOrNull { it.id == selectedFloorId }
    val selectedAreas = state.areas.filter { area ->
        (selectedVenue?.id.isNullOrBlank() || area.venueId.isBlank() || area.venueId == selectedVenue?.id) &&
            (selectedFloor?.id.isNullOrBlank() || area.floorId.isBlank() || area.floorId == selectedFloor?.id)
    }
    val selectedArea = selectedAreas.firstOrNull { it.id == selectedAreaId || it.id == state.selectedAreaId }
    val selectedSeats = state.seats
    val startMinute = timeTextToMinute(startTime)
    val endMinute = timeTextToMinute(endTime)
    val canQuery = selectedVenue != null && selectedDate.isNotBlank() && startMinute != null && endMinute != null && endMinute > startMinute

    LaunchedEffect(Unit) {
        onLoadOverview(false)
    }

    LaunchedEffect(state.venues) {
        if (state.venues.isNotEmpty()) {
            if (selectedVenueId.isBlank() || state.venues.none { it.id == selectedVenueId }) {
                selectedVenueId = state.selectedVenueId?.takeIf { id -> state.venues.any { it.id == id } }
                    ?: state.venues.first().id
            }
        }
    }
    LaunchedEffect(state.dates) {
        if (state.dates.isNotEmpty()) {
            if (selectedDate.isBlank() || !state.dates.contains(selectedDate)) {
                selectedDate = state.selectedDate?.takeIf(state.dates::contains) ?: state.dates.first()
            }
        }
    }
    LaunchedEffect(selectedVenueId, state.venues) {
        val floors = state.venues.firstOrNull { it.id == selectedVenueId }?.floors.orEmpty()
        if (floors.isNotEmpty() && (selectedFloorId.isBlank() || floors.none { it.id == selectedFloorId })) {
            selectedFloorId = state.selectedFloorId?.takeIf { id -> floors.any { it.id == id } }
                ?: floors.first().id
        }
    }
    LaunchedEffect(selectedVenueId, selectedDate, selectedFloorId, startTime, endTime) {
        if (initialQueryDone) return@LaunchedEffect
        if (!canQuery) return@LaunchedEffect
        initialQueryDone = true
        queryHint = null
        onClearFeedback()
        val venue = selectedVenue ?: return@LaunchedEffect
        val start = startMinute ?: return@LaunchedEffect
        val end = endMinute ?: return@LaunchedEffect
        onQueryAreas(
            venue.id,
            selectedDate,
            start,
            end,
            selectedFloorId.takeIf(String::isNotBlank),
            50,
            wantPower,
            wantWindow,
        )
    }
    WorkspacePage(
        title = "座位预约",
        subtitle = "图书馆座位预约 · 官方系统同步",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing || state.overviewLoading || state.areasLoading || state.seatsLoading || state.submitLoading,
        onRefresh = onRefresh,
    ) {
        item(key = "official-entry", contentType = "action") {
            OutlinedButton(
                onClick = onOpenOfficialReservation,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp),
                shape = RoundedCornerShape(10.dp),
            ) {
                Icon(Icons.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text("打开官方座位系统", maxLines = 1)
            }
        }

        state.message?.takeIf(String::isNotBlank)?.let { message ->
            item(key = "seat-message", contentType = "banner") {
                FeedbackBanner(message, error = false)
            }
        }
        state.error?.takeIf(String::isNotBlank)?.let { message ->
            item(key = "seat-error", contentType = "banner") {
                FeedbackBanner(
                    if (message.contains("登录") || message.contains("会话")) {
                        "学校账号登录已失效，请重新登录后再试。"
                    } else {
                        "操作失败：$message"
                    },
                    error = true,
                )
            }
        }
        queryHint?.let { hint ->
            item(key = "seat-hint", contentType = "banner") {
                FeedbackBanner(hint, error = false)
            }
        }

        item(key = "seat-overview", contentType = "summary") {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionHeader("座位总览", "先选场馆和时间，再查阅览区与座位")
                    if (state.overviewLoading && state.venues.isEmpty()) {
                        LoadingBlock("正在加载场馆和日期...")
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            MetricCell("场馆", state.venues.size.toString(), Modifier.weight(1f))
                            MetricCell("日期", state.dates.size.toString(), Modifier.weight(1f))
                            MetricCell("阅览区", state.areas.size.toString(), Modifier.weight(1f))
                            MetricCell("座位", state.seats.size.toString(), Modifier.weight(1f))
                        }
                        Text(
                            text = selectedVenue?.name?.takeIf(String::isNotBlank) ?: "请选择场馆",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = listOfNotNull(
                                selectedDate.takeIf(String::isNotBlank)?.let(::formatSeatDateLabel),
                                timeRangeLabel(startTime, endTime),
                                selectedFloor?.name?.takeIf(String::isNotBlank),
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }

        item(key = "seat-filters", contentType = "filters") {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionHeader("筛选条件", "选择楼馆、楼层、日期和预约时段")
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        SelectionSurface(
                            label = "场馆",
                            value = selectedVenue?.name ?: "请选择",
                            placeholder = "请选择场馆",
                            modifier = Modifier.weight(1f),
                            expanded = venueMenuOpen,
                            onExpandedChange = { venueMenuOpen = it },
                            options = state.venues.map { venue ->
                                SelectionOption(venue.id, venue.name, if (venue.floors.isNotEmpty()) "${venue.floors.size} 层" else "暂无楼层")
                            },
                            onSelect = { option ->
                                selectedVenueId = option.id
                                selectedFloorId = state.venues.firstOrNull { it.id == option.id }?.floors?.firstOrNull()?.id.orEmpty()
                                selectedAreaId = ""
                                selectedSeatId = ""
                            },
                        )
                        SelectionSurface(
                            label = "楼层",
                            value = selectedFloor?.name ?: if (selectedVenue == null) "先选场馆" else "全部楼层",
                            placeholder = "全部楼层",
                            modifier = Modifier.weight(1f),
                            expanded = floorMenuOpen,
                            enabled = selectedVenue != null && selectedVenue.floors.isNotEmpty(),
                            onExpandedChange = { floorMenuOpen = it },
                            options = buildList {
                                add(SelectionOption("", "全部楼层", "不过滤楼层"))
                                selectedVenue?.floors.orEmpty().forEach { floor ->
                                    add(SelectionOption(floor.id, floor.name))
                                }
                            },
                            onSelect = { option ->
                                selectedFloorId = option.id
                                selectedAreaId = ""
                                selectedSeatId = ""
                            },
                        )
                    }
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.dates.forEach { date ->
                            FilterChip(
                                selected = selectedDate == date,
                                onClick = {
                                    selectedDate = date
                                    selectedAreaId = ""
                                    selectedSeatId = ""
                                },
                                label = { Text(formatSeatDateLabel(date), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedTextField(
                            value = startTime,
                            onValueChange = {
                                startTime = it.trim()
                                selectedAreaId = ""
                                selectedSeatId = ""
                            },
                            label = { Text("开始时间") },
                            leadingIcon = { Icon(Icons.Outlined.AccessTime, contentDescription = null) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = endTime,
                            onValueChange = {
                                endTime = it.trim()
                                selectedAreaId = ""
                                selectedSeatId = ""
                            },
                            label = { Text("结束时间") },
                            leadingIcon = { Icon(Icons.Outlined.AccessTime, contentDescription = null) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = wantWindow,
                            onClick = { wantWindow = !wantWindow },
                            label = { Text("靠窗") },
                        )
                        FilterChip(
                            selected = wantPower,
                            onClick = { wantPower = !wantPower },
                            label = { Text("电源") },
                        )
                    }
                    Button(
                        onClick = {
                            val venue = selectedVenue
                            val start = timeTextToMinute(startTime)
                            val end = timeTextToMinute(endTime)
                            if (venue == null || selectedDate.isBlank() || start == null || end == null || end <= start) {
                                queryHint = "请先选择有效的场馆、日期和时间。"
                                return@Button
                            }
                            queryHint = null
                            onClearFeedback()
                            onQueryAreas(
                                venue.id,
                                selectedDate,
                                start,
                                end,
                                selectedFloorId.takeIf(String::isNotBlank),
                                50,
                                wantPower,
                                wantWindow,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = canQuery && !state.areasLoading,
                    ) {
                        Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("查询阅览区")
                    }
                }
            }
        }

        item(key = "seat-areas", contentType = "areas") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionHeader(
                    "可预约阅览区",
                    if (selectedAreas.isEmpty() && !state.areasLoading) "先点击查询，学校返回可预约区域后再选座位" else "点击某个阅览区后加载座位列表",
                )
                if (state.areasLoading) {
                    AppPanel { LoadingBlock("正在查询阅览区...") }
                } else if (selectedAreas.isEmpty()) {
                    AppPanel { EmptyBlock("暂无阅览区结果", "请先查询，或调整日期与时段后重试。") }
                } else {
                    selectedAreas.forEach { area ->
                        AreaCard(
                            area = area,
                            selected = selectedArea?.id == area.id,
                            onClick = {
                                selectedAreaId = area.id
                                selectedSeatId = ""
                                val start = timeTextToMinute(startTime)
                                val end = timeTextToMinute(endTime)
                                if (start != null && end != null && end > start) {
                                    onLoadSeats(area.id, selectedDate, start, end, 0)
                                }
                            },
                        )
                    }
                }
            }
        }

        item(key = "seat-list", contentType = "seats") {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionHeader(
                        "座位列表",
                        selectedArea?.let { "${it.name} · ${it.floorName.ifBlank { "未注明楼层" }}" } ?: "先选一个阅览区",
                    )
                    if (state.seatsLoading) {
                        LoadingBlock("正在加载座位...")
                    } else if (selectedArea == null) {
                        EmptyBlock("暂无座位", "先在上方选中一个阅览区。")
                    } else if (selectedSeats.isEmpty()) {
                        EmptyBlock("暂无座位结果", "如果阅览区已选中，请尝试刷新或重新查询。")
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            selectedSeats.forEach { seat ->
                                SeatChip(
                                    seat = seat,
                                    selected = selectedSeatId == seat.id,
                                    onClick = {
                                        selectedSeatId = seat.id
                                        showConfirmDialog = true
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showConfirmDialog && selectedArea != null) {
        val start = timeTextToMinute(startTime)
        val end = timeTextToMinute(endTime)
        val seat = selectedSeats.firstOrNull { it.id == selectedSeatId }
        if (start != null && end != null && end > start && seat != null) {
            AppConfirmDialog(
                title = "提交座位预约",
                detail = listOf(
                    "阅览区：${selectedArea.name}",
                    "座位：${seat.label} · ${seat.name}",
                    "日期：${formatSeatDateLabel(selectedDate)}",
                    "时段：${timeRangeLabel(startTime, endTime)}",
                ).joinToString("\n"),
                confirmLabel = "确认提交",
                onDismiss = { showConfirmDialog = false },
                onConfirm = {
                    onSubmitReservation(
                        LibrarySeatReservationRequest(
                            seatId = seat.id,
                            date = selectedDate,
                            startMinute = start,
                            endMinute = end,
                        ),
                    ) {
                        showConfirmDialog = false
                        selectedSeatId = ""
                        queryHint = "预约已提交，正在刷新座位状态。"
                        onLoadSeats(selectedArea.id, selectedDate, start, end, 0)
                    }
                },
                icon = Icons.Outlined.Chair,
                busy = state.submitLoading,
            )
        }
    }
}

@Composable
private fun AreaCard(
    area: LibrarySeatArea,
    selected: Boolean,
    onClick: () -> Unit,
) {
    AppPanel(onClick = onClick) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Outlined.Chair,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = area.name,
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = listOfNotNull(area.buildingName.takeIf(String::isNotBlank), area.floorName.takeIf(String::isNotBlank)).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = "可用 ${area.seatFree}",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MetricCell("总座位", area.seatTotal.toString(), Modifier.weight(1f))
                MetricCell("可预约", area.seatFree.toString(), Modifier.weight(1f))
                MetricCell("时长", if (area.maxMinute > 0) "${area.maxMinute / 60}h" else "--", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SeatChip(
    seat: LibrarySeatStatus,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val container = when {
        selected && seat.isFree -> MaterialTheme.colorScheme.primaryContainer
        seat.isFree -> MaterialTheme.colorScheme.surface
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val contentColor = if (seat.isFree) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = container,
        contentColor = contentColor,
        border = BorderStroke(
            1.dp,
            when {
                selected && seat.isFree -> MaterialTheme.colorScheme.primary
                seat.isFree -> MaterialTheme.colorScheme.outlineVariant
                else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            },
        ),
        modifier = Modifier.clickable(enabled = seat.isFree, onClick = onClick),
    ) {
        Column(
            modifier = Modifier.widthIn(min = 82.dp).padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = seat.label,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = seat.statusText,
                style = MaterialTheme.typography.labelSmall,
                color = if (seat.isFree) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun SelectionSurface(
    label: String,
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    expanded: Boolean,
    enabled: Boolean = true,
    onExpandedChange: (Boolean) -> Unit,
    options: List<SelectionOption>,
    onSelect: (SelectionOption) -> Unit,
) {
    Box(modifier = modifier) {
        Surface(
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { onExpandedChange(true) },
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = value.takeIf(String::isNotBlank) ?: placeholder,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        DropdownMenu(
            expanded = expanded && enabled,
            onDismissRequest = { onExpandedChange(false) },
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(option.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (!option.detail.isNullOrBlank()) {
                                Text(
                                    option.detail,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    },
                    onClick = {
                        onExpandedChange(false)
                        onSelect(option)
                    },
                )
            }
        }
    }
}

private data class SelectionOption(
    val id: String,
    val label: String,
    val detail: String? = null,
)

private fun timeTextToMinute(value: String): Int? {
    val text = value.trim()
    val match = Regex("^(\\d{1,2}):([0-5]\\d)$").matchEntire(text) ?: return null
    val hour = match.groupValues[1].toIntOrNull() ?: return null
    val minute = match.groupValues[2].toIntOrNull() ?: return null
    return if (hour in 0..23) hour * 60 + minute else null
}

private fun timeRangeLabel(start: String, end: String): String = listOf(start.trim(), end.trim())
    .filter(String::isNotBlank)
    .joinToString(" - ")

private fun formatSeatDateLabel(value: String): String {
    val date = runCatching { LocalDate.parse(value) }.getOrNull() ?: return value
    val weekday = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.CHINA)
    return "${date.monthValue}月${date.dayOfMonth}日 $weekday"
}
