package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
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
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import cn.pxyb.mycontrol.data.LibrarySeatFloor
import cn.pxyb.mycontrol.data.LibrarySeatVenue
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistRequest
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistTask
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

private enum class LibrarySeatTab(val label: String) {
    Book("查询座位"),
    My("我的预约"),
    Waitlist("候补预约"),
}

private val activeSeatReservationStatuses = setOf("RESERVE", "CHECK_IN", "AWAY", "LEAVE_EARLY")

private fun isActiveSeatReservation(record: LibrarySeatReservationRecord): Boolean =
    record.status.uppercase() in activeSeatReservationStatuses

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LibrarySeatReservationScreen(
    state: LibrarySeatUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadOverview: (Boolean) -> Unit,
    onInvalidateQuery: () -> Unit,
    onQueryAreas: (String, String, Int, Int, String?, Int, Boolean, Boolean) -> Unit,
    onLoadSeats: (String, String, Int, Int, Int) -> Unit,
    onQueryFloorSeats: (String, String, String, Int, Int) -> Unit,
    onSubmitReservation: (LibrarySeatReservationRequest, () -> Unit) -> Unit,
    onLoadReservations: () -> Unit,
    onLoadReservationHistory: () -> Unit,
    onOpenOfficialReservation: () -> Unit,
    onLoadWaitlists: () -> Unit,
    onCreateWaitlist: (LibrarySeatWaitlistRequest, () -> Unit) -> Unit,
    onSetWaitlistEnabled: (String, Boolean, () -> Unit) -> Unit,
    onDeleteWaitlist: (String, () -> Unit) -> Unit,
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
    var selectedTab by rememberSaveable { mutableStateOf(LibrarySeatTab.Book) }

    fun clearQuerySelection() {
        onInvalidateQuery()
        selectedAreaId = ""
        selectedSeatId = ""
        selectedFloorSeat = null
        showConfirmDialog = false
        seatListExpanded = false
    }

    val isTablet = useTwoPaneLayout()
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
    val startMinute = timeTextToMinute(startTime)
    val endMinute = timeTextToMinute(endTime)
    val areaQuery = LibrarySeatQuery(
        selectedVenue?.id.orEmpty(), selectedDate, startMinute ?: -1, endMinute ?: -1,
        selectedFloorId.takeIf(String::isNotBlank), wantPower, wantWindow,
    )
    val selectedAreas = state.areas.takeIf { state.query == areaQuery }.orEmpty().filter { area ->
        (selectedVenue?.id.isNullOrBlank() || area.venueId.isBlank() || area.venueId == selectedVenue?.id) &&
            (selectedFloor?.id.isNullOrBlank() || area.floorId.isBlank() || area.floorId == selectedFloor?.id)
    }
    val selectedArea = selectedAreas.firstOrNull { it.id == selectedAreaId || it.id == state.selectedAreaId }
    val selectedSeats = state.seats.takeIf { state.query == areaQuery && state.selectedAreaId == selectedAreaId }.orEmpty()
    val floorSeats = state.floorSeats.takeIf {
        state.query == areaQuery.copy(floorId = secondFloor?.id, power = false, window = false)
    }.orEmpty()
    val canQuery = selectedVenue != null && selectedDate.isNotBlank() && startMinute != null && endMinute != null && endMinute > startMinute

    val queryAreasButton: @Composable (Modifier) -> Unit = { buttonModifier ->
        AppButton(
            text = "查询阅览区",
            icon = Icons.Outlined.Search,
            onClick = {
                val venue = selectedVenue
                val sMinute = timeTextToMinute(startTime)
                val eMinute = timeTextToMinute(endTime)
                if (venue == null || selectedDate.isBlank() || sMinute == null || eMinute == null || eMinute <= sMinute) {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                } else {
                    queryHint = null
                    onClearFeedback()
                    clearQuerySelection()
                    queryMode = "areas"
                    seatListExpanded = false
                    selectedAreaId = ""
                    selectedSeatId = ""
                    onQueryAreas(
                        venue.id,
                        selectedDate,
                        sMinute,
                        eMinute,
                        selectedFloorId.takeIf(String::isNotBlank),
                        50,
                        wantPower,
                        wantWindow,
                    )
                }
            },
            modifier = buttonModifier,
            enabled = canQuery && !state.areasLoading,
            loading = state.areasLoading,
        )
    }
    val queryFloorButton: @Composable (Modifier) -> Unit = { buttonModifier ->
        AppSecondaryButton(
            text = "二层 1-45",
            icon = Icons.Outlined.Chair,
            onClick = {
                val venue = selectedVenue
                val floor = secondFloor
                val sMinute = timeTextToMinute(startTime)
                val eMinute = timeTextToMinute(endTime)
                if (venue == null || floor == null || selectedDate.isBlank() || sMinute == null || eMinute == null || eMinute <= sMinute) {
                    queryHint = "请先选择有效的场馆、日期和时间。"
                } else {
                    queryHint = null
                    onClearFeedback()
                    clearQuerySelection()
                    selectedFloorId = floor.id
                    selectedAreaId = ""
                    selectedSeatId = ""
                    queryMode = "floor"
                    onQueryFloorSeats(venue.id, floor.id, selectedDate, sMinute, eMinute)
                }
            },
            modifier = buttonModifier,
            enabled = canQuery && secondFloor != null && !state.floorSeatsLoading,
            loading = state.floorSeatsLoading,
        )
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
                clearQuerySelection()
                selectedVenueId = state.selectedVenueId?.takeIf { id -> state.venues.any { it.id == id } }
                    ?: state.venues.first().id
            }
        }
    }
    LaunchedEffect(state.dates) {
        if (state.dates.isNotEmpty()) {
            if (selectedDate.isBlank() || !state.dates.contains(selectedDate)) {
                clearQuerySelection()
                selectedDate = state.selectedDate?.takeIf(state.dates::contains) ?: state.dates.first()
            }
        }
    }
    LaunchedEffect(selectedVenueId, state.venues) {
        val floors = state.venues.firstOrNull { it.id == selectedVenueId }?.floors.orEmpty()
        if (floors.isNotEmpty() && (selectedFloorId.isBlank() || floors.none { it.id == selectedFloorId })) {
            clearQuerySelection()
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
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.Public,
                contentDescription = "打开官方座位系统",
                onClick = onOpenOfficialReservation,
            )
        },
    ) {
        item(key = "seat-tabs", contentType = "tab") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LibrarySeatTab.entries.forEach { tab ->
                    val isSelected = selectedTab == tab
                    val badgeCount = when (tab) {
                        LibrarySeatTab.My -> state.reservations.count(::isActiveSeatReservation)
                        LibrarySeatTab.Waitlist -> state.waitlists.count { it.enabled && it.status == "listening" }
                        LibrarySeatTab.Book -> 0
                    }
                    Surface(
                        onClick = {
                            if (selectedTab != tab) {
                                selectedTab = tab
                                when (tab) {
                                    LibrarySeatTab.My -> onLoadReservations()
                                    LibrarySeatTab.Waitlist -> onLoadWaitlists()
                                    LibrarySeatTab.Book -> Unit
                                }
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = when (tab) {
                                    LibrarySeatTab.Book -> Icons.Outlined.Search
                                    LibrarySeatTab.My -> Icons.Outlined.EventAvailable
                                    LibrarySeatTab.Waitlist -> Icons.Outlined.NotificationsActive
                                },
                                contentDescription = null,
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = tab.label,
                                style = MaterialTheme.typography.titleSmall.copy(fontSize = 13.sp),
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                            if (badgeCount > 0) {
                                Spacer(Modifier.width(4.dp))
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                ) {
                                    Text(
                                        text = "$badgeCount",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                                    )
                                }
                            }
                        }
                    }
                }
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

        if (selectedTab == LibrarySeatTab.Book) {
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
                                clearQuerySelection()
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
                                clearQuerySelection()
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
                                    clearQuerySelection()
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
                            clearQuerySelection()
                            startTime = it
                            selectedAreaId = ""
                            selectedSeatId = ""
                        },
                        onEndTimeChange = {
                            clearQuerySelection()
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
                            onClick = { clearQuerySelection(); wantWindow = !wantWindow },
                            label = { Text("靠窗") },
                        )
                        FilterChip(
                            selected = wantPower,
                            onClick = { clearQuerySelection(); wantPower = !wantPower },
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
                        val seatsPerRow = adaptiveGridColumnCount(
                            maxWidth = appContentWidth() - AppPageHorizontalPadding * 2 - 28.dp,
                            fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale,
                            minCellWidth = 64.dp,
                            maxColumns = 8,
                            spacing = 8.dp,
                        )
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
                    } else if (floorSeats.isEmpty()) {
                        EmptyBlock("暂无 1-45 号座位结果", "请选择时段后点击上方按钮查询。")
                    } else {
                        Text(
                            text = "共 ${floorSeats.size} 个座位 · ${floorSeats.count { it.seat.isFree }} 个可预约",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "绿色 = 可预约 · 灰色 = 占用/不可用 · 顶部/底部色条 = 座位朝向",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        SecondFloorSeatMap(
                            floorSeats = floorSeats,
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

        } else if (selectedTab == LibrarySeatTab.My) {
            item(key = "my-reservations-panel", contentType = "my") {
                MySeatReservationsPanel(
                    reservations = state.reservations,
                    loading = state.reservationsLoading,
                    history = state.historyReservations,
                    historyLoading = state.historyReservationsLoading,
                    onLoadReservations = onLoadReservations,
                    onLoadHistory = onLoadReservationHistory,
                    onGoToBookSeat = { selectedTab = LibrarySeatTab.Book },
                )
            }
        } else {
            item(key = "waitlist-panel", contentType = "waitlist") {
                LibrarySeatWaitlistPanel(
                    state = state,
                    selectedVenue = selectedVenue,
                    selectedFloor = selectedFloor,
                    selectedDate = selectedDate,
                    startTime = startTime,
                    endTime = endTime,
                    secondFloor = secondFloor,
                    floorSeats = floorSeats,
                    floorSeatsLoading = state.floorSeatsLoading,
                    onStartTimeChange = { clearQuerySelection(); startTime = it },
                    onEndTimeChange = { clearQuerySelection(); endTime = it },
                    onVenueSelected = { venueId ->
                        clearQuerySelection()
                        selectedVenueId = venueId
                        selectedFloorId = ""
                        selectedAreaId = ""
                        selectedSeatId = ""
                    },
                    onFloorSelected = { floorId ->
                        clearQuerySelection()
                        selectedFloorId = floorId
                        selectedAreaId = ""
                        selectedSeatId = ""
                    },
                    onDateSelected = { date ->
                        clearQuerySelection()
                        selectedDate = date
                        selectedAreaId = ""
                        selectedSeatId = ""
                    },
                    onQueryFloorSeats = onQueryFloorSeats,
                    onClearFeedback = onClearFeedback,
                    onCreateWaitlist = { request -> onCreateWaitlist(request) {} },
                    onSetWaitlistEnabled = { taskId, enabled -> onSetWaitlistEnabled(taskId, enabled) {} },
                    onDeleteWaitlist = { taskId -> onDeleteWaitlist(taskId) {} },
                )
            }
        }
    }

    if (showConfirmDialog) {
        val startMinute = timeTextToMinute(startTime) ?: return
        val endMinute = timeTextToMinute(endTime) ?: return
        if (endMinute <= startMinute) return
        val floorSeat = selectedFloorSeat?.takeIf { selected -> floorSeats.any { it.seat.id == selected.seat.id } }
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
    onGoToBookSeat: () -> Unit,
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
    selectedLabels: Set<Int> = emptySet(),
    allowMissingSeats: Boolean = false,
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
                        selected = label in selectedLabels,
                        onClick = floorSeat?.let { seat -> { onSeatClick(seat) } }
                            ?: if (allowMissingSeats) {
                                {
                                    onSeatClick(
                                        LibrarySeatFloorSeat(
                                            areaId = "",
                                            areaName = "",
                                            seat = LibrarySeatStatus(
                                                id = label.toString(),
                                                label = label.toString(),
                                            ),
                                        )
                                    )
                                }
                            } else {
                                null
                            },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun SecondFloorSeatCell(
    label: Int,
    floorSeat: LibrarySeatFloorSeat?,
    faceDown: Boolean,
    selected: Boolean = false,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val seat = floorSeat?.seat
    val shape = RoundedCornerShape(7.dp)
    val background = when {
        selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
        seat == null -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f)
        seat.isFree -> ColorTokens.Green.foreground.copy(alpha = 0.16f)
        seat.status.equals("IN_USE", ignoreCase = true) -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    }
    val borderColor = when {
        selected -> MaterialTheme.colorScheme.primary
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
        seat.isFree -> ColorTokens.Green.foreground.copy(alpha = 0.8f)
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    val backColor = when {
        selected -> MaterialTheme.colorScheme.primary
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        seat.isFree -> ColorTokens.Green.foreground
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
            color = glassCardColor(),
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

@Composable
private fun LibrarySeatWaitlistPanel(
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

    val startMinute = timeTextToMinute(startTime)
    val endMinute = timeTextToMinute(endTime)
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
            SectionHeader("新建候补任务", "座位被占时自动监听释放座位并立即预约")
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
                    enabled = state.venues.isNotEmpty(),
                    onExpandedChange = { venueMenuOpen = it },
                    options = state.venues.map { venue ->
                        SelectionOption(venue.id, venue.name, if (venue.floors.isNotEmpty()) "${venue.floors.size} 层" else "暂无楼层")
                    },
                    onSelect = { option ->
                        onVenueSelected(option.id)
                    },
                )
                SelectionSurface(
                    label = "楼层",
                    value = selectedFloor?.name ?: "请选择",
                    placeholder = "请选择楼层",
                    modifier = Modifier.weight(1f),
                    expanded = floorMenuOpen,
                    enabled = selectedVenue != null && selectedVenue.floors.isNotEmpty(),
                    onExpandedChange = { floorMenuOpen = it },
                    options = selectedVenue?.floors.orEmpty().map { floor ->
                        SelectionOption(floor.id, floor.name)
                    },
                    onSelect = { option ->
                        onFloorSelected(option.id)
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
            ReservationTimeRangePicker(
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
            SectionHeader("我的候补任务", "开启后由服务端持续监听，成功即自动结束")
            when {
                state.waitlistsLoading && state.waitlists.isEmpty() -> LoadingBlock("正在加载候补任务...")
                state.waitlists.isEmpty() -> EmptyBlock(
                    "暂无候补任务",
                    "选好日期、时段与座位范围后点击上方按钮开启监听。",
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
                    LoadingBlock("正在查询 1-45 号座位...")
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
