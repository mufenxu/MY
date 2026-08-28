package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private enum class ReservationTab(val label: String) {
    Single("单次预约"),
    My("已约空间"),
    Auto("自动任务"),
}

@Composable
fun ReservationScreen(
    state: ReservationUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadSpaces: () -> Unit,
    onLoadMyReservations: () -> Unit,
    onOpenOfficialReservation: () -> Unit,
    onCancelMyReservation: (String) -> Unit,
    onQueryRulesAndAvailability: (Int, String) -> Unit,
    onQuerySpacesByTime: (String, String, String) -> Unit,
    onSubmitReservation: (CampusReservationRequest, () -> Unit) -> Unit,
    onLoadAutoTasks: () -> Unit,
    onSaveAutoTask: (CampusAutoReservationTask, () -> Unit) -> Unit,
    onToggleAutoTask: (CampusAutoReservationTask) -> Unit,
    onDeleteAutoTask: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(ReservationTab.Single) }

    LaunchedEffect(Unit) {
        onLoadSpaces()
        onLoadMyReservations()
        onLoadAutoTasks()
    }

    WorkspacePage(
        title = "研讨间预约",
        subtitle = "图书馆空间预约 · 自动任务",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing || state.spacesLoading || state.myReservationsLoading || state.autoTasksLoading,
        onRefresh = onRefresh,
    ) {
        item(key = "tab-selector", contentType = "tab") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ReservationTab.entries.forEach { tab ->
                    val isSelected = selectedTab == tab
                    val badgeCount = if (tab == ReservationTab.My) state.myReservations.size else 0
                    Surface(
                        onClick = { selectedTab = tab },
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
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
                                    ReservationTab.Single -> Icons.Outlined.MeetingRoom
                                    ReservationTab.My -> Icons.Outlined.EventAvailable
                                    ReservationTab.Auto -> Icons.Outlined.AutoAwesome
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

        item(key = "official-reservation-entry", contentType = "action") {
            OutlinedButton(
                onClick = onOpenOfficialReservation,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp),
                shape = RoundedCornerShape(10.dp),
            ) {
                Icon(
                    Icons.Outlined.Public,
                    contentDescription = null,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "打开学校官方预约",
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                )
            }
        }

        state.message?.let { message ->
            item(key = "reservation-success-msg", contentType = "banner") {
                FeedbackBanner(message = message, error = false)
            }
        }

        state.error?.let { message ->
            item(key = "reservation-error-msg", contentType = "banner") {
                FeedbackBanner(
                    message = if (message.contains("登录") || message.contains("会话")) {
                        "学校账号登录已失效，请重新登录后再试。"
                    } else {
                        "操作失败：$message"
                    },
                    error = true,
                )
            }
        }

        when (selectedTab) {
            ReservationTab.Single -> {
                item(key = "single-reservation-form", contentType = "form") {
                    SingleReservationPanel(
                        spaces = state.spaces,
                        spacesLoading = state.spacesLoading,
                        queryLoading = state.queryLoading,
                        availableSpaces = state.availableSpaces,
                        availableSpacesQueryText = state.availableSpacesQueryText,
                        availableSpacesLoading = state.availableSpacesLoading,
                        submitLoading = state.submitLoading,
                        rules = state.rules,
                        availability = state.availability,
                        freeWindows = state.freeWindows,
                        busyWindows = state.busyWindows,
                        availabilitySpaceId = state.availabilitySpaceId,
                        availabilityDate = state.availabilityDate,
                        myReservations = state.myReservations,
                        onReloadSpaces = onLoadSpaces,
                        onQuery = onQueryRulesAndAvailability,
                        onQuerySpacesByTime = onQuerySpacesByTime,
                        onSubmit = onSubmitReservation,
                        onNavigateToMyReservations = { selectedTab = ReservationTab.My },
                        onClearFeedback = onClearFeedback,
                    )
                }
            }
            ReservationTab.My -> {
                item(key = "my-reservations-panel", contentType = "my") {
                    MyReservationsPanel(
                        reservations = state.myReservations,
                        loading = state.myReservationsLoading,
                        cancellingId = state.cancellingReservationId,
                        onRefresh = onLoadMyReservations,
                        onCancelReservation = onCancelMyReservation,
                        onGoToSingleReservation = { selectedTab = ReservationTab.Single },
                    )
                }
            }
            ReservationTab.Auto -> {
                item(key = "auto-reservation-panel", contentType = "auto") {
                    AutoReservationPanel(
                        spaces = state.spaces,
                        tasks = state.autoTasks,
                        tasksLoading = state.autoTasksLoading,
                        savingTask = state.savingTask,
                        deletingTaskId = state.deletingTaskId,
                        onReloadSpaces = onLoadSpaces,
                        onSaveTask = onSaveAutoTask,
                        onToggleTask = onToggleAutoTask,
                        onDeleteTask = onDeleteAutoTask,
                        onClearFeedback = onClearFeedback,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SingleReservationPanel(
    spaces: List<CampusReservationSpace>,
    spacesLoading: Boolean,
    queryLoading: Boolean,
    availableSpaces: List<CampusReservationSpace>,
    availableSpacesQueryText: String?,
    availableSpacesLoading: Boolean,
    submitLoading: Boolean,
    rules: String?,
    availability: String?,
    freeWindows: List<CampusReservationTimeWindow>,
    busyWindows: List<CampusReservationTimeWindow>,
    availabilitySpaceId: Int?,
    availabilityDate: String?,
    myReservations: List<CampusMyReservation>,
    onReloadSpaces: () -> Unit,
    onQuery: (Int, String) -> Unit,
    onQuerySpacesByTime: (String, String, String) -> Unit,
    onSubmit: (CampusReservationRequest, () -> Unit) -> Unit,
    onNavigateToMyReservations: () -> Unit,
    onClearFeedback: () -> Unit,
) {
    val today = remember { LocalDate.now() }
    var selectedSpaceId by rememberSaveable { mutableIntStateOf(0) }
    var dayOffset by rememberSaveable { mutableIntStateOf(1) } // 默认预约明天
    val selectedDate = remember(dayOffset) {
        today.plusDays(dayOffset.toLong()).format(DateTimeFormatter.ISO_LOCAL_DATE)
    }
    var startTime by rememberSaveable { mutableStateOf("09:00") }
    var endTime by rememberSaveable { mutableStateOf("11:00") }
    var title by rememberSaveable { mutableStateOf("个人课程研读与学习") }
    var content by rememberSaveable { mutableStateOf("用于个人课程自主研读、文献查阅及学术研讨。") }
    var mobile by rememberSaveable { mutableStateOf("18783388384") }
    var open by rememberSaveable { mutableStateOf(false) }

    var spaceDropdownOpen by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var formValidationNotice by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(spaces) {
        if (selectedSpaceId == 0 && spaces.isNotEmpty()) {
            selectedSpaceId = spaces.first().id
        }
    }

    val selectedSpace = spaces.firstOrNull { it.id == selectedSpaceId }
    val selectedSpaceName = selectedSpace?.name ?: if (spacesLoading) "正在加载空间..." else "请选择空间"
    val isQueriedCurrent = availabilitySpaceId == selectedSpaceId && availabilityDate == selectedDate
    val currentFreeWindows = if (isQueriedCurrent) freeWindows else emptyList()
    val currentBusyWindows = if (isQueriedCurrent) busyWindows else emptyList()
    val queriedWindowText = reservationWindowText(currentFreeWindows)

    // 计算当前所选时长及合法性提示
    val startMin = reservationTimeMinutes(startTime)
    val endMin = reservationTimeMinutes(endTime)
    val durationMin = if (startMin != null && endMin != null && endMin > startMin) endMin - startMin else null
    val isDurationValid = durationMin != null && durationMin in 60..240

    // 现代统一提交确认弹窗
    if (showConfirmDialog) {
        AppDialog(
            onDismissRequest = { showConfirmDialog = false },
            icon = Icons.Outlined.MeetingRoom,
            iconTint = MaterialTheme.colorScheme.primary,
            iconBackground = MaterialTheme.colorScheme.primaryContainer,
            title = "提交前确认",
            subtitle = "请核对研讨间预约详情，确认无误后提交",
            footer = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "返回修改",
                        onClick = { showConfirmDialog = false },
                        modifier = Modifier.weight(1f),
                    )
                    AppDialogPrimaryButton(
                        text = "确认提交",
                        onClick = {
                            showConfirmDialog = false
                            val req = CampusReservationRequest(
                                areaId = selectedSpaceId,
                                date = selectedDate,
                                startTime = startTime,
                                endTime = endTime,
                                title = title.trim(),
                                content = content.trim(),
                                mobile = mobile.trim(),
                                open = open,
                            )
                            onSubmit(req) {}
                        },
                        modifier = Modifier.weight(1f),
                        busy = submitLoading,
                    )
                }
            },
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DetailRow("预约空间", selectedSpaceName)
                    DetailRow("预约日期", "$selectedDate (${weekdayName(today.plusDays(dayOffset.toLong()))})")
                    DetailRow("预约时段", "$startTime - $endTime (${durationMin?.let { "${it / 60}小时${if (it % 60 > 0) "${it % 60}分" else ""}" } ?: ""})")
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    DetailRow("申请主题", title)
                    DetailRow("联系电话", mobile)
                    DetailRow("公开申请", if (open) "是" else "否")
                    if (content.isNotBlank()) {
                        DetailRow("申请用途", content)
                    }
                }
            }
        }
    }

    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded

    val cardSpaceAndTime = @Composable {
        AppPanel {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SectionHeader(
                    title = "空间与时段",
                    subtitle = "选择研讨间与目标日期，快速查看并选取空闲时段",
                    trailing = {
                        TextButton(
                            onClick = onReloadSpaces,
                            enabled = !spacesLoading,
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            if (spacesLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(4.dp))
                            Text("刷新空间", style = MaterialTheme.typography.labelMedium)
                        }
                    },
                )

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "预约空间",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Surface(
                            onClick = { spaceDropdownOpen = true },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(32.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(MaterialTheme.colorScheme.primaryContainer),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            Icons.Outlined.MeetingRoom,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                    Text(
                                        text = selectedSpaceName,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Icon(
                                    Icons.Outlined.ExpandMore,
                                    contentDescription = "选择空间",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = spaceDropdownOpen,
                            onDismissRequest = { spaceDropdownOpen = false },
                            modifier = Modifier.heightIn(max = 280.dp),
                        ) {
                            spaces.forEach { space ->
                                val isSelected = space.id == selectedSpaceId
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = space.name,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    },
                                    onClick = {
                                        selectedSpaceId = space.id
                                        spaceDropdownOpen = false
                                        onClearFeedback()
                                    },
                                )
                            }
                        }
                    }
                }

                var singleDatePickerOpen by remember { mutableStateOf(false) }
                if (singleDatePickerOpen) {
                    WheelDatePickerModal(
                        title = "选择预约日期",
                        currentDate = selectedDate,
                        today = today,
                        onDismiss = { singleDatePickerOpen = false },
                        onConfirm = { chosenDate ->
                            val parsed = runCatching { LocalDate.parse(chosenDate, DateTimeFormatter.ISO_LOCAL_DATE) }.getOrNull()
                            if (parsed != null) {
                                val offset = java.time.temporal.ChronoUnit.DAYS.between(today, parsed).toInt()
                                dayOffset = offset
                                onClearFeedback()
                            }
                        },
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "预约日期",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Surface(
                            onClick = { singleDatePickerOpen = true },
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.CalendarMonth,
                                    contentDescription = "滑动选择更多日期",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(12.dp),
                                )
                                Text(
                                    text = "滑动选日期",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        val offsets = listOf(0 to "今天", 1 to "明天", 2 to "后天", 3 to "大后天")
                        offsets.forEach { (offset, name) ->
                            val targetDate = today.plusDays(offset.toLong())
                            val isSelected = dayOffset == offset
                            val wk = weekdayName(targetDate)
                            Surface(
                                onClick = {
                                    dayOffset = offset
                                    onClearFeedback()
                                },
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f),
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(38.dp),
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.fillMaxSize(),
                                ) {
                                    Text(
                                        text = "$name($wk)",
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 11.5.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        ),
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }

                Surface(
                    onClick = {
                        if (selectedSpaceId > 0) {
                            onQuery(selectedSpaceId, selectedDate)
                            onClearFeedback()
                        }
                    },
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        if (queryLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "正在查询该空间空闲时段...",
                                style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp),
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        } else {
                            Icon(
                                Icons.Outlined.Search,
                                contentDescription = null,
                                modifier = Modifier.size(15.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                if (isQueriedCurrent) "刷新当前空间空闲时段" else "查询该空间开放规则与空闲时段",
                                style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp),
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "可预约空闲时段",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )

                    if (isQueriedCurrent) {
                        if (currentFreeWindows.isNotEmpty()) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                currentFreeWindows.forEach { win ->
                                    val isPicked = startTime == win.start && endTime == win.end
                                    Surface(
                                        onClick = {
                                            startTime = win.start
                                            endTime = win.end
                                            onClearFeedback()
                                        },
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (isPicked) Color(0xFFDCFCE7) else Color(0xFFF0FDF4),
                                        border = BorderStroke(1.dp, if (isPicked) Color(0xFF16A34A) else Color(0xFFBBF7D0)),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Icon(
                                                Icons.Outlined.CheckCircle,
                                                contentDescription = null,
                                                tint = Color(0xFF15803D),
                                                modifier = Modifier.size(13.dp),
                                            )
                                            Text(
                                                text = "${win.start} - ${win.end}",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF15803D),
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.35f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.3f)),
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Icon(
                                        Icons.Outlined.EventBusy,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Text(
                                        text = "该空间在所选日期无空闲时段或已被全部约满",
                                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    } else {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.Info,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = "选择空间和日期后，点击下方按钮查询空间空闲与已预约时段",
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                ReservationTimeRangePicker(
                    startTime = startTime,
                    endTime = endTime,
                    onStartTimeChange = { startTime = it; onClearFeedback() },
                    onEndTimeChange = { endTime = it; onClearFeedback() },
                )

                // 双向查询操作栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = {
                            if (selectedSpaceId <= 0) {
                                formValidationNotice = "请先选择空间"
                                return@OutlinedButton
                            }
                            formValidationNotice = null
                            onQuery(selectedSpaceId, selectedDate)
                        },
                        enabled = !queryLoading && selectedSpaceId > 0,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
                    ) {
                        if (queryLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                        } else {
                            Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        Text("查空间空闲时段", style = MaterialTheme.typography.labelMedium, maxLines = 1)
                    }

                    Button(
                        onClick = {
                            if (!isDurationValid) {
                                formValidationNotice = "请先设置有效的时间段（1至4小时）"
                                return@Button
                            }
                            formValidationNotice = null
                            onQuerySpacesByTime(selectedDate, startTime, endTime)
                        },
                        enabled = !availableSpacesLoading && isDurationValid,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
                    ) {
                        if (availableSpacesLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(6.dp))
                        } else {
                            Icon(Icons.Outlined.MeetingRoom, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        Text("查时段空闲房间", style = MaterialTheme.typography.labelMedium, maxLines = 1)
                    }
                }

                // 按时段查询空闲学习间结果展示
                if (availableSpacesLoading || availableSpacesQueryText != null) {
                    AvailableSpacesByTimeBlock(
                        queryText = availableSpacesQueryText,
                        availableSpaces = availableSpaces,
                        selectedSpaceId = selectedSpaceId,
                        loading = availableSpacesLoading,
                        onSelectSpace = { space ->
                            selectedSpaceId = space.id
                            onClearFeedback()
                        },
                    )
                }
            }
        }
    }

    val cardRulesAndAvailability = @Composable {
        if (rules != null || availability != null) {
            AppPanel {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionHeader(
                        title = "空间开放规则与说明",
                        subtitle = "该研讨间的详细预约开放规则与时段细则",
                    )

                    if (availability != null) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)),
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = "空闲时段说明",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Text(
                                    text = availability,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }

                    if (rules != null) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "详细预约规则",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            ScrollableRuleText(text = rules)
                        }
                    }
                }
            }
        }
    }

    val cardApplicationInfo = @Composable {
        AppPanel {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                SectionHeader(
                    title = "预约申请信息",
                    subtitle = "填写研讨间用途与申请人联系方式",
                )

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it; onClearFeedback() },
                    label = { Text("申请主题 *") },
                    placeholder = { Text("例如：小组课程研讨 / 论文开题讨论") },
                    leadingIcon = {
                        Icon(Icons.Outlined.EditNote, contentDescription = null, modifier = Modifier.size(20.dp))
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = mobile,
                    onValueChange = { mobile = it; onClearFeedback() },
                    label = { Text("联系电话 *") },
                    placeholder = { Text("11 位手机号码") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Phone, contentDescription = null, modifier = Modifier.size(18.dp))
                    },
                    shape = RoundedCornerShape(8.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it; onClearFeedback() },
                    label = { Text("申请用途 / 说明 *") },
                    placeholder = { Text("简要说明使用研讨间的具体用途与参与人数（最多 500 字）") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                )

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(
                                Icons.Outlined.Public,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp),
                            )
                            Column {
                                Text("公开本次申请", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                Text("在系统中公开展示申请主题与预约时段", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Switch(checked = open, onCheckedChange = { open = it; onClearFeedback() })
                    }
                }

                formValidationNotice?.let { notice ->
                    FeedbackBanner(message = notice, error = true)
                }

                Button(
                    onClick = {
                        if (selectedSpaceId <= 0) {
                            formValidationNotice = "请选择预约空间"
                            return@Button
                        }
                        if (currentFreeWindows.isEmpty()) {
                            formValidationNotice = "请先点击上方“查询该空间开放规则与空闲时段”"
                            return@Button
                        }
                        if (!isDurationValid) {
                            formValidationNotice = "预约时段需为 1 至 4 小时"
                            return@Button
                        }
                        if (title.isBlank()) {
                            formValidationNotice = "请填写申请主题"
                            return@Button
                        }
                        if (mobile.isBlank()) {
                            formValidationNotice = "请填写联系电话"
                            return@Button
                        }
                        if (content.isBlank()) {
                            formValidationNotice = "请填写申请用途说明"
                            return@Button
                        }
                        formValidationNotice = null
                        showConfirmDialog = true
                    },
                    enabled = !submitLoading,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                ) {
                    if (submitLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(8.dp))
                    } else {
                        Icon(Icons.Outlined.FactCheck, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("核对并提交预约", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }
        }
    }

    if (isTablet) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                cardSpaceAndTime()
                cardRulesAndAvailability()
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                cardApplicationInfo()
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            cardSpaceAndTime()
            cardApplicationInfo()
            cardRulesAndAvailability()
        }
    }
}

