package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.picker.AppDatePickerModal
import cn.pxyb.mycontrol.ui.components.picker.AppTimeRangePicker
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val RESCHEDULE_DATE_OFFSETS = listOf(0 to "今天", 1 to "明天", 2 to "后天", 3 to "大后天")

private const val RESCHEDULE_DEFAULT_CONTENT = "用于个人课程自主研读、文献查阅及学术研讨。"

/**
 * 研讨间改期弹窗。
 *
 * 学校预约系统没有「修改预约」接口，改期由服务端按「先取消原预约、再立即创建新预约」执行，
 * 所以弹窗必须在提交前确认目标研讨间与目标时段确实空闲，避免取消后才发现目标时段已被占用。
 */
@Composable
internal fun RescheduleReservationDialog(
    reservation: CampusMyReservation,
    spaces: List<CampusReservationSpace>,
    availableSpaces: List<CampusReservationSpace>,
    availableSpacesQueryText: String?,
    availableSpacesLoading: Boolean,
    submitting: Boolean,
    onQuerySpacesByTime: (String, String, String, String?) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: (CampusReservationRequest) -> Unit,
) {
    val today = remember { LocalDate.now() }
    var targetSpaceId by rememberSaveable(reservation.id) { mutableIntStateOf(reservation.spaceId) }
    var targetDate by rememberSaveable(reservation.id) { mutableStateOf(reservation.date) }
    var startTime by rememberSaveable(reservation.id) { mutableStateOf(reservation.startTime) }
    var endTime by rememberSaveable(reservation.id) { mutableStateOf(reservation.endTime) }
    var title by rememberSaveable(reservation.id) { mutableStateOf(reservation.title) }
    var content by rememberSaveable(reservation.id) { mutableStateOf(RESCHEDULE_DEFAULT_CONTENT) }
    var mobile by rememberSaveable(reservation.id) { mutableStateOf("") }
    var spaceDropdownOpen by remember { mutableStateOf(false) }
    var datePickerOpen by remember { mutableStateOf(false) }

    // 原研讨间始终排在最前，保证「同日改时段」时不会因为空间列表缺项而选不回原研讨间。
    val spaceOptions = remember(spaces, availableSpaces, reservation.id) {
        val current = if (reservation.spaceId > 0) {
            listOf(CampusReservationSpace(reservation.spaceId, reservation.spaceName))
        } else {
            emptyList()
        }
        (current + spaces + availableSpaces).distinctBy { it.id }
    }
    val queryText = "$targetDate $startTime - $endTime"
    val queryResultText = availableSpacesQueryText?.takeIf { it == queryText }
    val targetSpaceName = spaceOptions.firstOrNull { it.id == targetSpaceId }?.name ?: reservation.spaceName
    val targetLocalDate = remember(targetDate) {
        runCatching { LocalDate.parse(targetDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE) }.getOrNull()
    }
    val dateValid = targetLocalDate != null && !targetLocalDate.isBefore(today) && !targetLocalDate.isAfter(today.plusDays(3))
    val durationValid = isReservationDurationValid(startTime, endTime)
    val nowMinutes = remember { LocalTime.now().let { it.hour * 60 + it.minute } }
    val startMinutes = parseTimeMinutes(startTime, allowEndOfDay = true)
    val startInFuture = targetLocalDate != null && (
        targetLocalDate.isAfter(today) ||
            (targetLocalDate.isEqual(today) && startMinutes != null && startMinutes > nowMinutes)
        )
    val targetFree = queryResultText != null && availableSpaces.any { it.id == targetSpaceId }
    val unchanged = targetSpaceId == reservation.spaceId &&
        targetDate == reservation.date &&
        startTime == reservation.startTime &&
        endTime == reservation.endTime
    val mobileValid = mobile.length == 11 && mobile.all { it.isDigit() }
    val canConfirm = !submitting &&
        !availableSpacesLoading &&
        dateValid &&
        durationValid &&
        startInFuture &&
        targetSpaceId > 0 &&
        targetFree &&
        !unchanged &&
        title.isNotBlank() &&
        content.isNotBlank() &&
        mobileValid

    AppDialogForm(
        title = "更改预约时间",
        subtitle = "可改到同一天的其他时段，也可改到该时段空闲的其他研讨间",
        icon = Icons.Outlined.Schedule,
        confirmText = "确认改期",
        loading = submitting,
        enabled = canConfirm,
        onDismissRequest = onDismiss,
        onConfirm = {
            onConfirm(
                CampusReservationRequest(
                    areaId = targetSpaceId,
                    date = targetDate,
                    startTime = startTime,
                    endTime = endTime,
                    title = title.trim(),
                    content = content.trim(),
                    mobile = mobile.trim(),
                ),
            )
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
                Text(
                    text = "当前预约",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                AppDetailRow("预约空间", reservation.spaceName)
                AppDetailRow("预约时段", "${reservation.date} ${reservation.startTime} - ${reservation.endTime}")
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(15.dp),
                )
                Text(
                    text = "学校系统不支持直接修改预约：改期会先取消原预约，再立即创建新预约。若新预约恰好被其他同学抢占，原预约不会自动恢复，需要重新选择时段。",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp, lineHeight = 16.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        AppSectionHeader(
            title = "改期目标",
            subtitle = "选择目标研讨间、日期与时段，并确认该时段未被预约",
        )

        AppSelectField(
            label = "目标研讨间",
            value = targetSpaceId,
            options = spaceOptions.map { AppSelectOption(it.id, it.name) },
            onValueChange = { targetSpaceId = it },
            expanded = spaceDropdownOpen,
            onExpandedChange = { spaceDropdownOpen = it },
            placeholder = targetSpaceName,
            icon = Icons.Outlined.MeetingRoom,
        )

        if (datePickerOpen) {
            AppDatePickerModal(
                title = "选择改期日期",
                currentDate = targetDate,
                today = today,
                daysCount = 4,
                pastDaysCount = 0,
                onDismiss = { datePickerOpen = false },
                onConfirm = { chosenDate ->
                    runCatching { LocalDate.parse(chosenDate, DateTimeFormatter.ISO_LOCAL_DATE) }.getOrNull()?.let {
                        targetDate = it.format(DateTimeFormatter.ISO_LOCAL_DATE)
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
                    text = "改期日期（学校仅开放今天起 3 日内）",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Surface(
                    onClick = { datePickerOpen = true },
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
                            contentDescription = "打开日期选择",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = "选日期",
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
                RESCHEDULE_DATE_OFFSETS.forEach { (offset, name) ->
                    val candidate = today.plusDays(offset.toLong())
                    val isSelected = targetLocalDate == candidate
                    Surface(
                        onClick = { targetDate = candidate.format(DateTimeFormatter.ISO_LOCAL_DATE) },
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
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Text(
                                text = "$name(${weekdayName(candidate)})",
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

        AppTimeRangePicker(
            startTime = startTime,
            endTime = endTime,
            onStartTimeChange = { startTime = it },
            onEndTimeChange = { endTime = it },
            sectionTitle = "改期时段（单次可约 1 ~ 4 小时）",
            minStartTime = CAMPUS_LIBROOM_MIN_START_TIME,
            maxStartTime = CAMPUS_LIBROOM_MAX_START_TIME,
            minEndTime = CAMPUS_LIBROOM_MIN_END_TIME,
            maxEndTime = CAMPUS_LIBROOM_MAX_END_TIME,
            minuteStep = CAMPUS_LIBROOM_TIME_STEP_MINUTES,
            minDurationMinutes = 60,
            maxDurationMinutes = 240,
            quickDurationOptions = listOf(60, 90, 120, 180, 240),
        )

        AppButton(
            text = "查询该时段空闲研讨间",
            icon = Icons.Outlined.Search,
            onClick = { onQuerySpacesByTime(targetDate, startTime, endTime, reservation.id) },
            loading = availableSpacesLoading,
            enabled = !availableSpacesLoading && durationValid && dateValid,
            modifier = Modifier.fillMaxWidth(),
        )

        AvailableSpacesByTimeBlock(
            queryText = queryResultText,
            availableSpaces = availableSpaces,
            selectedSpaceId = targetSpaceId,
            loading = availableSpacesLoading,
            onSelectSpace = { targetSpaceId = it.id },
        )

        when {
            queryResultText == null -> AppFeedbackBanner(
                message = "先点击上方按钮查询该时段的空闲研讨间，确认目标时段可约后再提交改期。",
                type = AppFeedbackType.Info,
                icon = Icons.Outlined.Info,
                showCloseButton = false,
                autoDismissDurationMillis = null,
            )
            unchanged -> AppFeedbackBanner(
                message = "目标时段与原预约完全相同，请调整日期、时段或研讨间。",
                error = true,
                showCloseButton = false,
            )
            !startInFuture -> AppFeedbackBanner(
                message = "改期目标时段已经开始或已过，请选择稍后的日期或时段。",
                error = true,
                showCloseButton = false,
            )
            targetFree -> AppFeedbackBanner(
                message = "所选研讨间在该时段可预约，取消原预约后会立即提交新预约。",
                error = false,
                showCloseButton = false,
                autoDismissDurationMillis = null,
            )
            else -> AppFeedbackBanner(
                message = "所选研讨间未出现在该时段的空闲列表中，请改选下方空闲研讨间，或调整日期时段后重新查询。",
                error = true,
                showCloseButton = false,
            )
        }

        AppSectionHeader(
            title = "申请信息",
            subtitle = "改期需要重新提交预约申请，请确认主题、用途与联系电话",
        )

        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("申请主题 *") },
            placeholder = { Text("例如：小组课程研讨 / 论文开题讨论") },
            leadingIcon = {
                Icon(Icons.Outlined.EditNote, contentDescription = null, modifier = Modifier.size(18.dp))
            },
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = mobile,
            onValueChange = { mobile = it },
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
            onValueChange = { content = it },
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
    }
}
