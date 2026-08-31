package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
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
    onQueryFloorSeats: (String, String, String, Int, Int) -> Unit,
    onSubmitReservation: (LibrarySeatReservationRequest, () -> Unit) -> Unit,
    onLoadReservations: () -> Unit,
    onLoadReservationHistory: () -> Unit,
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
    var selectedFloorSeat by remember { mutableStateOf<LibrarySeatFloorSeat?>(null) }
    var venueMenuOpen by remember { mutableStateOf(false) }
    var floorMenuOpen by remember { mutableStateOf(false) }
    var queryHint by remember { mutableStateOf<String?>(null) }
    var initialQueryDone by rememberSaveable { mutableStateOf(false) }
    var queryMode by rememberSaveable { mutableStateOf("areas") }
    var seatListExpanded by rememberSaveable { mutableStateOf(false) }

    val isTablet = LocalAdaptiveWindow.current.isTabletOrExpanded
    val onAreaClick: (LibrarySeatArea) -> Unit = { clickedArea ->
        val isSameArea = selectedAreaId == clickedArea.id
        selectedAreaId = if (isSameArea) "" else clickedArea.id
        selectedSeatId = ""
        queryMode = "areas"
        seatListExpanded = !isSameArea
        if (!isSameArea) {
            val startMinute = timeTextToMinute(startTime)
            val endMinute = timeTextToMinute(endTime)
            if (startMinute != null && endMinute != null && endMinute > startMinute) {
                onLoadSeats(clickedArea.id, selectedDate, startMinute, endMinute, 0)
            }
        }
    }

    val selectedVenue = state.venues.firstOrNull { it.id == selectedVenueId } ?: state.venues.firstOrNull()
    val selectedFloor = selectedVenue?.floors?.firstOrNull { it.id == selectedFloorId }
    val secondFloor = selectedVenue?.floors?.firstOrNull { isSecondFloorName(it.name) }
    val selectedAreas = state.areas.filter { area ->
        (selectedVenue?.id.isNullOrBlank() || area.venueId.isBlank() || area.venueId == selectedVenue?.id) &&
            (selectedFloor?.id.isNullOrBlank() || area.floorId.isBlank() || area.floorId == selectedFloor?.id)
    }
    val selectedArea = selectedAreas.firstOrNull { it.id == selectedAreaId || it.id == state.selectedAreaId }
    val selectedSeats = state.seats
    val startMinute = timeTextToMinute(startTime)
    val endMinute = timeTextToMinute(endTime)
    val canQuery = selectedVenue != null && selectedDate.isNotBlank() && startMinute != null && endMinute != null && endMinute > startMinute

    val queryAreasButton: @Composable (Modifier) -> Unit = { buttonModifier ->
        Button(
            onClick = {
                val venue = selectedVenue
                val startMinute = timeTextToMinute(startTime) ?: run {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@Button
                }
                val endMinute = timeTextToMinute(endTime) ?: run {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@Button
                }
                if (venue == null || selectedDate.isBlank() || endMinute <= startMinute) {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@Button
                }
                queryHint = null
                onClearFeedback()
                queryMode = "areas"
                seatListExpanded = false
                selectedAreaId = ""
                selectedSeatId = ""
                onQueryAreas(
                    venue.id,
                    selectedDate,
                    startMinute,
                    endMinute,
                    selectedFloorId.takeIf(String::isNotBlank),
                    50,
                    wantPower,
                    wantWindow,
                )
            },
            modifier = buttonModifier,
            enabled = canQuery && !state.areasLoading,
        ) {
            Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("查询阅览区", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    val queryFloorButton: @Composable (Modifier) -> Unit = { buttonModifier ->
        FilledTonalButton(
            onClick = {
                val venue = selectedVenue
                val floor = secondFloor
                val startMinute = timeTextToMinute(startTime) ?: run {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@FilledTonalButton
                }
                val endMinute = timeTextToMinute(endTime) ?: run {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@FilledTonalButton
                }
                if (venue == null || floor == null || selectedDate.isBlank() || endMinute <= startMinute) {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                    return@FilledTonalButton
                }
                queryHint = null
                onClearFeedback()
                selectedFloorId = floor.id
                selectedAreaId = ""
                selectedSeatId = ""
                queryMode = "floor"
                onQueryFloorSeats(venue.id, floor.id, selectedDate, startMinute, endMinute)
            },
            modifier = buttonModifier,
            enabled = canQuery && secondFloor != null && !state.floorSeatsLoading,
        ) {
            Icon(Icons.Outlined.Chair, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("二层 1-45", maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }

    LaunchedEffect(Unit) {
        onLoadOverview(false)
    }
    LaunchedEffect(Unit) {
        onLoadReservations()
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
                ?: floors.firstOrNull { isSecondFloorName(it.name) }?.id
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
                    ReservationTimeRangePicker(
                        startTime = startTime,
                        endTime = endTime,
                        onStartTimeChange = {
                            startTime = it
                            selectedAreaId = ""
                            selectedSeatId = ""
                        },
                        onEndTimeChange = {
                            endTime = it
                            selectedAreaId = ""
                            selectedSeatId = ""
                        },
                        sectionTitle = "预约时段（开放 08:00 - 21:30）",
                        minStartTime = "08:00",
                        maxStartTime = "21:15",
                        minEndTime = "08:15",
                        maxEndTime = "21:30",
                        minuteStep = 15,
                        minDurationMinutes = null,
                        maxDurationMinutes = null,
                        quickDurationOptions = emptyList(),
                    )
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
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        queryAreasButton(Modifier.weight(1f))
                        queryFloorButton(Modifier.weight(1f))
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
                } else if (isTablet) {
                    // 平板 / 大屏：阅览区卡片双列网格
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        selectedAreas.chunked(2).forEach { rowAreas ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                rowAreas.forEach { area ->
                                    Box(modifier = Modifier.weight(1f)) {
                                        AreaCard(
                                            area = area,
                                            selected = selectedAreaId == area.id,
                                            onClick = { onAreaClick(area) },
                                        )
                                    }
                                }
                                if (rowAreas.size == 1) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                } else {
                    selectedAreas.forEach { area ->
                        AreaCard(
                            area = area,
                            selected = selectedAreaId == area.id,
                            onClick = { onAreaClick(area) },
                        )
                    }
                }
            }
        }

        if (queryMode == "areas" && seatListExpanded && selectedAreaId.isNotBlank()) {
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
                    } else if (selectedSeats.isEmpty()) {
                        EmptyBlock("暂无座位结果", "如果阅览区已选中，请尝试刷新或重新查询。")
                    } else {
                        val seatsPerRow = if (isTablet) 8 else 4
                        selectedSeats.chunked(seatsPerRow).forEach { rowSeats ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                val leadingSpacers = (seatsPerRow - rowSeats.size) / 2
                                repeat(leadingSpacers) { Spacer(Modifier.weight(1f)) }
                                rowSeats.forEach { seat ->
                                    SeatChip(
                                        seat = seat,
                                        selected = selectedSeatId == seat.id,
                                        onClick = {
                                            selectedSeatId = seat.id
                                            showConfirmDialog = true
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                repeat(seatsPerRow - rowSeats.size - leadingSpacers) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                        }
                    }
                }
            }
        }

        if (queryMode == "floor") {
            item(key = "floor-seat-list", contentType = "seats") {
                AppPanel {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        SectionHeader(
                            "二层 1-45 号座位",
                            "按当前日期与时段显示空闲状态",
                        )
                    if (state.floorSeatsLoading) {
                        LoadingBlock("正在查询二层座位...")
                    } else if (state.floorSeats.isEmpty()) {
                        EmptyBlock("暂无 1-45 号座位结果", "请选择时段后点击上方按钮查询。")
                    } else {
                        Text(
                            text = "共 ${state.floorSeats.size} 个座位 · ${state.floorSeats.count { it.seat.isFree }} 个可预约",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "绿色 = 可预约 · 灰色 = 占用/不可用 · 顶部/底部色条 = 座位朝向",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        SecondFloorSeatMap(
                            floorSeats = state.floorSeats,
                            onSeatClick = { floorSeat ->
                                selectedFloorSeat = floorSeat
                                selectedAreaId = floorSeat.areaId
                                selectedSeatId = floorSeat.seat.id
                                showConfirmDialog = true
                            },
                        )
                        }
                    }
                }
            }
        }

        item(key = "seat-reservations", contentType = "reservations") {
            MySeatReservationsPanel(
                reservations = state.reservations,
                loading = state.reservationsLoading,
                history = state.historyReservations,
                historyLoading = state.historyReservationsLoading,
                onLoadReservations = onLoadReservations,
                onLoadHistory = onLoadReservationHistory,
            )
        }
    }

    if (showConfirmDialog) {
        val startMinute = timeTextToMinute(startTime) ?: return
        val endMinute = timeTextToMinute(endTime) ?: return
        if (endMinute <= startMinute) return
        val floorSeat = selectedFloorSeat
        val seat = floorSeat?.seat ?: selectedSeats.firstOrNull { it.id == selectedSeatId }
        if (seat == null) return
        val areaName = floorSeat?.areaName ?: selectedArea?.name ?: return
        AppConfirmDialog(
            title = "提交座位预约",
            detail = listOf(
                "阅览区：$areaName",
                "座位：${seat.label} · ${seat.name}",
                "日期：${formatSeatDateLabel(selectedDate)}",
                "时段：${timeRangeLabel(startTime, endTime)}",
            ).joinToString("\n"),
            confirmLabel = "确认提交",
            onDismiss = {
                showConfirmDialog = false
                selectedFloorSeat = null
            },
            onConfirm = {
                onSubmitReservation(
                    LibrarySeatReservationRequest(
                        seatId = seat.id,
                        date = selectedDate,
                        startMinute = startMinute,
                        endMinute = endMinute,
                    ),
                ) {
                    showConfirmDialog = false
                    selectedFloorSeat = null
                    selectedSeatId = ""
                    queryHint = "预约已提交，正在刷新座位状态。"
                    val venue = selectedVenue
                    val floor = secondFloor
                    if (floorSeat != null && venue != null && floor != null) {
                        onQueryFloorSeats(venue.id, floor.id, selectedDate, startMinute, endMinute)
                    } else if (selectedArea != null) {
                        onLoadSeats(selectedArea.id, selectedDate, startMinute, endMinute, 0)
                    }
                }
            },
            icon = Icons.Outlined.Chair,
            busy = state.submitLoading,
        )
    }
}

@Composable
private fun MySeatReservationsPanel(
    reservations: List<LibrarySeatReservationRecord>,
    loading: Boolean,
    history: LibrarySeatReservationHistory,
    historyLoading: Boolean,
    onLoadReservations: () -> Unit,
    onLoadHistory: () -> Unit,
) {
    var showHistory by rememberSaveable { mutableStateOf(false) }
    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionHeader(
                "我的预约记录",
                "官方系统同步 · 显示预约成功的座位",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
            val records = if (showHistory) history.records else reservations
            val recordsLoading = if (showHistory) historyLoading else loading
            when {
                recordsLoading -> LoadingBlock("正在加载预约记录...")
                records.isEmpty() -> EmptyBlock(
                    if (showHistory) "暂无历史预约记录" else "今日暂无预约记录",
                    if (showHistory) "历史预约成功的座位会显示在这里" else "预约成功后会自动显示在这里",
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
                    color = if (record.status == "RESERVE" || record.status == "CHECK_IN") {
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
            Text(
                text = "${record.date}  ${record.startTime}~${record.endTime}".trim(),
                style = MaterialTheme.typography.bodySmall,
            )
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
    modifier: Modifier = Modifier,
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
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = seat.isFree, onClick = onClick),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
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
private fun SecondFloorSeatMap(
    floorSeats: List<LibrarySeatFloorSeat>,
    onSeatClick: (LibrarySeatFloorSeat) -> Unit,
) {
    val seatByLabel = remember(floorSeats) {
        floorSeats.groupBy { it.seat.label.toIntOrNull() }
            .mapValues { (_, entries) -> entries.first() }
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        for (row in 0 until 9) {
            if (row == 3 || row == 6) SecondFloorWallRow()
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (col in 0 until 5) {
                    val label = row * 5 + col + 1
                    val floorSeat = seatByLabel[label]
                    SecondFloorSeatCell(
                        label = label,
                        floorSeat = floorSeat,
                        faceDown = col % 2 == 0,
                        onClick = floorSeat?.let { seat -> { onSeatClick(seat) } },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

private val FreeSeatGreen = Color(0xFF2E7D32)

@Composable
private fun SecondFloorSeatCell(
    label: Int,
    floorSeat: LibrarySeatFloorSeat?,
    faceDown: Boolean,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val seat = floorSeat?.seat
    val shape = RoundedCornerShape(7.dp)
    val background = when {
        seat == null -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f)
        seat.isFree -> FreeSeatGreen.copy(alpha = 0.16f)
        seat.status.equals("IN_USE", ignoreCase = true) -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    }
    val borderColor = when {
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
        seat.isFree -> FreeSeatGreen.copy(alpha = 0.8f)
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    val backColor = when {
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        seat.isFree -> FreeSeatGreen
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    Column(
        modifier = modifier
            .height(50.dp)
            .clip(shape)
            .background(background)
            .border(1.dp, borderColor, shape)
            .clickable(enabled = onClick != null, onClick = onClick ?: {}),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (faceDown) {
            SeatBackBar(backColor)
            SeatNumber(if (seat == null) label.toString() else seat.label, seat == null)
        } else {
            SeatNumber(if (seat == null) label.toString() else seat.label, seat == null)
            SeatBackBar(backColor)
        }
    }
}

@Composable
private fun SeatBackBar(color: Color) {
    Box(
        modifier = Modifier
            .width(26.dp)
            .height(10.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(color),
    )
}

@Composable
private fun SeatNumber(text: String, empty: Boolean) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
        color = if (empty) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        modifier = Modifier.padding(vertical = 2.dp),
    )
}

@Composable
private fun SecondFloorWallRow() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        repeat(4) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(8.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.30f)),
            )
        }
        Spacer(Modifier.weight(1f))
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
                .clip(RoundedCornerShape(18.dp))
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

private fun isSecondFloorName(name: String): Boolean {
    val normalized = name.trim()
    return normalized.contains("二层") ||
        normalized.contains("二楼") ||
        normalized.contains("2层") ||
        normalized.contains("2楼") ||
        normalized.startsWith("2")
}

private fun formatSeatDateLabel(value: String): String {
    val date = runCatching { LocalDate.parse(value) }.getOrNull() ?: return value
    val weekday = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.CHINA)
    return "${date.monthValue}月${date.dayOfMonth}日 $weekday"
}
