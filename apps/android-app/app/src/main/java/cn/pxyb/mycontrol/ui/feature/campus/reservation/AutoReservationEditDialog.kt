package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.picker.AppDatePickerModal
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
internal fun AutoReservationEditDialog(
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
    var mobile by rememberSaveable { mutableStateOf(task?.mobile?.ifBlank { null } ?: "") }
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
        AppDatePickerModal(
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
        AppTimePickerModal(
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
                    AppSwitch(checked = enabled, onCheckedChange = { enabled = it })
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
                AppSecondaryButton(
                    text = "添加候选时段",
                    icon = Icons.Outlined.Add,
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
                )
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
                    AppSwitch(checked = open, onCheckedChange = { open = it })
                }
            }

            validationError?.let { err ->
                AppFeedbackBanner(message = err, error = true)
            }
        }
    }
}
