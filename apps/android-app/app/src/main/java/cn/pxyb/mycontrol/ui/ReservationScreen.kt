package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
            TabRow(
                selectedTabIndex = selectedTab.ordinal,
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary,
            ) {
                ReservationTab.entries.forEach { tab ->
                    Tab(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        text = {
                            Text(
                                text = tab.label,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = if (selectedTab == tab) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                    )
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
    var title by rememberSaveable { mutableStateOf("") }
    var content by rememberSaveable { mutableStateOf("") }
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
    val currentFreeWindows = if (availabilitySpaceId == selectedSpaceId && availabilityDate == selectedDate) freeWindows else emptyList()
    val queriedWindowText = reservationWindowText(currentFreeWindows)

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("提交前确认", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("请核对本次预约信息：", style = MaterialTheme.typography.bodyMedium)
                    HorizontalDivider()
                    DetailRow("预约空间", selectedSpaceName)
                    DetailRow("预约日期", "$selectedDate (${weekdayName(today.plusDays(dayOffset.toLong()))})")
                    DetailRow("预约时段", "$startTime - $endTime")
                    DetailRow("申请主题", title)
                    DetailRow("联系电话", mobile)
                    DetailRow("公开申请", if (open) "是" else "否")
                    if (content.isNotBlank()) {
                        DetailRow("申请内容", content)
                    }
                }
            },
            confirmButton = {
                Button(
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
                    enabled = !submitLoading,
                ) {
                    if (submitLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("确认提交")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("返回修改")
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
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SectionHeader("预约信息", "选择空间和时段，快速提交研讨间预约")
                    TextButton(onClick = onReloadSpaces, enabled = !spacesLoading) {
                        Icon(Icons.Outlined.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("刷新空间")
                    }
                }

                // 空间选择
                Box {
                    OutlinedButton(
                        onClick = { spaceDropdownOpen = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Outlined.MeetingRoom, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = selectedSpaceName,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Icon(Icons.Outlined.ExpandMore, contentDescription = null)
                        }
                    }
                    DropdownMenu(
                        expanded = spaceDropdownOpen,
                        onDismissRequest = { spaceDropdownOpen = false },
                    ) {
                        spaces.forEach { space ->
                            DropdownMenuItem(
                                text = {
                                    Text(space.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                Text(
                    text = if (currentFreeWindows.isEmpty()) "选择空间和日期后，先查询该空间当天空闲时段。" else "当前可预约空闲时段：$queriedWindowText",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FreeWindowList(windows = currentFreeWindows)

                // 日期选择
                Text("预约日期", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf("今天", "明天", "后天", "大后天").forEachIndexed { index, label ->
                        val targetDate = today.plusDays(index.toLong())
                        val wk = weekdayName(targetDate)
                        FilterChip(
                            selected = dayOffset == index,
                            onClick = {
                                dayOffset = index
                                onClearFeedback()
                            },
                            label = {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(label)
                                    Text(wk, style = MaterialTheme.typography.labelSmall)
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                // 时间选择
                Text("预约时段（需落在已查询空闲时段内，1 ~ 4 小时）", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = startTime,
                        onValueChange = { startTime = it; onClearFeedback() },
                        label = { Text("开始时间") },
                        placeholder = { Text("09:00") },
                        supportingText = { Text("格式 HH:mm") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = endTime,
                        onValueChange = { endTime = it; onClearFeedback() },
                        label = { Text("结束时间") },
                        placeholder = { Text("11:00") },
                        supportingText = { Text("格式 HH:mm") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }

                // 快捷时段选择
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        "09:00-11:00" to ("09:00" to "11:00"),
                        "14:00-16:00" to ("14:00" to "16:00"),
                        "19:00-21:00" to ("19:00" to "21:00"),
                    ).forEach { (label, times) ->
                        OutlinedButton(
                            onClick = {
                                startTime = times.first
                                endTime = times.second
                                onClearFeedback()
                            },
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        }
                    }
                }

                // 申请主题
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it; onClearFeedback() },
                    label = { Text("申请主题 *") },
                    placeholder = { Text("例如：个人课程研读") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                // 联系电话
                OutlinedTextField(
                    value = mobile,
                    onValueChange = { mobile = it; onClearFeedback() },
                    label = { Text("联系电话 *") },
                    placeholder = { Text("11 位手机号") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                // 申请内容
                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it; onClearFeedback() },
                    label = { Text("申请内容/用途 *") },
                    placeholder = { Text("简要说明使用研讨间的用途（最多 500 字）") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                )

                // 公开申请开关
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("公开本次申请", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = open, onCheckedChange = { open = it; onClearFeedback() })
                }

                formValidationNotice?.let { notice ->
                    FeedbackBanner(message = notice, error = true)
                }

                // 操作按钮
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
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
                    ) {
                        if (queryLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text("查询规则和时段")
                    }

                    Button(
                        onClick = {
                            if (selectedSpaceId <= 0) {
                                formValidationNotice = "请选择预约空间"
                                return@Button
                            }
                            if (currentFreeWindows.isEmpty()) {
                                formValidationNotice = "请先查询该空间当天的空闲时段"
                                return@Button
                            }
                            if (!isReservationTimeValid(startTime, endTime, currentFreeWindows)) {
                                formValidationNotice = "请选择 $queriedWindowText 内 1 至 4 小时的预约时段"
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
                                formValidationNotice = "请填写申请内容"
                                return@Button
                            }
                            formValidationNotice = null
                            showConfirmDialog = true
                        },
                        enabled = !submitLoading,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("核对预约信息")
                    }
                }
            }
        }

        // 规则与可用性展示
        if (rules != null || availability != null) {
            AppPanel {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionHeader("预约规则与空闲时段", "根据选定空间和日期查询到的开放规则与状态")

                    if (rules != null) {
                        Text("预约规则", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        ) {
                            Text(
                                text = rules,
                                modifier = Modifier.padding(10.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    if (availability != null) {
                        Text("空闲时段说明", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        ) {
                            Text(
                                text = availability,
                                modifier = Modifier.padding(10.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FreeWindowList(windows: List<CampusReservationTimeWindow>) {
    if (windows.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("可预约空闲时段", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        windows.forEach { window ->
            Surface(
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                color = MaterialTheme.colorScheme.surface,
            ) {
                Text(
                    text = "${window.start} - ${window.end}",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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

    if (taskToDelete != null) {
        val target = taskToDelete!!
        AlertDialog(
            onDismissRequest = { taskToDelete = null },
            title = { Text("确认删除任务") },
            text = { Text("确定要删除自动预约任务“${target.name}”吗？此操作无法撤销。") },
            confirmButton = {
                Button(
                    onClick = {
                        onDeleteTask(target.id)
                        taskToDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) {
                    Text("删除")
                }
            },
            dismissButton = {
                TextButton(onClick = { taskToDelete = null }) {
                    Text("取消")
                }
            },
        )
    }

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
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SectionHeader("自动预约任务", "设置预约日期与触发时间，系统将按候选顺序自动尝试预约")
                    Button(
                        onClick = {
                            editingTask = null
                            isEditing = true
                            onClearFeedback()
                        },
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("新建任务")
                    }
                }

                if (tasks.isEmpty() && !tasksLoading) {
                    EmptyBlock(
                        title = "还没有自动预约任务",
                        detail = "点击右上角“新建任务”，设置候选空间与预约时段，系统会在指定时间自动为您尝试预约。",
                    )
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
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
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
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }

                Switch(
                    checked = task.enabled,
                    onCheckedChange = { onToggle() },
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "预约日期：${task.reservationDate} · 尝试时间：${task.executeTime} · 候选 ${task.candidates.size} 个",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (task.candidates.isNotEmpty()) {
                    val candidateSummary = task.candidates.joinToString(" → ") { candidate ->
                        "${spaceMap[candidate.areaId] ?: "空间${candidate.areaId}"}(${candidate.startTime}-${candidate.endTime})"
                    }
                    Text(
                        text = "候选顺序：$candidateSummary",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val resultText = when {
                    task.lastStatus == null -> "尚未执行"
                    task.lastStatus == "succeeded" -> "最近执行成功（命中了第 ${(task.lastCandidateIndex ?: 0) + 1} 个候选）"
                    else -> "最近执行未成功：${task.lastMessage ?: "未返回原因"}"
                }
                Text(
                    text = "执行结果：$resultText",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (task.lastStatus == "succeeded") Color(0xFF16803B) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onEdit) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("编辑")
                }
                Spacer(Modifier.width(4.dp))
                TextButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    enabled = !isDeleting,
                ) {
                    if (isDeleting) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                    Spacer(Modifier.width(4.dp))
                    Text("删除")
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
    var name by rememberSaveable { mutableStateOf(task?.name ?: "") }
    var enabled by rememberSaveable { mutableStateOf(task?.enabled ?: true) }
    var reservationDate by rememberSaveable {
        mutableStateOf(task?.reservationDate?.ifBlank { null } ?: today.plusDays(1).format(DateTimeFormatter.ISO_LOCAL_DATE))
    }
    var executeTime by rememberSaveable { mutableStateOf(task?.executeTime ?: "08:30") }
    var title by rememberSaveable { mutableStateOf(task?.title ?: "") }
    var mobile by rememberSaveable { mutableStateOf(task?.mobile ?: "") }
    var content by rememberSaveable { mutableStateOf(task?.content ?: "") }
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (task == null) "新建自动预约任务" else "编辑自动预约任务", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; validationError = null },
                    label = { Text("任务名称 *") },
                    placeholder = { Text("例如：周三研讨间自动抢占") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("启用任务", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = enabled, onCheckedChange = { enabled = it })
                }

                OutlinedTextField(
                    value = reservationDate,
                    onValueChange = { reservationDate = it; validationError = null },
                    label = { Text("预约目标日期 (YYYY-MM-DD) *") },
                    placeholder = { Text("2026-08-26") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = executeTime,
                    onValueChange = { executeTime = it; validationError = null },
                    label = { Text("开始尝试时间 (HH:mm) *") },
                    placeholder = { Text("08:30") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                Text(
                    text = "候选空间与时段（按先后顺序依次尝试）",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "每次预约 1 至 4 小时；执行时会按候选顺序尝试未被占用的时段。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

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
                        shape = RoundedCornerShape(6.dp),
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
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = mobile,
                    onValueChange = { mobile = it; validationError = null },
                    label = { Text("联系电话 *") },
                    placeholder = { Text("11 位手机号") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it; validationError = null },
                    label = { Text("申请内容 *") },
                    placeholder = { Text("说明研讨间使用用途") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("公开本次申请", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = open, onCheckedChange = { open = it })
                }

                validationError?.let { err ->
                    FeedbackBanner(message = err, error = true)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isBlank()) {
                        validationError = "任务名称不能为空"
                        return@Button
                    }
                    if (reservationDate.isBlank()) {
                        validationError = "预约日期不能为空"
                        return@Button
                    }
                    if (title.isBlank()) {
                        validationError = "申请主题不能为空"
                        return@Button
                    }
                    if (!Regex("^\\d{11}$").matches(mobile.trim())) {
                        validationError = "请输入正确的 11 位手机号码"
                        return@Button
                    }
                    if (content.isBlank()) {
                        validationError = "申请内容不能为空"
                        return@Button
                    }
                    if (candidates.isEmpty()) {
                        validationError = "至少设置一个候选空间和时段"
                        return@Button
                    }
                    val invalidCandidate = candidates.firstOrNull { candidate ->
                        spaces.none { it.id == candidate.areaId } || !isReservationDurationValid(candidate.startTime, candidate.endTime)
                    }
                    if (invalidCandidate != null) {
                        validationError = "候选空间需从空间列表中选择，且预约时长需为 1 至 4 小时"
                        return@Button
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
                enabled = !saving,
            ) {
                if (saving) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(6.dp))
                }
                Text("保存任务")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        },
    )
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
        shape = RoundedCornerShape(6.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "候选 ${index + 1}",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Row {
                    if (canMoveUp) {
                        IconButton(onClick = onMoveUp, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Outlined.ArrowUpward, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                    if (canMoveDown) {
                        IconButton(onClick = onMoveDown, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Outlined.ArrowDownward, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                    if (canDelete) {
                        IconButton(onClick = onDelete, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Outlined.Delete, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            Box {
                OutlinedButton(
                    onClick = { spaceMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
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
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = candidate.endTime,
                    onValueChange = { onUpdate(candidate.copy(endTime = it)) },
                    label = { Text("结束", style = MaterialTheme.typography.labelSmall) },
                    placeholder = { Text("11:00") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
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
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
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
