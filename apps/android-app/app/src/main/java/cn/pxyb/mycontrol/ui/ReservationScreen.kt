package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Info
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private enum class ReservationTab(val label: String) {
    Single("单次预约"),
    Auto("自动任务"),
}

@Composable
fun ReservationScreen(
    state: ReservationUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadSpaces: () -> Unit,
    onQueryRulesAndAvailability: (Int, String) -> Unit,
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
        onLoadAutoTasks()
    }

    WorkspacePage(
        title = "研讨间预约",
        subtitle = "图书馆空间预约 · 自动任务",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing || state.spacesLoading || state.autoTasksLoading,
        onRefresh = onRefresh,
    ) {
        item(key = "tab-selector", contentType = "tab") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ReservationTab.entries.forEach { tab ->
                    val isSelected = selectedTab == tab
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
                            .height(44.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = if (tab == ReservationTab.Single) Icons.Outlined.MeetingRoom else Icons.Outlined.AutoAwesome,
                                contentDescription = null,
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = tab.label,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
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
                        submitLoading = state.submitLoading,
                        rules = state.rules,
                        availability = state.availability,
                        freeWindows = state.freeWindows,
                        availabilitySpaceId = state.availabilitySpaceId,
                        availabilityDate = state.availabilityDate,
                        onReloadSpaces = onLoadSpaces,
                        onQuery = onQueryRulesAndAvailability,
                        onSubmit = onSubmitReservation,
                        onClearFeedback = onClearFeedback,
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

@Composable
private fun SingleReservationPanel(
    spaces: List<CampusReservationSpace>,
    spacesLoading: Boolean,
    queryLoading: Boolean,
    submitLoading: Boolean,
    rules: String?,
    availability: String?,
    freeWindows: List<CampusReservationTimeWindow>,
    availabilitySpaceId: Int?,
    availabilityDate: String?,
    onReloadSpaces: () -> Unit,
    onQuery: (Int, String) -> Unit,
    onSubmit: (CampusReservationRequest, () -> Unit) -> Unit,
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

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // 卡片一：空间与时段设置
        AppPanel {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
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

                // 空间选择卡片
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

                // 日期选择 (单行圆角 Chip)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "预约日期",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        listOf("今天", "明天", "后天", "大后天").forEachIndexed { index, label ->
                            val targetDate = today.plusDays(index.toLong())
                            val wk = weekdayName(targetDate)
                            val isSelected = dayOffset == index
                            Surface(
                                onClick = {
                                    dayOffset = index
                                    onClearFeedback()
                                },
                                shape = RoundedCornerShape(8.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(36.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 2.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = "$label($wk)",
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 11.5.sp,
                                            letterSpacing = (-0.3).sp,
                                        ),
                                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        textAlign = TextAlign.Center,
                                        maxLines = 1,
                                    )
                                }
                            }
                        }
                    }
                }

                // 空闲时段流式展示区（支持一键点击填入）
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "可预约空闲时段",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        if (currentFreeWindows.isNotEmpty()) {
                            Text(
                                text = "点击时段可直接填入",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }

                    if (queryLoading) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center,
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "正在查询该空间空闲时段与开放规则...",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    } else if (currentFreeWindows.isNotEmpty()) {
                        FreeWindowList(
                            windows = currentFreeWindows,
                            selectedStart = startTime,
                            selectedEnd = endTime,
                            onSelectWindow = { win ->
                                startTime = win.start
                                endTime = win.end
                                onClearFeedback()
                            },
                        )
                    } else {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.Info,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = if (!isQueriedCurrent) "选择空间和日期后，点击下方按钮查询空闲时段" else "该空间在选定日期暂无可预约空闲时段",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                // 时段手动设置
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "预约时段（单次可约 1 ~ 4 小时）",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedTextField(
                            value = startTime,
                            onValueChange = { startTime = it; onClearFeedback() },
                            label = { Text("开始时间") },
                            placeholder = { Text("09:00") },
                            leadingIcon = {
                                Icon(Icons.Outlined.AccessTime, contentDescription = null, modifier = Modifier.size(18.dp))
                            },
                            supportingText = { Text("格式 HH:mm") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = endTime,
                            onValueChange = { endTime = it; onClearFeedback() },
                            label = { Text("结束时间") },
                            placeholder = { Text("11:00") },
                            leadingIcon = {
                                Icon(Icons.Outlined.AccessTime, contentDescription = null, modifier = Modifier.size(18.dp))
                            },
                            supportingText = { Text("格式 HH:mm") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            singleLine = true,
                        )
                    }

                    // 实时时长反馈胶囊
                    if (durationMin != null) {
                        val hours = durationMin / 60
                        val mins = durationMin % 60
                        val durationText = "${if (hours > 0) "${hours}小时" else ""}${if (mins > 0) "${mins}分钟" else ""}"
                        val statusColor = if (isDurationValid) Color(0xFF16803B) else MaterialTheme.colorScheme.error
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = statusColor.copy(alpha = 0.08f),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    if (isDurationValid) Icons.Outlined.CheckCircle else Icons.Outlined.WarningAmber,
                                    contentDescription = null,
                                    tint = statusColor,
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    text = if (isDurationValid) "已选时长：$durationText（符合 1~4 小时规则）" else "已选时长：$durationText（预约时长需在 1 至 4 小时之间）",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = statusColor,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }
                }

                // 快捷时段预设按钮
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "常用时段快捷选择",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf(
                            "09:00 - 11:00" to ("09:00" to "11:00"),
                            "14:00 - 16:00" to ("14:00" to "16:00"),
                            "19:00 - 21:00" to ("19:00" to "21:00"),
                        ).forEach { (label, times) ->
                            val isPresetSelected = startTime == times.first && endTime == times.second
                            Surface(
                                onClick = {
                                    startTime = times.first
                                    endTime = times.second
                                    onClearFeedback()
                                },
                                shape = RoundedCornerShape(8.dp),
                                color = if (isPresetSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                border = BorderStroke(
                                    1.dp,
                                    if (isPresetSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                                ),
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isPresetSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isPresetSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }

                // 查询规则和时段按钮
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
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    if (queryLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    } else {
                        Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("查询该空间开放规则与空闲时段", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        // 卡片二：预约申请信息
        AppPanel {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                SectionHeader(
                    title = "预约申请信息",
                    subtitle = "填写研讨间用途与申请人联系方式",
                )

                // 申请主题
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

                // 联系电话
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

                // 申请用途
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

                // 公开申请开关项
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

                // 提交核对大按钮
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
                        if (!isReservationTimeValid(startTime, endTime, currentFreeWindows)) {
                            formValidationNotice = "预约时段需落在已查询空闲时段内，且为 1 至 4 小时"
                            return@Button
                        }
                        if (title.isBlank()) {
                            formValidationNotice = "请填写申请主题"
                            return@Button
                        }
                        if (!Regex("^\\d{11}$").matches(mobile.trim())) {
                            formValidationNotice = "请填写正确的 11 位手机号码"
                            return@Button
                        }
                        if (content.isBlank()) {
                            formValidationNotice = "请填写申请用途/说明"
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

        // 卡片三：规则与可用性展示
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
                SectionHeader(
                    title = "自动预约任务",
                    subtitle = "设置预约日期与触发时间，系统将按候选顺序自动尝试预约",
                    trailing = {
                        Button(
                            onClick = {
                                editingTask = null
                                isEditing = true
                                onClearFeedback()
                            },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("新建任务", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                    },
                )

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
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
                        text = "目标: ${task.reservationDate}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
                        text = "触发: ${task.executeTime}",
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
    var executeTime by rememberSaveable { mutableStateOf(task?.executeTime ?: "08:30") }
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
                            validationError = "任务名称不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (reservationDate.isBlank()) {
                            validationError = "预约日期不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (title.isBlank()) {
                            validationError = "申请主题不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (!Regex("^\\d{11}$").matches(mobile.trim())) {
                            validationError = "请输入正确的 11 位手机号码"
                            return@AppDialogPrimaryButton
                        }
                        if (content.isBlank()) {
                            validationError = "申请内容不能为空"
                            return@AppDialogPrimaryButton
                        }
                        if (candidates.isEmpty()) {
                            validationError = "至少设置一个候选空间和时段"
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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = reservationDate,
                    onValueChange = { reservationDate = it; validationError = null },
                    label = { Text("预约目标日期") },
                    placeholder = { Text("YYYY-MM-DD") },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.weight(1.2f),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = executeTime,
                    onValueChange = { executeTime = it; validationError = null },
                    label = { Text("尝试时间") },
                    placeholder = { Text("08:30") },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
            }

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
                        candidates.add(
                            CampusAutoReservationCandidate(
                                areaId = spaces.firstOrNull()?.id ?: 1,
                                startTime = "09:00",
                                endTime = "11:00",
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

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                OutlinedTextField(
                    value = candidate.startTime,
                    onValueChange = { onUpdate(candidate.copy(startTime = it)) },
                    label = { Text("开始", style = MaterialTheme.typography.labelSmall) },
                    placeholder = { Text("09:00") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = candidate.endTime,
                    onValueChange = { onUpdate(candidate.copy(endTime = it)) },
                    label = { Text("结束", style = MaterialTheme.typography.labelSmall) },
                    placeholder = { Text("11:00") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
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

private fun reservationWindowText(windows: List<CampusReservationTimeWindow>?): String {
    return windows.orEmpty()
        .joinToString("、") { "${it.start} - ${it.end}" }
        .ifBlank { "暂无可预约空闲时段" }
}

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
    if (end - start !in 60..240) return false
    return windows.orEmpty().any { window ->
        val windowStart = reservationTimeMinutes(window.start) ?: return@any false
        val windowEnd = reservationTimeMinutes(window.end) ?: return@any false
        start >= windowStart && end <= windowEnd
    }
}

private fun isReservationDurationValid(startTime: String, endTime: String): Boolean {
    val start = reservationTimeMinutes(startTime) ?: return false
    val end = reservationTimeMinutes(endTime) ?: return false
    return end - start in 60..240
}
