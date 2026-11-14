package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusAutoReservationCandidate
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import cn.pxyb.mycontrol.util.DateTimeUtils.formatMinutesToTime
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes
import cn.pxyb.mycontrol.ui.components.layout.AppInsetPanel
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.input.AppPickerField

@Composable
internal fun CandidateEditRow(
    index: Int,
    candidate: CampusAutoReservationCandidate,
    spaces: List<CampusReservationSpace>,
    spacesLoading: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    canDelete: Boolean,
    onUpdate: (CampusAutoReservationCandidate) -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
) {
    var spaceMenuOpen by remember(spacesLoading) { mutableStateOf(false) }
    val selectedSpace = spaces.firstOrNull { it.id == candidate.areaId }
    val spaceName = selectedSpace?.name ?: when {
        candidate.areaId > 0 -> "研讨间 #${candidate.areaId}（已选候选）"
        spacesLoading -> "正在加载研讨间…"
        spaces.isEmpty() -> "暂无候选研讨间"
        else -> "请选择研讨间"
    }
    val spaceOptions = spaces.map { AppSelectOption(it.id, it.name) }.toMutableList().apply {
        if (candidate.areaId > 0 && selectedSpace == null) {
            add(0, AppSelectOption(candidate.areaId, spaceName, "保留此前选择；目标日是否可约以学校执行结果为准"))
        }
    }

    AppInsetPanel {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                        AppHeaderIconButton(icon = Icons.Outlined.ArrowUpward, contentDescription = "上移", onClick = onMoveUp, iconSize = 18.dp)
                    }
                    if (canMoveDown) {
                        AppHeaderIconButton(icon = Icons.Outlined.ArrowDownward, contentDescription = "下移", onClick = onMoveDown, iconSize = 18.dp)
                    }
                    if (canDelete) {
                        AppHeaderIconButton(
                            icon = Icons.Outlined.Delete,
                            contentDescription = "删除",
                            onClick = onDelete,
                            iconSize = 18.dp,
                            iconTint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            AppSelectField(
                label = "候选研讨间",
                value = candidate.areaId,
                options = spaceOptions,
                onValueChange = { onUpdate(candidate.copy(areaId = it)) },
                expanded = spaceMenuOpen,
                onExpandedChange = { spaceMenuOpen = it },
                placeholder = spaceName,
                icon = Icons.Outlined.MeetingRoom,
            )

            var pickingTimeTarget by remember { mutableStateOf<String?>(null) }
            if (pickingTimeTarget != null) {
                val isStart = pickingTimeTarget == "start"
                AppTimePickerModal(
                    title = if (isStart) "选择候选开始时间" else "选择候选结束时间",
                    currentTime = if (isStart) candidate.startTime else candidate.endTime,
                    minTime = if (isStart) CAMPUS_LIBROOM_MIN_START_TIME else CAMPUS_LIBROOM_MIN_END_TIME,
                    maxTime = if (isStart) CAMPUS_LIBROOM_MAX_START_TIME else CAMPUS_LIBROOM_MAX_END_TIME,
                    minuteStep = CAMPUS_LIBROOM_TIME_STEP_MINUTES,
                    onDismiss = { pickingTimeTarget = null },
                    onConfirm = { chosen ->
                        if (isStart) {
                            val newStartMin = parseTimeMinutes(chosen, allowEndOfDay = true)
                            val currEndMin = parseTimeMinutes(candidate.endTime, allowEndOfDay = true)
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
                AppPickerField(
                    label = "开始时间",
                    value = candidate.startTime,
                    onClick = { pickingTimeTarget = "start" },
                    modifier = Modifier.weight(1f),
                )

                Icon(Icons.Outlined.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)

                AppPickerField(
                    label = "结束时间",
                    value = candidate.endTime,
                    onClick = { pickingTimeTarget = "end" },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
