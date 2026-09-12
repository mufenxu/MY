package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.components.picker.AppDatePickerModal
import cn.pxyb.mycontrol.ui.components.picker.AppTimeRangePicker
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SingleReservationPanel(
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
    var mobile by rememberSaveable { mutableStateOf("") }
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
    val startMin = parseTimeMinutes(startTime, allowEndOfDay = true)
    val endMin = parseTimeMinutes(endTime, allowEndOfDay = true)
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
                    AppDetailRow("预约空间", selectedSpaceName)
                    AppDetailRow("预约日期", "$selectedDate (${weekdayName(today.plusDays(dayOffset.toLong()))})")
                    AppDetailRow("预约时段", "$startTime - $endTime (${durationMin?.let { "${it / 60}小时${if (it % 60 > 0) "${it % 60}分" else ""}" } ?: ""})")
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                    AppDetailRow("申请主题", title)
                    AppDetailRow("联系电话", mobile)
                    AppDetailRow("公开申请", if (open) "是" else "否")
                    if (content.isNotBlank()) {
                        AppDetailRow("申请用途", content)
                    }
                }
            }
        }
    }

    val isTablet = useTwoPaneLayout()

    val cardSpaceAndTime = @Composable {
        AppPanel {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppSectionHeader(
                    title = "空间与时段",
                    subtitle = "选择研讨间与目标日期，快速查看并选取空闲时段",
                )

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "预约空间",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Surface(
                            onClick = onReloadSpaces,
                            enabled = !spacesLoading,
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                if (spacesLoading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(12.dp),
                                        strokeWidth = 1.5.dp,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                } else {
                                    Icon(
                                        Icons.Outlined.Refresh,
                                        contentDescription = "刷新空间列表",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(12.dp),
                                    )
                                }
                                Text(
                                    text = if (spacesLoading) "刷新中..." else "刷新空间",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                    AppSelectField(
                        label = "研讨间",
                        value = selectedSpaceId,
                        options = spaces.map { AppSelectOption(it.id, it.name) },
                        onValueChange = {
                            selectedSpaceId = it
                            onClearFeedback()
                        },
                        expanded = spaceDropdownOpen,
                        onExpandedChange = { spaceDropdownOpen = it },
                        placeholder = selectedSpaceName,
                        enabled = !spacesLoading,
                        icon = Icons.Outlined.MeetingRoom,
                    )
                }

                var singleDatePickerOpen by remember { mutableStateOf(false) }
                if (singleDatePickerOpen) {
                    AppDatePickerModal(
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
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
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
                                        color = if (isPicked) ColorTokens.Green.container.copy(alpha = 0.55f) else ColorTokens.Green.container.copy(alpha = 0.55f),
                                        border = BorderStroke(1.dp, if (isPicked) ColorTokens.Green.foreground else ColorTokens.Green.border),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Icon(
                                                Icons.Outlined.CheckCircle,
                                                contentDescription = null,
                                                tint = ColorTokens.Green.foreground,
                                                modifier = Modifier.size(13.dp),
                                            )
                                            Text(
                                                text = "${win.start} - ${win.end}",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                                                fontWeight = FontWeight.Bold,
                                                color = ColorTokens.Green.foreground,
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

                AppTimeRangePicker(
                    startTime = startTime,
                    endTime = endTime,
                    onStartTimeChange = { startTime = it; onClearFeedback() },
                    onEndTimeChange = { endTime = it; onClearFeedback() },
                    sectionTitle = "预约时段（单次可约 1 ~ 4 小时）",
                    minStartTime = CAMPUS_LIBROOM_MIN_START_TIME,
                    maxStartTime = CAMPUS_LIBROOM_MAX_START_TIME,
                    minEndTime = CAMPUS_LIBROOM_MIN_END_TIME,
                    maxEndTime = CAMPUS_LIBROOM_MAX_END_TIME,
                    minuteStep = CAMPUS_LIBROOM_TIME_STEP_MINUTES,
                    minDurationMinutes = 60,
                    maxDurationMinutes = 240,
                    quickDurationOptions = listOf(60, 90, 120, 180, 240),
                )

                // 双向查询操作栏
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AppSecondaryButton(
                        text = "查空间空闲时段",
                        icon = Icons.Outlined.Search,
                        onClick = {
                            if (selectedSpaceId <= 0) {
                                formValidationNotice = "请先选择空间"
                                return@AppSecondaryButton
                            }
                            formValidationNotice = null
                            onQuery(selectedSpaceId, selectedDate)
                        },
                        loading = queryLoading,
                        enabled = !queryLoading && selectedSpaceId > 0,
                        modifier = Modifier.weight(1f),
                    )

                    AppButton(
                        text = "查时段空闲房间",
                        icon = Icons.Outlined.MeetingRoom,
                        onClick = {
                            if (!isDurationValid) {
                                formValidationNotice = "请先设置有效的时间段（1至4小时）"
                                return@AppButton
                            }
                            formValidationNotice = null
                            onQuerySpacesByTime(selectedDate, startTime, endTime)
                        },
                        loading = availableSpacesLoading,
                        enabled = !availableSpacesLoading && isDurationValid,
                        modifier = Modifier.weight(1f),
                    )
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
                    AppSectionHeader(
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
                AppSectionHeader(
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
                        AppSwitch(checked = open, onCheckedChange = { open = it; onClearFeedback() })
                    }
                }

                formValidationNotice?.let { notice ->
                    AppFeedbackBanner(message = notice, error = true)
                }

                AppButton(
                    text = "核对并提交预约",
                    icon = Icons.Outlined.FactCheck,
                    onClick = {
                        if (selectedSpaceId <= 0) {
                            formValidationNotice = "请选择预约空间"
                            return@AppButton
                        }
                        if (currentFreeWindows.isEmpty()) {
                            formValidationNotice = "请先点击上方“查询该空间开放规则与空闲时段”"
                            return@AppButton
                        }
                        if (!isDurationValid) {
                            formValidationNotice = "预约时段需为 1 至 4 小时"
                            return@AppButton
                        }
                        if (title.isBlank()) {
                            formValidationNotice = "请填写申请主题"
                            return@AppButton
                        }
                        if (mobile.isBlank()) {
                            formValidationNotice = "请填写联系电话"
                            return@AppButton
                        }
                        if (content.isBlank()) {
                            formValidationNotice = "请填写申请用途说明"
                            return@AppButton
                        }
                        formValidationNotice = null
                        showConfirmDialog = true
                    },
                    loading = submitLoading,
                    enabled = !submitLoading,
                    modifier = Modifier.fillMaxWidth(),
                )
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
