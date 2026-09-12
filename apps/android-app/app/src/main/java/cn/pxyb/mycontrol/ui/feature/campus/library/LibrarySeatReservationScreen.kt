package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistRequest
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppMetricCell
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonInlineRows
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonMetricRow
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonSeatGrid
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.adaptiveGridColumnCount
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.components.picker.AppTimeRangePicker
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes

internal enum class LibrarySeatTab(val label: String) {
    Book("查询座位"),
    My("我的预约"),
    Waitlist("候补预约"),
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LibrarySeatReservationScreen(
    state: LibrarySeatUiState,
    initialTab: LibrarySeatTab = LibrarySeatTab.Book,
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
    var selectedTab by rememberSaveable { mutableStateOf(initialTab) }

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
            val startMinute = parseTimeMinutes(startTime)
            val endMinute = parseTimeMinutes(endTime)
            if (startMinute != null && endMinute != null && endMinute > startMinute) {
                onLoadSeats(clickedArea.id, selectedDate, startMinute, endMinute, 0)
            }
        }
    }

    val selectedVenue = state.venues.firstOrNull { it.id == selectedVenueId } ?: state.venues.firstOrNull()
    val selectedFloor = selectedVenue?.floors?.firstOrNull { it.id == selectedFloorId }
    val secondFloor = selectedVenue?.floors?.firstOrNull { isSecondFloorName(it.name) }
    val startMinute = parseTimeMinutes(startTime)
    val endMinute = parseTimeMinutes(endTime)
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
                val sMinute = parseTimeMinutes(startTime)
                val eMinute = parseTimeMinutes(endTime)
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
                val sMinute = parseTimeMinutes(startTime)
                val eMinute = parseTimeMinutes(endTime)
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
    AppSubPage(
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
                AppFeedbackBanner(message, error = false)
            }
        }
        state.error?.takeIf(String::isNotBlank)?.let { message ->
            item(key = "seat-error", contentType = "banner") {
                AppFeedbackBanner(
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
                AppFeedbackBanner(hint, error = false)
            }
        }

        if (selectedTab == LibrarySeatTab.Book) {
        item(key = "seat-overview", contentType = "summary") {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSectionHeader(title = "座位总览", subtitle = "先选场馆和时间，再查阅览区与座位")
                    if (state.overviewLoading && state.venues.isEmpty()) {
                        AppSkeletonMetricRow(count = 4)
                        AppSkeletonInlineRows(
                            rowCount = 2,
                            leadingSize = 26.dp,
                            lineWidths = listOf(0.38f, 0.62f),
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            AppMetricCell("场馆", state.venues.size.toString(), Modifier.weight(1f))
                            AppMetricCell("日期", state.dates.size.toString(), Modifier.weight(1f))
                            AppMetricCell("阅览区", state.areas.size.toString(), Modifier.weight(1f))
                            AppMetricCell("座位", state.seats.size.toString(), Modifier.weight(1f))
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
                    AppSectionHeader(title = "筛选条件", subtitle = "选择楼馆、楼层、日期和预约时段")
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
                            onExpandedChange = { venueMenuOpen = it },
                            options = state.venues.map { venue ->
                                AppSelectOption(venue.id, venue.name, if (venue.floors.isNotEmpty()) "${venue.floors.size} 层" else "暂无楼层")
                            },
                            onValueChange = { selectedValue ->
                                clearQuerySelection()
                                selectedVenueId = selectedValue
                                selectedFloorId = state.venues.firstOrNull { it.id == selectedValue }?.floors?.firstOrNull()?.id.orEmpty()
                                selectedAreaId = ""
                                selectedSeatId = ""
                            },
                        )
                        AppSelectField(
                            label = "楼层",
                            value = if (selectedVenue == null) null else selectedFloor?.id.orEmpty(),
                            placeholder = "全部楼层",
                            modifier = Modifier.weight(1f),
                            expanded = floorMenuOpen,
                            enabled = selectedVenue != null && selectedVenue.floors.isNotEmpty(),
                            onExpandedChange = { floorMenuOpen = it },
                            options = buildList {
                                add(AppSelectOption("", "全部楼层", "不过滤楼层"))
                                selectedVenue?.floors.orEmpty().forEach { floor ->
                                    add(AppSelectOption(floor.id, floor.name))
                                }
                            },
                            onValueChange = { selectedValue ->
                                clearQuerySelection()
                                selectedFloorId = selectedValue
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
                    AppTimeRangePicker(
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
                AppSectionHeader(
                    title = "可预约阅览区",
                    subtitle = if (selectedAreas.isEmpty() && !state.areasLoading) "先点击查询，学校返回可预约区域后再选座位" else "点击某个阅览区后加载座位列表",
                )
                if (state.areasLoading) {
                    AppPanel {
                        AppSkeletonInlineRows(
                            rowCount = 2,
                            leadingSize = 30.dp,
                            modifier = Modifier.padding(14.dp),
                            lineWidths = listOf(0.34f, 0.58f),
                        )
                    }
                } else if (selectedAreas.isEmpty()) {
                    AppPanel { AppEmptyState("暂无阅览区结果", detail = "请先查询，或调整日期与时段后重试。") }
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
                        AppSectionHeader(
                            title = "座位列表",
                            subtitle = selectedArea?.let { "${it.name} · ${it.floorName.ifBlank { "未注明楼层" }}" } ?: "先选一个阅览区",
                        )
                    if (state.seatsLoading) {
                        AppSkeletonSeatGrid(columns = 6, rows = 2, cellHeight = 36.dp)
                    } else if (selectedSeats.isEmpty()) {
                        AppEmptyState("暂无座位结果", detail = "如果阅览区已选中，请尝试刷新或重新查询。")
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
                        AppSectionHeader(
                            title = "二层 1-45 号座位",
                            subtitle = "按当前日期与时段显示空闲状态",
                        )
                    if (state.floorSeatsLoading) {
                        AppSkeletonSeatGrid(columns = 6, rows = 2, cellHeight = 34.dp)
                    } else if (floorSeats.isEmpty()) {
                        AppEmptyState("暂无 1-45 号座位结果", detail = "请选择时段后点击上方按钮查询。")
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
        val startMinute = parseTimeMinutes(startTime) ?: return
        val endMinute = parseTimeMinutes(endTime) ?: return
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
