package cn.pxyb.mycontrol.ui.feature.campus.reservation

import cn.pxyb.mycontrol.ui.components.input.AppTextField
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.MaterialTheme
import cn.pxyb.mycontrol.ui.components.input.AppPickerField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.picker.AppDatePickerModal
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun AutoReservationEditDialog(
    spaces: List<CampusReservationSpace>,
    spacesReferenceDate: String?,
    spacesCachedAt: Long?,
    spacesLoading: Boolean,
    spacesError: String?,
    onLoadSpaces: () -> Unit,
    task: CampusAutoReservationTask?,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (CampusAutoReservationTask) -> Unit,
) {
    val today = remember { LocalDate.now(ZoneId.of("Asia/Shanghai")) }
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

    LaunchedEffect(Unit) {
        onLoadSpaces()
    }
    val candidateSpaces = spaces

    val candidates = remember {
        mutableStateListOf<CampusAutoReservationCandidate>().apply {
            if (task?.candidates?.isNotEmpty() == true) {
                addAll(task.candidates)
            } else {
                add(
                    CampusAutoReservationCandidate(
                        areaId = 0,
                        startTime = "09:00",
                        endTime = "11:00",
                    )
                )
            }
        }
    }
    val needsRoom = candidates.isEmpty() || candidates.any { it.areaId <= 0 }
    val saveAsDraft = needsRoom && (task == null || task.id.isBlank() || task.isLocalDraft)

    var validationError by remember { mutableStateOf<String?>(null) }
    var taskToConfirm by remember { mutableStateOf<CampusAutoReservationTask?>(null) }

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
        title = when {
            task == null -> "新建自动预约任务"
            task.isLocalDraft -> "编辑待选房草稿"
            else -> "编辑自动预约任务"
        },
        subtitle = if (saveAsDraft) "暂时没有房间也可先保存草稿，补选后再创建任务" else "按候选顺序设置备选空间与时段，在指定时间自动尝试预约",
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
                    text = if (saveAsDraft) "保存草稿" else "保存任务",
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
                        val targetDate = runCatching { LocalDate.parse(reservationDate.trim()) }.getOrNull()
                        val runDate = runCatching { LocalDate.parse(executeDate.trim()) }.getOrNull()
                        if (targetDate == null || runDate == null) {
                            validationError = "请选择有效的预约目标日期和任务运行日期"
                            return@AppDialogPrimaryButton
                        }
                        if (runDate.isBefore(targetDate.minusDays(3)) || runDate.isAfter(targetDate)) {
                            validationError = "运行日期必须在预约目标日期前 3 天至预约当天内"
                            return@AppDialogPrimaryButton
                        }
                        if (!saveAsDraft && enabled && runDate.isBefore(LocalDate.now(ZoneId.of("Asia/Shanghai")))) {
                            validationError = "运行日期已过，请重新选择运行日期后启用任务"
                            return@AppDialogPrimaryButton
                        }
                        if (candidates.isEmpty()) {
                            validationError = "请至少添加一个候选时段"
                            return@AppDialogPrimaryButton
                        }
                        if (!saveAsDraft && !Regex("^\\d{11}$").matches(mobile.trim())) {
                            validationError = "请输入正确的 11 位手机号码"
                            return@AppDialogPrimaryButton
                        }
                        if (!saveAsDraft && title.isBlank()) {
                            validationError = "申请主题不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (!saveAsDraft && content.isBlank()) {
                            validationError = "申请内容不能为空"
                            return@AppDialogPrimaryButton
                        }
                        val invalidCandidate = candidates.firstOrNull { candidate ->
                            (!saveAsDraft && candidate.areaId <= 0) || !isReservationDurationValid(candidate.startTime, candidate.endTime)
                        }
                        if (invalidCandidate != null) {
                            validationError = "请选择候选研讨间，且预约时长需为 1 至 4 小时"
                            return@AppDialogPrimaryButton
                        }
                        validationError = null
                        val newTask = CampusAutoReservationTask(
                            id = task?.id ?: "",
                            name = name.trim(),
                            enabled = enabled && !saveAsDraft,
                            isLocalDraft = saveAsDraft,
                            reservationDate = reservationDate.trim(),
                            executeDate = executeDate.trim(),
                            executeTime = executeTime.trim(),
                            candidates = candidates.toList(),
                            title = title.trim(),
                            content = content.trim(),
                            mobile = mobile.trim(),
                            open = open,
                        )
                        if (saveAsDraft) onSave(newTask) else taskToConfirm = newTask
                    },
                    modifier = Modifier.weight(1f),
                    enabled = saveAsDraft || !needsRoom,
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
            AppTextField(
                value = name,
                onValueChange = { name = it; validationError = null },
                label = "任务名称 *",
                placeholder = "例如：周三研讨间自动抢占",
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
                    AppSwitch(
                        checked = enabled && !needsRoom,
                        onCheckedChange = if (needsRoom) null else { value: Boolean -> enabled = value },
                    )
                }
                if (needsRoom || task?.isLocalDraft == true) {
                    Text(
                        text = "草稿仅保存在当前账号的本机数据中，不会执行。补选房间并保存为正式任务后，才可启用自动预约。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            AppPickerField(
                label = "预约目标日期",
                value = listOfNotNull(reservationDate, dateWeekday).joinToString(" · "),
                onClick = { datePickerTarget = "reservation" },
                icon = Icons.Outlined.CalendarMonth,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppPickerField(
                    label = "任务运行日期",
                    value = listOfNotNull(executeDate, executeDateWeekday).joinToString(" · "),
                    onClick = { datePickerTarget = "execute" },
                    icon = Icons.Outlined.CalendarMonth,
                    modifier = Modifier.weight(1.25f),
                )
                AppPickerField(
                    label = "运行时间",
                    value = executeTime,
                    onClick = { timePickerOpen = true },
                    icon = Icons.Outlined.AccessTime,
                    modifier = Modifier.weight(1f),
                )
            }

            Text(
                text = "可提前保存尚未开放日期的任务。运行日期和时间按北京时间填写，请设置为学校实际开放预约的时间；到点后系统会申请目标日期的候选空间。",
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
                    text = "${when {
                        spacesCachedAt != null -> "历史房间目录，保存于 ${java.time.Instant.ofEpochMilli(spacesCachedAt).atZone(ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("MM-dd HH:mm"))}"
                        spacesReferenceDate != null -> "房间目录参考 $spacesReferenceDate 的查询结果"
                        else -> "房间目录不按预约目标日期筛选"
                    }}，仅用于选房，不代表目标日期已开放或有空位。每次预约 1 至 4 小时。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            when {
                spacesLoading -> Text(
                    text = "正在刷新房间参考目录，已选候选会保留…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                spacesError != null -> AppFeedbackBanner(
                    message = spacesError,
                    error = true,
                    onRetry = onLoadSpaces,
                )
                candidateSpaces.isEmpty() -> AppFeedbackBanner(
                    message = "暂无房间参考目录，可先保存待选房草稿，之后刷新补选；已有候选仍可保留。",
                    type = AppFeedbackType.Info,
                    onRetry = onLoadSpaces,
                )
            }
            if (candidateSpaces.isNotEmpty() && spacesError == null) {
                AppSecondaryButton(
                    text = "刷新房间目录",
                    onClick = onLoadSpaces,
                    enabled = !spacesLoading,
                )
            }

            candidates.forEachIndexed { index, candidate ->
                CandidateEditRow(
                    index = index,
                    candidate = candidate,
                    spaces = candidateSpaces,
                    spacesLoading = spacesLoading,
                    canMoveUp = index > 0,
                    canMoveDown = index < candidates.size - 1,
                    canDelete = candidates.size > 1,
                    onUpdate = { updated -> candidates[index] = updated; validationError = null },
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
                                areaId = lastCandidate?.areaId?.takeIf { it > 0 } ?: candidateSpaces.firstOrNull()?.id ?: 0,
                                startTime = lastCandidate?.startTime ?: "09:00",
                                endTime = lastCandidate?.endTime ?: "11:00",
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            AppTextField(
                value = title,
                onValueChange = { title = it; validationError = null },
                label = "申请主题 *",
                placeholder = "例如：课程研究与研讨",
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            AppTextField(
                value = mobile,
                onValueChange = { mobile = it; validationError = null },
                label = "联系电话 *",
                placeholder = "11 位手机号",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            AppTextField(
                value = content,
                onValueChange = { content = it; validationError = null },
                label = "申请用途 *",
                placeholder = "说明研讨间使用用途",
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
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
    taskToConfirm?.let { target ->
        AppConfirmDialog(
            title = if (target.enabled) "保存并启用自动预约？" else "保存自动预约任务？",
            detail = buildString {
                append("任务：${target.name}\n")
                append("运行时间：${target.executeDate} ${target.executeTime}\n")
                append("预约日期：${target.reservationDate}\n")
                target.candidates.forEach { candidate ->
                    val spaceName = candidateSpaces.firstOrNull { it.id == candidate.areaId }?.name ?: "研讨间 #${candidate.areaId}（已选候选）"
                    append("$spaceName ${candidate.startTime} - ${candidate.endTime}\n")
                }
                append(if (target.enabled) "到运行时间会自动向学校提交预约，无需再次确认。" else "保存后任务保持停用。")
                if (target.enabled) append("房间目录不保证目标日可约；若届时学校尚未开放或登录失效，任务会记录执行结果，请留意通知。")
                if (task?.isLocalDraft == true) {
                    append("创建成功后会移除本机草稿。")
                } else if (task != null && task.id.isNotBlank()) {
                    append("本次保存会覆盖原任务配置。")
                }
            },
            confirmLabel = if (target.enabled) "确认保存并启用" else "确认保存",
            icon = Icons.Outlined.AutoAwesome,
            danger = true,
            busy = saving,
            onDismiss = { taskToConfirm = null },
            onConfirm = { taskToConfirm = null; onSave(target) },
        )
    }
}