@Composable
private fun ScrollableRuleText(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
    ) {
        Box(
            modifier = Modifier
                .heightIn(max = 200.dp)
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 20.sp,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FreeWindowList(
    windows: List<CampusReservationTimeWindow>,
    selectedStart: String,
    selectedEnd: String,
    onSelectWindow: (CampusReservationTimeWindow) -> Unit,
) {
    if (windows.isEmpty()) return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        windows.forEach { window ->
            val isSelected = selectedStart == window.start && selectedEnd == window.end
            Surface(
                onClick = { onSelectWindow(window) },
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(
                    1.dp,
                    if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                ),
                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (isSelected) {
                        Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                    Text(
                        text = "${window.start} - ${window.end}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BusyWindowList(
    windows: List<CampusReservationTimeWindow>,
) {
    if (windows.isEmpty()) return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        windows.forEach { window ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.error.copy(alpha = 0.35f),
                ),
                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.22f),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = "${window.start} - ${window.end} (已预约)",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AvailableSpacesByTimeBlock(
    queryText: String?,
    availableSpaces: List<CampusReservationSpace>,
    selectedSpaceId: Int,
    loading: Boolean,
    onSelectSpace: (CampusReservationSpace) -> Unit,
) {
    if (loading) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "正在查询该时段空闲学习间...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        return
    }

    if (queryText == null) return

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = if (availableSpaces.isNotEmpty()) Color(0xFFF0FDF4) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        border = BorderStroke(
            1.dp,
            if (availableSpaces.isNotEmpty()) Color(0xFF86EFAC) else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        if (availableSpaces.isNotEmpty()) Icons.Outlined.CheckCircle else Icons.Outlined.Info,
                        contentDescription = null,
                        tint = if (availableSpaces.isNotEmpty()) Color(0xFF16803B) else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = if (availableSpaces.isNotEmpty()) "在该时段找到 ${availableSpaces.size} 间空闲学习间" else "该时段暂无空闲学习间",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (availableSpaces.isNotEmpty()) Color(0xFF16803B) else MaterialTheme.colorScheme.onSurface,
                    )
                }
                if (availableSpaces.isNotEmpty()) {
                    Text(
                        text = "点击可直接选中",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF15803D),
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            if (availableSpaces.isNotEmpty()) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    availableSpaces.forEach { space ->
                        val isSelected = space.id == selectedSpaceId
                        Surface(
                            onClick = { onSelectSpace(space) },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSelected) MaterialTheme.colorScheme.primary else Color.White,
                            contentColor = if (isSelected) Color.White else Color(0xFF1E293B),
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else Color(0xFFBBF7D0),
                            ),
                            shadowElevation = if (isSelected) 2.dp else 0.5.dp,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Icon(
                                    imageVector = if (isSelected) Icons.Outlined.CheckCircle else Icons.Outlined.MeetingRoom,
                                    contentDescription = null,
                                    tint = if (isSelected) Color.White else Color(0xFF059669),
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = space.name,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            } else {
                Text(
                    text = "在选定日期与时段（$queryText）暂无可预约研讨间/学习间，建议调整时段或选择其他日期。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MyReservationsPanel(
    reservations: List<CampusMyReservation>,
    loading: Boolean,
    cancellingId: String?,
    onRefresh: () -> Unit,
    onCancelReservation: (String) -> Unit,
    onGoToSingleReservation: () -> Unit,
) {
    var cancellingTarget by remember { mutableStateOf<CampusMyReservation?>(null) }

    if (cancellingTarget != null) {
        val target = cancellingTarget!!
        AppDialog(
            onDismissRequest = { cancellingTarget = null },
            icon = Icons.Outlined.WarningAmber,
            iconTint = MaterialTheme.colorScheme.error,
            iconBackground = MaterialTheme.colorScheme.errorContainer,
            title = "取消预约确认",
            subtitle = "确定要取消【${target.spaceName}】在 ${target.date} ${target.startTime}-${target.endTime} 的预约吗？",
            footer = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "保留预约",
                        onClick = { cancellingTarget = null },
                        modifier = Modifier.weight(1f),
                    )
                    AppDialogPrimaryButton(
                        text = "确认取消",
                        onClick = {
                            val id = target.id
                            cancellingTarget = null
                            onCancelReservation(id)
                        },
                        modifier = Modifier.weight(1f),
                        busy = cancellingId == target.id,
                    )
                }
            },
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DetailRow("预约空间", target.spaceName)
                    DetailRow("预约日期", target.date)
                    DetailRow("预约时段", "${target.startTime} - ${target.endTime}")
                    if (target.title.isNotBlank()) {
                        DetailRow("预约主题", target.title)
                    }
                }
            }
        }
    }

    AppPanel {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        "我的已约空间",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                        ),
                    )
                    Text(
                        "学校图书馆研讨间系统当前已生效的个人预约凭证",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(8.dp))
                Surface(
                    onClick = onRefresh,
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.size(36.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (loading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(
                                Icons.Outlined.Refresh,
                                contentDescription = "刷新已约记录",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (reservations.isEmpty() && !loading) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp, horizontal = 16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.EventAvailable,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                "暂无已预约的研讨间",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                "您在学校图书馆系统暂无生效中的个人预约记录",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                        }
                        Button(
                            onClick = onGoToSingleReservation,
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        ) {
                            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("前往单次预约", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                val adaptive = LocalAdaptiveWindow.current
                val isTablet = adaptive.isTabletOrExpanded

                if (isTablet) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        reservations.chunked(2).forEach { rowReservations ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                rowReservations.forEach { reservation ->
                                    Box(modifier = Modifier.weight(1f)) {
                                        ReservationCard(
                                            reservation = reservation,
                                            isCancelling = cancellingId == reservation.id,
                                            onCancel = { cancellingTarget = reservation },
                                        )
                                    }
                                }
                                if (rowReservations.size == 1) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        reservations.forEach { reservation ->
                            ReservationCard(
                                reservation = reservation,
                                isCancelling = cancellingId == reservation.id,
                                onCancel = { cancellingTarget = reservation },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReservationCard(
    reservation: CampusMyReservation,
    isCancelling: Boolean,
    onCancel: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.MeetingRoom,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Column {
                        Text(
                            text = reservation.spaceName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (reservation.id.isNotBlank() && !reservation.id.startsWith("local_") && !reservation.id.startsWith("remote_")) {
                            Text(
                                text = "单号：${reservation.id}",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = Color(0xFFDCFCE7),
                    border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                ) {
                    Text(
                        text = reservation.statusText,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = Color(0xFF15803D),
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "${reservation.date}   ${reservation.startTime} - ${reservation.endTime}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                if (reservation.title.isNotBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = reservation.title,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            if (reservation.canCancel) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    OutlinedButton(
                        onClick = onCancel,
                        enabled = !isCancelling,
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                        modifier = Modifier.height(34.dp),
                    ) {
                        if (isCancelling) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(6.dp))
                        } else {
                            Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                        }
                        Text("取消预约", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun AutoReservationPanel(
    spaces: List<CampusReservationSpace>,
    tasks: List<CampusAutoReservationTask>,
    tasksLoading: Boolean,
    savingTask: Boolean,
    deletingTaskId: String?,
    onReloadSpaces: () -> Unit,
    onSaveTask: (CampusAutoReservationTask, () -> Unit) -> Unit,
    onToggleTask: (CampusAutoReservationTask) -> Unit,
    onDeleteTask: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var isEditing by remember { mutableStateOf(false) }
    var editingTask by remember { mutableStateOf<CampusAutoReservationTask?>(null) }
    var taskToDelete by remember { mutableStateOf<CampusAutoReservationTask?>(null) }

    // 删除确认弹窗升级为 AppDialog
    if (taskToDelete != null) {
        val target = taskToDelete!!
        AppDialog(
            onDismissRequest = { taskToDelete = null },
            icon = Icons.Outlined.Delete,
            iconTint = MaterialTheme.colorScheme.error,
            iconBackground = MaterialTheme.colorScheme.errorContainer,
            title = "确认删除任务",
            subtitle = "确定要删除自动预约任务“${target.name}”吗？此操作无法撤销。",
            footer = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "取消",
                        onClick = { taskToDelete = null },
                        modifier = Modifier.weight(1f),
                    )
                    AppDialogDangerButton(
                        text = "删除",
                        onClick = {
                            onDeleteTask(target.id)
                            taskToDelete = null
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            },
        ) {}
    }

    // 编辑/新建任务弹窗升级为 AppDialog
    if (isEditing) {
        AutoReservationEditDialog(
            spaces = spaces,
            task = editingTask,
            saving = savingTask,
            onDismiss = { isEditing = false },
            onSave = { updated ->
                onSaveTask(updated) {
                    isEditing = false
                }
            },
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        AppPanel {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            "自动预约任务",
                            style = MaterialTheme.typography.titleLarge.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                            ),
                        )
                        Text(
                            "设置预约日期与触发时间，系统将按候选顺序自动尝试预约",
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Surface(
                        onClick = {
                            editingTask = null
                            isEditing = true
                            onClearFeedback()
                        },
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Outlined.Add,
                                contentDescription = "新建任务",
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }

                if (tasks.isEmpty() && !tasksLoading) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                    ) {
                        Column(
                            modifier = Modifier.padding(vertical = 32.dp, horizontal = 20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primaryContainer),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Outlined.AutoAwesome,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(24.dp),
                                )
                            }
                            Text(
                                text = "还没有自动预约任务",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "点击右上角“新建任务”，设置候选空间与时段，系统会在指定时间自动尝试预约抢占。",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                val adaptive = LocalAdaptiveWindow.current
                val isTablet = adaptive.isTabletOrExpanded

                if (tasks.isNotEmpty()) {
                    if (isTablet) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            tasks.chunked(2).forEach { rowTasks ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    rowTasks.forEach { task ->
                                        Box(modifier = Modifier.weight(1f)) {
                                            AutoTaskCard(
                                                task = task,
                                                spaces = spaces,
                                                isDeleting = deletingTaskId == task.id,
                                                onToggle = { onToggleTask(task) },
                                                onEdit = {
                                                    editingTask = task
                                                    isEditing = true
                                                    onClearFeedback()
                                                },
                                                onDelete = { taskToDelete = task },
                                            )
                                        }
                                    }
                                    if (rowTasks.size == 1) {
                                        Spacer(modifier = Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            tasks.forEach { task ->
                                AutoTaskCard(
                                    task = task,
                                    spaces = spaces,
                                    isDeleting = deletingTaskId == task.id,
                                    onToggle = { onToggleTask(task) },
                                    onEdit = {
                                        editingTask = task
                                        isEditing = true
                                        onClearFeedback()
                                    },
                                    onDelete = { taskToDelete = task },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AutoTaskCard(
    task: CampusAutoReservationTask,
    spaces: List<CampusReservationSpace>,
    isDeleting: Boolean,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val spaceMap = remember(spaces) { spaces.associateBy({ it.id }, { it.name }) }
    val badge = when {
        task.enabled -> "待执行" to Color(0xFF16803B)
        task.lastStatus == "succeeded" -> "已完成" to Color(0xFF2563EB)
        !task.lastStatus.isNullOrBlank() -> "已结束" to Color(0xFFD97706)
        else -> "已停用" to MaterialTheme.colorScheme.onSurfaceVariant
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f)),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        text = task.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = badge.second.copy(alpha = 0.12f),
                    ) {
                        Text(
                            text = badge.first,
                            color = badge.second,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }

                Switch(
                    checked = task.enabled,
                    onCheckedChange = { onToggle() },
                )
            }

            // 基础属性行
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                val taskWk = remember(task.reservationDate) {
                    try {
                        val d = LocalDate.parse(task.reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
                        " (${weekdayName(d)})"
                    } catch (_: Throwable) {
                        ""
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = "目标: ${task.reservationDate}$taskWk",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                val executeWk = remember(task.executeDate) {
                    try {
                        val d = LocalDate.parse(task.executeDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
                        " (${weekdayName(d)})"
                    } catch (_: Throwable) {
                        ""
                    }
                }
                val executeText = if (task.executeDate.isNotBlank()) {
                    "${task.executeDate}$executeWk ${task.executeTime}"
                } else {
                    "进入 3 天窗口后 ${task.executeTime}"
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Outlined.AccessTime,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = "运行: $executeText",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // 候选序列步骤胶囊
            if (task.candidates.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "候选空间与时段 (${task.candidates.size}个)：",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        task.candidates.forEachIndexed { index, candidate ->
                            val sName = spaceMap[candidate.areaId] ?: "空间${candidate.areaId}"
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            ) {
                                Text(
                                    text = "${index + 1}. $sName (${candidate.startTime}-${candidate.endTime})",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                }
            }

            // 执行结果提示
            val resultText = when {
                task.lastStatus == null -> "尚未执行"
                task.lastStatus == "succeeded" -> "最近执行成功（命中了第 ${(task.lastCandidateIndex ?: 0) + 1} 个候选）"
                else -> "最近执行未成功：${task.lastMessage ?: "未返回原因"}"
            }
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(6.dp),
                color = if (task.lastStatus == "succeeded") Color(0xFF16803B).copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
            ) {
                Text(
                    text = "执行结果：$resultText",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (task.lastStatus == "succeeded") Color(0xFF16803B) else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // 操作栏
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onEdit,
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("编辑", style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.width(6.dp))
                TextButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    enabled = !isDeleting,
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    if (isDeleting) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                    Spacer(Modifier.width(4.dp))
                    Text("删除", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
private fun AutoReservationEditDialog(
    spaces: List<CampusReservationSpace>,
    task: CampusAutoReservationTask?,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (CampusAutoReservationTask) -> Unit,
) {
    val today = remember { LocalDate.now() }
    var name by rememberSaveable { mutableStateOf(task?.name ?: "研讨间自动预约任务") }
    var enabled by rememberSaveable { mutableStateOf(task?.enabled ?: true) }
    var reservationDate by rememberSaveable {
        mutableStateOf(task?.reservationDate?.ifBlank { null } ?: today.plusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE))
    }
    var executeDate by rememberSaveable {
        mutableStateOf(task?.executeDate?.ifBlank { null } ?: defaultAutoReservationExecuteDate(reservationDate, today))
    }
    var executeTime by rememberSaveable { mutableStateOf(task?.executeTime?.ifBlank { null } ?: "07:00") }
    var title by rememberSaveable { mutableStateOf(task?.title?.ifBlank { null } ?: "个人课程研读与学习") }
    var mobile by rememberSaveable { mutableStateOf(task?.mobile?.ifBlank { null } ?: "18783388384") }
    var content by rememberSaveable { mutableStateOf(task?.content?.ifBlank { null } ?: "用于个人课程自主研读、文献查阅及学术研讨。") }
    var open by rememberSaveable { mutableStateOf(task?.open ?: false) }

    val candidates = remember {
        mutableStateListOf<CampusAutoReservationCandidate>().apply {
            if (task?.candidates?.isNotEmpty() == true) {
                addAll(task.candidates)
            } else {
                add(
                    CampusAutoReservationCandidate(
                        areaId = spaces.firstOrNull()?.id ?: 1,
                        startTime = "09:00",
                        endTime = "11:00",
                    )
                )
            }
        }
    }

    var validationError by remember { mutableStateOf<String?>(null) }

    val dateWeekday = remember(reservationDate) {
        try {
            val parsed = LocalDate.parse(reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
            weekdayName(parsed)
        } catch (_: Throwable) {
            null
        }
    }
    val executeDateWeekday = remember(executeDate) {
        try {
            val parsed = LocalDate.parse(executeDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
            weekdayName(parsed)
        } catch (_: Throwable) {
            null
        }
    }

    var datePickerTarget by remember { mutableStateOf<String?>(null) }
    var timePickerOpen by remember { mutableStateOf(false) }

    if (datePickerTarget != null) {
        val isReservation = datePickerTarget == "reservation"
        WheelDatePickerModal(
            title = if (isReservation) "选择预约目标日期" else "选择任务运行日期",
            currentDate = if (isReservation) reservationDate else executeDate,
            today = today,
            onDismiss = { datePickerTarget = null },
            onConfirm = { chosenDate ->
                if (isReservation) {
                    reservationDate = chosenDate
                    executeDate = defaultAutoReservationExecuteDate(chosenDate, today)
                } else {
                    executeDate = chosenDate
                }
                validationError = null
            },
        )
    }

    if (timePickerOpen) {
        WheelTimePickerModal(
            title = "选择任务运行时间",
            currentTime = executeTime.ifBlank { "07:00" },
            onDismiss = { timePickerOpen = false },
            onConfirm = { chosenTime ->
                executeTime = chosenTime
                validationError = null
            },
        )
    }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AutoAwesome,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = if (task == null) "新建自动预约任务" else "编辑自动预约任务",
        subtitle = "按候选顺序设置备选空间与时段，在指定时间自动尝试预约",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "保存任务",
                    onClick = {
                        if (name.isBlank()) {
                            validationError = "请填写任务名称"
                            return@AppDialogPrimaryButton
                        }
                        if (reservationDate.isBlank()) {
                            validationError = "请填写预约目标日期"
                            return@AppDialogPrimaryButton
                        }
                        if (executeDate.isBlank()) {
                            validationError = "请填写任务运行日期"
                            return@AppDialogPrimaryButton
                        }
                        if (executeTime.isBlank()) {
                            validationError = "请填写运行时间"
                            return@AppDialogPrimaryButton
                        }
                        if (candidates.isEmpty()) {
                            validationError = "请至少添加一个候选时段"
                            return@AppDialogPrimaryButton
                        }
                        if (!Regex("^\\d{11}$").matches(mobile.trim())) {
                            validationError = "请输入正确的 11 位手机号码"
                            return@AppDialogPrimaryButton
                        }
                        if (title.isBlank()) {
                            validationError = "申请主题不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (content.isBlank()) {
                            validationError = "申请内容不能为空"
                            return@AppDialogPrimaryButton
                        }
                        val invalidCandidate = candidates.firstOrNull { candidate ->
                            spaces.none { it.id == candidate.areaId } || !isReservationDurationValid(candidate.startTime, candidate.endTime)
                        }
                        if (invalidCandidate != null) {
                            validationError = "候选空间需从空间列表中选择，且预约时长需为 1 至 4 小时"
                            return@AppDialogPrimaryButton
                        }
                        validationError = null
                        val newTask = CampusAutoReservationTask(
                            id = task?.id ?: "",
                            name = name.trim(),
                            enabled = enabled,
                            reservationDate = reservationDate.trim(),
                            executeDate = executeDate.trim(),
                            executeTime = executeTime.trim(),
                            candidates = candidates.toList(),
                            title = title.trim(),
                            content = content.trim(),
                            mobile = mobile.trim(),
                            open = open,
                        )
                        onSave(newTask)
                    },
                    modifier = Modifier.weight(1f),
                    busy = saving,
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 440.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it; validationError = null },
                label = { Text("任务名称 *") },
                placeholder = { Text("例如：周三研讨间自动抢占") },
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("启用此自动任务", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    Switch(checked = enabled, onCheckedChange = { enabled = it })
                }
            }

            // 快速选择今天/明天/后天/大后天
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf("今天", "明天", "后天", "大后天").forEachIndexed { index, label ->
                    val targetDate = today.plusDays(index.toLong())
                    val dateStr = targetDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
                    val wk = weekdayName(targetDate)
                    val isSelected = reservationDate.trim() == dateStr
                    Surface(
                        onClick = {
                            reservationDate = dateStr
                            executeDate = defaultAutoReservationExecuteDate(dateStr, today)
                            validationError = null
                        },
                        shape = RoundedCornerShape(6.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(30.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "$label($wk)",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { datePickerTarget = "reservation" }
            ) {
                OutlinedTextField(
                    value = reservationDate,
                    onValueChange = { reservationDate = it; validationError = null },
                    readOnly = true,
                    enabled = false,
                    colors = OutlinedTextFieldDefaults.colors(
                        disabledTextColor = MaterialTheme.colorScheme.onSurface,
                        disabledBorderColor = MaterialTheme.colorScheme.outline,
                        disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    ),
                    label = { Text(if (dateWeekday != null) "预约目标日期 ($dateWeekday)" else "预约目标日期") },
                    placeholder = { Text("点击滑动选择日期") },
                    trailingIcon = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(end = 6.dp),
                        ) {
                            dateWeekday?.let { wk ->
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                ) {
                                    Text(
                                        text = wk,
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp),
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                    )
                                }
                            }
                            Icon(
                                Icons.Outlined.CalendarMonth,
                                contentDescription = "滑动选择日期",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .weight(1.25f)
                        .clickable { datePickerTarget = "execute" }
                ) {
                    OutlinedTextField(
                        value = executeDate,
                        onValueChange = { executeDate = it; validationError = null },
                        readOnly = true,
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline,
                            disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        label = { Text(if (executeDateWeekday != null) "任务运行日期 ($executeDateWeekday)" else "任务运行日期") },
                        placeholder = { Text("点击选择") },
                        trailingIcon = {
                            Icon(
                                Icons.Outlined.CalendarMonth,
                                contentDescription = "滑动选择日期",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp).padding(end = 4.dp),
                            )
                        },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { timePickerOpen = true }
                ) {
                    OutlinedTextField(
                        value = executeTime,
                        onValueChange = { executeTime = it; validationError = null },
                        readOnly = true,
                        enabled = false,
                        colors = OutlinedTextFieldDefaults.colors(
                            disabledTextColor = MaterialTheme.colorScheme.onSurface,
                            disabledBorderColor = MaterialTheme.colorScheme.outline,
                            disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        label = { Text("运行时间") },
                        placeholder = { Text("07:00") },
                        trailingIcon = {
                            Icon(
                                Icons.Outlined.AccessTime,
                                contentDescription = "滑动选择时间",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp).padding(end = 4.dp),
                            )
                        },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            }

            Text(
                text = "到达运行日期和运行时间后，系统会预约目标日期的候选空间。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "候选空间与时段（按先后顺序依次尝试）",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "每次预约 1 至 4 小时；执行时会按顺序优先尝试未被占用的候选。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            candidates.forEachIndexed { index, candidate ->
                CandidateEditRow(
                    index = index,
                    candidate = candidate,
                    spaces = spaces,
                    canMoveUp = index > 0,
                    canMoveDown = index < candidates.size - 1,
                    canDelete = candidates.size > 1,
                    onUpdate = { updated -> candidates[index] = updated },
                    onMoveUp = {
                        val temp = candidates[index]
                        candidates[index] = candidates[index - 1]
                        candidates[index - 1] = temp
                    },
                    onMoveDown = {
                        val temp = candidates[index]
                        candidates[index] = candidates[index + 1]
                        candidates[index + 1] = temp
                    },
                    onDelete = { candidates.removeAt(index) },
                )
            }

            if (candidates.size < 20) {
                OutlinedButton(
                    onClick = {
                        val lastCandidate = candidates.lastOrNull()
                        candidates.add(
                            CampusAutoReservationCandidate(
                                areaId = spaces.firstOrNull()?.id ?: 1,
                                startTime = lastCandidate?.startTime ?: "09:00",
                                endTime = lastCandidate?.endTime ?: "11:00",
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("添加候选时段")
                }
            }

            OutlinedTextField(
                value = title,
                onValueChange = { title = it; validationError = null },
                label = { Text("申请主题 *") },
                placeholder = { Text("例如：课程研究与研讨") },
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = mobile,
                onValueChange = { mobile = it; validationError = null },
                label = { Text("联系电话 *") },
                placeholder = { Text("11 位手机号") },
                shape = RoundedCornerShape(8.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = content,
                onValueChange = { content = it; validationError = null },
                label = { Text("申请用途 *") },
                placeholder = { Text("说明研讨间使用用途") },
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
            )

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("公开本次申请", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = open, onCheckedChange = { open = it })
                }
            }

            validationError?.let { err ->
                FeedbackBanner(message = err, error = true)
            }
        }
    }
}

@Composable
private fun CandidateEditRow(
    index: Int,
    candidate: CampusAutoReservationCandidate,
    spaces: List<CampusReservationSpace>,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    canDelete: Boolean,
    onUpdate: (CampusAutoReservationCandidate) -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
) {
    var spaceMenuOpen by remember { mutableStateOf(false) }
    val selectedSpace = spaces.firstOrNull { it.id == candidate.areaId }
    val spaceName = selectedSpace?.name ?: "空间 ${candidate.areaId}"

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(20.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "${index + 1}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(
                        text = "候选时段 ${index + 1}",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Row {
                    if (canMoveUp) {
                        IconButton(onClick = onMoveUp, modifier = Modifier.size(26.dp)) {
                            Icon(Icons.Outlined.ArrowUpward, contentDescription = "上移", modifier = Modifier.size(16.dp))
                        }
                    }
                    if (canMoveDown) {
                        IconButton(onClick = onMoveDown, modifier = Modifier.size(26.dp)) {
                            Icon(Icons.Outlined.ArrowDownward, contentDescription = "下移", modifier = Modifier.size(16.dp))
                        }
                    }
                    if (canDelete) {
                        IconButton(onClick = onDelete, modifier = Modifier.size(26.dp)) {
                            Icon(Icons.Outlined.Delete, contentDescription = "删除", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            Box {
                OutlinedButton(
                    onClick = { spaceMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = spaceName,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Icon(Icons.Outlined.ExpandMore, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
                DropdownMenu(expanded = spaceMenuOpen, onDismissRequest = { spaceMenuOpen = false }) {
                    spaces.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(s.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            onClick = {
                                onUpdate(candidate.copy(areaId = s.id))
                                spaceMenuOpen = false
                            },
                        )
                    }
                }
            }

            var pickingTimeTarget by remember { mutableStateOf<String?>(null) }
            if (pickingTimeTarget != null) {
                val isStart = pickingTimeTarget == "start"
                WheelTimePickerModal(
                    title = if (isStart) "选择候选开始时间" else "选择候选结束时间",
                    currentTime = if (isStart) candidate.startTime else candidate.endTime,
                    minTime = if (isStart) CAMPUS_LIBROOM_MIN_START_TIME else CAMPUS_LIBROOM_MIN_END_TIME,
                    maxTime = if (isStart) CAMPUS_LIBROOM_MAX_START_TIME else CAMPUS_LIBROOM_MAX_END_TIME,
                    minuteStep = CAMPUS_LIBROOM_TIME_STEP_MINUTES,
                    onDismiss = { pickingTimeTarget = null },
                    onConfirm = { chosen ->
                        if (isStart) {
                            val newStartMin = reservationTimeMinutes(chosen)
                            val currEndMin = reservationTimeMinutes(candidate.endTime)
                            val autoEnd = if (newStartMin != null && (currEndMin == null || currEndMin <= newStartMin || (currEndMin - newStartMin) > 240 || (currEndMin - newStartMin) < 60)) {
                                formatMinutesToTime((newStartMin + 120).coerceAtMost(1305))
                            } else {
                                candidate.endTime
                            }
                            onUpdate(candidate.copy(startTime = chosen, endTime = autoEnd))
                        } else {
                            onUpdate(candidate.copy(endTime = chosen))
                        }
                    },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    onClick = { pickingTimeTarget = "start" },
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
                    modifier = Modifier.weight(1f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text("开始时间", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(candidate.startTime, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                        Icon(Icons.Outlined.AccessTime, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                }

                Icon(Icons.Outlined.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)

                Surface(
                    onClick = { pickingTimeTarget = "end" },
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
                    modifier = Modifier.weight(1f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text("结束时间", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(candidate.endTime, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                        Icon(Icons.Outlined.AccessTime, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.widthIn(min = 72.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

private fun weekdayName(date: LocalDate): String {
    return date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.SIMPLIFIED_CHINESE)
}

private fun defaultAutoReservationExecuteDate(reservationDate: String, today: LocalDate): String {
    val target = runCatching {
        LocalDate.parse(reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
    }.getOrNull() ?: today
    val earliest = target.minusDays(3)
    return (if (earliest.isAfter(today)) earliest else today).format(DateTimeFormatter.ISO_LOCAL_DATE)
}

private fun reservationWindowText(windows: List<CampusReservationTimeWindow>?): String {
    return windows.orEmpty()
        .joinToString("、") { "${it.start} - ${it.end}" }
        .ifBlank { "暂无可预约空闲时段" }
}

private const val CAMPUS_LIBROOM_MIN_START_TIME = "08:00"
private const val CAMPUS_LIBROOM_MAX_START_TIME = "20:45"
private const val CAMPUS_LIBROOM_MIN_END_TIME = "08:15"
private const val CAMPUS_LIBROOM_MAX_END_TIME = "21:45"
private const val CAMPUS_LIBROOM_TIME_STEP_MINUTES = 15

private fun reservationTimeMinutes(value: String): Int? {
    val match = Regex("^(\\d{1,2}):([0-5]\\d)$").matchEntire(value.trim()) ?: return null
    val minutes = match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
    return minutes.takeIf { it in 0..1440 }
}

private fun isReservationTimeValid(
    startTime: String,
    endTime: String,
    windows: List<CampusReservationTimeWindow>?,
): Boolean {
    val start = reservationTimeMinutes(startTime) ?: return false
    val end = reservationTimeMinutes(endTime) ?: return false
    if (start < 480 || end > 1305 || start >= end) return false
    if (end - start !in 60..240) return false
    return windows.orEmpty().any { window ->
        val windowStart = reservationTimeMinutes(window.start) ?: return@any false
        val windowEnd = reservationTimeMinutes(window.end) ?: return@any false
        start >= windowStart && end <= windowEnd
    }
}

private fun formatMinutesToTime(minutes: Int): String {
    val clamped = minutes.coerceIn(0, 1440)
    val h = clamped / 60
    val m = clamped % 60
    return String.format(Locale.ROOT, "%02d:%02d", h, m)
}

private fun isReservationDurationValid(startTime: String, endTime: String): Boolean {
    val start = reservationTimeMinutes(startTime) ?: return false
    val end = reservationTimeMinutes(endTime) ?: return false
    return start in 480..1305 && end in 480..1305 && (end - start in 60..240)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun <T> WheelPicker(
    items: List<T>,
    selectedIndex: Int,
    onSelectedIndexChanged: (Int) -> Unit,
    modifier: Modifier = Modifier,
    visibleItemCount: Int = 3,
    itemHeight: androidx.compose.ui.unit.Dp = 44.dp,
    unitText: String? = null,
    formatItem: (T) -> String = { it.toString() },
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = selectedIndex.coerceIn(0, (items.size - 1).coerceAtLeast(0)),
    )
    val flingBehavior = rememberSnapFlingBehavior(lazyListState = listState)
    val coroutineScope = rememberCoroutineScope()

    val centerIndex by remember(items) {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val visibleItems = layoutInfo.visibleItemsInfo
            if (visibleItems.isEmpty()) return@derivedStateOf selectedIndex
            val viewportCenter = (layoutInfo.viewportStartOffset + layoutInfo.viewportEndOffset) / 2
            val closest = visibleItems.minByOrNull { item ->
                val itemCenter = item.offset + item.size / 2
                kotlin.math.abs(itemCenter - viewportCenter)
            }
            closest?.index ?: selectedIndex
        }
    }

    // 实时感知当前处于正中心的项，无延迟通知外层更新
    LaunchedEffect(listState) {
        snapshotFlow { centerIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index in items.indices && index != selectedIndex) {
                    onSelectedIndexChanged(index)
                }
            }
    }

    // 仅当外部主动变更 selectedIndex 时，且滚轮未在滑动中，执行平滑滚动定位
    LaunchedEffect(selectedIndex) {
        if (!listState.isScrollInProgress && centerIndex != selectedIndex && selectedIndex in items.indices) {
            listState.animateScrollToItem(selectedIndex)
        }
    }

    val verticalPadding = itemHeight * ((visibleItemCount - 1) / 2)

    Box(
        modifier = modifier.height(itemHeight * visibleItemCount),
        contentAlignment = Alignment.Center,
    ) {
        LazyColumn(
            state = listState,
            flingBehavior = flingBehavior,
            contentPadding = PaddingValues(vertical = verticalPadding),
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            itemsIndexed(items) { index, item ->
                val isSelected = index == centerIndex
                val distance = kotlin.math.abs(index - centerIndex)
                val alpha = when (distance) {
                    0 -> 1f
                    1 -> 0.45f
                    else -> 0.2f
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(itemHeight)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (index in items.indices) {
                                onSelectedIndexChanged(index)
                                coroutineScope.launch {
                                    listState.animateScrollToItem(index)
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = formatItem(item),
                            style = if (isSelected) {
                                MaterialTheme.typography.titleLarge.copy(
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            } else {
                                MaterialTheme.typography.bodyLarge.copy(
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Normal,
                                )
                            },
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)
                            },
                            textAlign = TextAlign.Center,
                        )
                        if (isSelected && !unitText.isNullOrBlank()) {
                            Spacer(Modifier.width(2.dp))
                            Text(
                                text = unitText,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(bottom = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WheelTimePickerModal(
    title: String,
    currentTime: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    minTime: String = "00:00",
    maxTime: String = "23:59",
    minuteStep: Int = 1,
) {
    val minMin = (reservationTimeMinutes(minTime) ?: 0).coerceIn(0, 1439)
    val maxMin = (reservationTimeMinutes(maxTime) ?: 1439).coerceIn(minMin, 1439)
    val clampedCurrentMin = (reservationTimeMinutes(currentTime) ?: minMin).coerceIn(minMin, maxMin)

    val currentH = clampedCurrentMin / 60
    val currentM = clampedCurrentMin % 60

    val minH = minMin / 60
    val maxH = maxMin / 60

    val hours = remember(minH, maxH) {
        (minH..maxH).map { String.format(Locale.ROOT, "%02d", it) }
    }

    val initHourIndex = remember(hours, currentH) {
        val found = hours.indexOfFirst { it.toIntOrNull() == currentH }
        if (found >= 0) found else 0
    }
    var selectedHourIndex by remember { mutableIntStateOf(initHourIndex) }

    val safeHourIndex = selectedHourIndex.coerceIn(0, (hours.size - 1).coerceAtLeast(0))
    val selectedHour = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }.toIntOrNull() ?: minH

    val minutesForHour = remember(selectedHour, minMin, maxMin, minuteStep) {
        val list = mutableListOf<String>()
        val startM = if (selectedHour == minH) minMin % 60 else 0
        val endM = if (selectedHour == maxH) maxMin % 60 else 59
        val step = minuteStep.coerceAtLeast(1)
        for (m in 0..59 step step) {
            if (m in startM..endM) {
                list.add(String.format(Locale.ROOT, "%02d", m))
            }
        }
        if (list.isEmpty()) {
            list.add(String.format(Locale.ROOT, "%02d", startM.coerceIn(0, 59)))
        }
        list
    }

    val initMinuteIndex = remember(minutesForHour, currentM) {
        val found = minutesForHour.indexOfFirst { (it.toIntOrNull() ?: 0) >= currentM }
        if (found >= 0) found else (minutesForHour.size - 1).coerceAtLeast(0)
    }
    var selectedMinuteIndex by remember(minutesForHour) { mutableIntStateOf(initMinuteIndex) }

    val safeMinuteIndex = selectedMinuteIndex.coerceIn(0, (minutesForHour.size - 1).coerceAtLeast(0))
    val chosenHourStr = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }
    val chosenMinuteStr = minutesForHour.getOrElse(safeMinuteIndex) { minutesForHour.firstOrNull() ?: "00" }
    val formattedTime = "$chosenHourStr:$chosenMinuteStr"

    val rangeHint = if (minTime != "00:00" || maxTime != "23:59") "（开放范围 $minTime - $maxTime）" else ""

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AccessTime,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = "当前选择：$formattedTime$rangeHint",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "确定",
                    onClick = {
                        onConfirm(formattedTime)
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WheelPicker(
                items = hours,
                selectedIndex = safeHourIndex,
                onSelectedIndexChanged = { selectedHourIndex = it },
                unitText = "时",
                modifier = Modifier.weight(1f),
            )
            WheelPicker(
                items = minutesForHour,
                selectedIndex = safeMinuteIndex,
                onSelectedIndexChanged = { selectedMinuteIndex = it },
                unitText = "分",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun WheelDatePickerModal(
    title: String,
    currentDate: String,
    today: LocalDate = LocalDate.now(),
    daysCount: Int = 30,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val dates = remember(today, daysCount) {
        (-2 until daysCount).map { today.plusDays(it.toLong()) }
    }
    val currentLocalDate = remember(currentDate) {
        try {
            LocalDate.parse(currentDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (_: Exception) {
            today
        }
    }
    val initIndex = remember(dates, currentLocalDate) {
        val found = dates.indexOfFirst { it == currentLocalDate }
        if (found >= 0) found else dates.indexOfFirst { it == today }.coerceAtLeast(0)
    }

    var selectedIndex by remember { mutableIntStateOf(initIndex) }
    val chosenDate = dates.getOrElse(selectedIndex) { today }
    val chosenDateStr = chosenDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
    val chosenWk = weekdayName(chosenDate)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.CalendarMonth,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = "当前选择：$chosenDateStr ($chosenWk)",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "确定",
                    onClick = {
                        onConfirm(chosenDateStr)
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WheelPicker(
                items = dates,
                selectedIndex = selectedIndex,
                onSelectedIndexChanged = { selectedIndex = it },
                formatItem = { d ->
                    "${d.monthValue}月${d.dayOfMonth}日 ${weekdayName(d)}"
                },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReservationTimeRangePicker(
    startTime: String,
    endTime: String,
    onStartTimeChange: (String) -> Unit,
    onEndTimeChange: (String) -> Unit,
) {
    var pickingTarget by remember { mutableStateOf<String?>(null) }

    val startMin = reservationTimeMinutes(startTime)
    val endMin = reservationTimeMinutes(endTime)
    val durationMin = if (startMin != null && endMin != null && endMin > startMin) endMin - startMin else null
    val isDurationValid = durationMin != null && durationMin in 60..240

    if (pickingTarget != null) {
        val isStart = pickingTarget == "start"
        WheelTimePickerModal(
            title = if (isStart) "选择开始时间" else "选择结束时间",
            currentTime = if (isStart) startTime else endTime,
            minTime = if (isStart) CAMPUS_LIBROOM_MIN_START_TIME else CAMPUS_LIBROOM_MIN_END_TIME,
            maxTime = if (isStart) CAMPUS_LIBROOM_MAX_START_TIME else CAMPUS_LIBROOM_MAX_END_TIME,
            minuteStep = CAMPUS_LIBROOM_TIME_STEP_MINUTES,
            onDismiss = { pickingTarget = null },
            onConfirm = { chosen ->
                if (isStart) {
                    onStartTimeChange(chosen)
                    val newStartMin = reservationTimeMinutes(chosen)
                    if (newStartMin != null) {
                        val currEndMin = reservationTimeMinutes(endTime)
                        if (currEndMin == null || currEndMin <= newStartMin || (currEndMin - newStartMin) > 240 || (currEndMin - newStartMin) < 60) {
                            val autoEndMin = (newStartMin + 120).coerceAtMost(1305)
                            onEndTimeChange(formatMinutesToTime(autoEndMin))
                        }
                    }
                } else {
                    onEndTimeChange(chosen)
                }
            },
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // 1. 顶部标题与时长标签
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "预约时段（单次可约 1 ~ 4 小时）",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (durationMin != null) {
                val hours = durationMin / 60
                val mins = durationMin % 60
                val durationText = "${if (hours > 0) "${hours}小时" else ""}${if (mins > 0) "${mins}分钟" else ""}"
                val statusColor = if (isDurationValid) Color(0xFF15803D) else MaterialTheme.colorScheme.error
                val statusBg = if (isDurationValid) Color(0xFFDCFCE7) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = statusBg,
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (isDurationValid) Icons.Outlined.CheckCircle else Icons.Outlined.WarningAmber,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = if (isDurationValid) "时长 $durationText (合规)" else "时长 $durationText (需1~4小时)",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = statusColor,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        // 2. 双联时间大卡片（点击直接唤起选择弹窗）
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 开始时间卡片
            Surface(
                onClick = { pickingTarget = "start" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "开始时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = startTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // 中间箭头指示
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }

            // 结束时间卡片
            Surface(
                onClick = { pickingTarget = "end" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "结束时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = endTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        // 3. 常用时长一键快速推算（1小时、1.5小时、2小时、3小时、4小时）
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "快捷时长推算（从开始时间自动顺延）",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                listOf(
                    "1小时" to 60,
                    "1.5小时" to 90,
                    "2小时" to 120,
                    "3小时" to 180,
                    "4小时" to 240,
                ).forEach { (label, durationMinutes) ->
                    val isCurrentDuration = durationMin == durationMinutes
                    Surface(
                        onClick = {
                            val curStartMin = reservationTimeMinutes(startTime) ?: 540
                            val targetEndMin = (curStartMin + durationMinutes).coerceAtMost(1305)
                            onEndTimeChange(formatMinutesToTime(targetEndMin))
                        },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isCurrentDuration) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                        border = BorderStroke(
                            1.dp,
                            if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f),
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(32.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = if (isCurrentDuration) FontWeight.Bold else FontWeight.Medium,
                                color = if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}
