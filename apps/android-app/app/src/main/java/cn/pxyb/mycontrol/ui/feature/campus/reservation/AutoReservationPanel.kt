package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.button.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import java.time.LocalDate
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState

@Composable
internal fun AutoReservationPanel(
    spaces: List<CampusReservationSpace>,
    candidateSpaces: List<CampusReservationSpace>,
    candidateSpacesReferenceDate: String?,
    candidateSpacesCachedAt: Long?,
    candidateSpacesLoading: Boolean,
    candidateSpacesError: String?,
    tasks: List<CampusAutoReservationTask>,
    tasksLoading: Boolean,
    savingTask: Boolean,
    deletingTaskId: String?,
    onLoadCandidateSpaces: () -> Unit,
    onSaveTask: (CampusAutoReservationTask, () -> Unit) -> Unit,
    onToggleTask: (CampusAutoReservationTask) -> Unit,
    onDeleteTask: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var isEditing by remember { mutableStateOf(false) }
    var editingTask by remember { mutableStateOf<CampusAutoReservationTask?>(null) }
    var taskToDelete by remember { mutableStateOf<CampusAutoReservationTask?>(null) }
    var taskToToggle by remember { mutableStateOf<CampusAutoReservationTask?>(null) }

    taskToToggle?.let { target ->
        AppConfirmDialog(
            title = if (target.enabled) "停用自动预约任务？" else "启用自动预约任务？",
            detail = if (target.enabled) {
                "将停用“${target.name}”，不再按计划提交预约。已经成功的预约不会被取消。"
            } else {
                "将启用“${target.name}”，在 ${target.executeDate} ${target.executeTime} 自动申请 ${target.reservationDate} 的预约，无需再次确认。"
            },
            confirmLabel = if (target.enabled) "确认停用" else "确认启用",
            icon = Icons.Outlined.AutoAwesome,
            danger = true,
            busy = savingTask,
            onDismiss = { taskToToggle = null },
            onConfirm = { taskToToggle = null; onToggleTask(target) },
        )
    }

    // 删除确认弹窗升级为 AppDialog
    val target = taskToDelete
    if (target != null) {
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
            spaces = candidateSpaces,
            spacesReferenceDate = candidateSpacesReferenceDate,
            spacesCachedAt = candidateSpacesCachedAt,
            spacesLoading = candidateSpacesLoading,
            spacesError = candidateSpacesError,
            onLoadSpaces = onLoadCandidateSpaces,
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

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppPanel {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text("自动预约任务", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "服务端提前准备，到点按候选顺序抢约；冲突换房，繁忙时短时重试。无需保持手机页面打开。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppHeaderIconButton(
                        icon = Icons.Outlined.Add,
                        contentDescription = "新建任务",
                        onClick = {
                            editingTask = null
                            isEditing = true
                            onClearFeedback()
                        },
                        iconTint = MaterialTheme.colorScheme.primary,
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                    )
                }

                if (tasks.isEmpty() && !tasksLoading) {
                    AppEmptyState(
                        title = "还没有自动预约任务",
                        detail = "点击右上角“新建任务”，设置候选空间与时段，系统会在指定时间自动尝试预约抢占。",
                        icon = Icons.Outlined.AutoAwesome,
                    )
                }
            }
        }

        // 任务卡片与标题卡片并列排布，不再嵌套在同一张卡片里。
        val isTablet = useTwoPaneLayout()

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
                                        onToggle = { taskToToggle = task },
                                        onEdit = {
                                            editingTask = task
                                            isEditing = true
                                            onClearFeedback()
                                        },
                                        onCopy = {
                                            editingTask = task.copyForNextRun(LocalDate.now())
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
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    tasks.forEach { task ->
                        AutoTaskCard(
                            task = task,
                            spaces = spaces,
                            isDeleting = deletingTaskId == task.id,
                            onToggle = { taskToToggle = task },
                            onEdit = {
                                editingTask = task
                                isEditing = true
                                onClearFeedback()
                            },
                            onCopy = {
                                editingTask = task.copyForNextRun(LocalDate.now())
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
